export interface ContractMember {
  name: string;
  isMethod: boolean;
  isReadonly: boolean;
  parameters: string[];
  type: string;
}

export interface DriverContract {
  interfaceName: string;
  members: ContractMember[];
  importedNames: string[];
  externalImports: Array<{ names: string[]; from: string }>;
}

const OPENING = '([{<';
const CLOSING = ')]}>';

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function matchingBrace(source: string, open: number): number {
  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    }

    if (source[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    const isArrow = char === '>' && text[index - 1] === '=';

    if (OPENING.includes(char)) {
      depth += 1;
    }

    if (CLOSING.includes(char) && !isArrow) {
      depth -= 1;
    }

    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  parts.push(current);

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function closingParenthesis(text: string, open: number): number {
  let depth = 0;

  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') {
      depth += 1;
    }

    if (text[index] === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseMember(raw: string): ContractMember | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  const isReadonly = text.startsWith('readonly ');
  const declaration = isReadonly ? text.slice('readonly '.length) : text;
  const method = /^(\w+)\s*\(/.exec(declaration);

  if (method) {
    const open = declaration.indexOf('(');
    const close = closingParenthesis(declaration, open);

    if (close === -1) {
      return null;
    }

    const returned = declaration.slice(close + 1).trim();

    return {
      name: method[1] as string,
      isMethod: true,
      isReadonly,
      parameters: splitTopLevel(declaration.slice(open + 1, close), ','),
      type: returned.startsWith(':') ? returned.slice(1).trim() : 'void',
    };
  }

  const property = /^(\w+)\??\s*:\s*(.+)$/.exec(declaration);

  if (!property) {
    return null;
  }

  return {
    name: property[1] as string,
    isMethod: false,
    isReadonly,
    parameters: [],
    type: (property[2] as string).trim(),
  };
}

export function parseDriverContract(
  source: string,
  moduleName: string,
): DriverContract | null {
  const clean = stripComments(source);
  const declaration =
    new RegExp(
      `export interface (\\w*${moduleNamePattern(moduleName)}\\w*Driver)\\s*\\{`,
      'i',
    ).exec(clean) ?? /export interface (\w+Driver)\s*\{/.exec(clean);

  if (!declaration) {
    return null;
  }

  const open = declaration.index + declaration[0].length - 1;
  const close = matchingBrace(clean, open);

  if (close === -1) {
    return null;
  }

  const body = clean.slice(open + 1, close);
  const members = splitTopLevel(body.replace(/\n/g, ' '), ';').flatMap(
    (raw) => {
      const member = parseMember(raw);
      return member ? [member] : [];
    },
  );

  const exported = [
    ...clean.matchAll(/export (?:interface|type|class|enum) (\w+)/g),
  ].map((match) => match[1] as string);
  const interfaceName = declaration[1] as string;
  const used = exported.filter(
    (name) => name === interfaceName || new RegExp(`\\b${name}\\b`).test(body),
  );

  const externalImports = [
    ...clean.matchAll(/import (?:type )?\{([^}]+)\} from '([^']+)'/g),
  ].flatMap((match) => {
    const names = (match[1] as string)
      .split(',')
      .map((name) => name.trim())
      .filter(
        (name) => name.length > 0 && new RegExp(`\\b${name}\\b`).test(body),
      );

    return names.length > 0 ? [{ names, from: match[2] as string }] : [];
  });

  return {
    interfaceName,
    members,
    importedNames: [...new Set(used)].sort(),
    externalImports,
  };
}

function moduleNamePattern(moduleName: string): string {
  return moduleName.replace(/[^a-zA-Z0-9]/g, '');
}

const MAX_LINE = 80;

function stubFor(member: ContractMember, className: string): string {
  const parameters = member.parameters.map((parameter) =>
    parameter.startsWith('_') ? parameter : `_${parameter}`,
  );
  const message = `${className}.${member.name} is not implemented yet`;
  const body = member.type.startsWith('Promise<')
    ? `return Promise.reject(new Error('${message}'));`
    : `throw new Error('${message}');`;
  const inline = `  ${member.name}(${parameters.join(', ')}): ${member.type} {`;
  const signature =
    inline.length <= MAX_LINE
      ? inline
      : `  ${member.name}(\n${parameters.map((parameter) => `    ${parameter},`).join('\n')}\n  ): ${member.type} {`;

  return `${signature}\n    ${body}\n  }`;
}

function propertyFor(member: ContractMember): string {
  const modifier = member.isReadonly ? 'readonly ' : '';

  if (member.type === 'string') {
    return `  ${modifier}${member.name} = '';`;
  }

  return `  ${modifier}${member.name}!: ${member.type};`;
}

export interface DriverFiles {
  className: string;
  moduleClassName: string;
  driverFileName: string;
  moduleFileName: string;
  driverSource: string;
  moduleSource: string;
}

export function renderDriver(
  contract: DriverContract,
  moduleKebab: string,
  driverPascal: string,
  driverKebab: string,
  modulePascal: string,
): DriverFiles {
  const className = `${driverPascal}${modulePascal}Driver`;
  const moduleClassName = `${driverPascal}${modulePascal}Module`;
  const contractPath = `#technical/${moduleKebab}/${moduleKebab}-driver`;
  const baseName = `${driverKebab}-${moduleKebab}`;
  const members = contract.members
    .map((member) =>
      member.isMethod ? stubFor(member, className) : propertyFor(member),
    )
    .join('\n\n');
  const imports = [
    `import type { ${contract.importedNames.join(', ')} } from '${contractPath}';`,
    ...contract.externalImports.map(
      (entry) =>
        `import type { ${entry.names.join(', ')} } from '${entry.from}';`,
    ),
  ].join('\n');

  return {
    className,
    moduleClassName,
    driverFileName: `${baseName}.driver.ts`,
    moduleFileName: `${baseName}.module.ts`,
    driverSource: `import { Injectable } from '@nestjs/common';\n${imports}\n\n@Injectable()\nexport class ${className} implements ${contract.interfaceName} {\n${members}\n}\n`,
    moduleSource: `import { Global, Module } from '@nestjs/common';\nimport { driverToken } from '@heryjs/core/drivers';\nimport { ${className} } from './${baseName}.driver';\n\nconst TOKEN = driverToken('${moduleKebab}', '${driverKebab}');\n\n@Global()\n@Module({\n  providers: [\n    ${className},\n    { provide: TOKEN, useExisting: ${className} },\n  ],\n  exports: [TOKEN],\n})\nexport class ${moduleClassName} {}\n`,
  };
}
