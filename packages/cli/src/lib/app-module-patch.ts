export const APP_MODULE = 'src/app.module.ts';

export interface UnwiredModule {
  source: string;
  className: string;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Takes a module's class out of AppModule: its import line and its entry in
 * `imports`, whether bare or configured (`SsoModule.forRoot()`). The class
 * name is read from the import rather than derived from the module's name,
 * since `oauth` is wired as OAuthModule and no casing rule gets there.
 * Undefined when AppModule does not import from the module at all.
 */
export function unwireModule(
  source: string,
  moduleName: string,
): UnwiredModule | undefined {
  const importLine = new RegExp(
    `^import \\{ (\\w+) \\} from '#modules/${escaped(moduleName)}/[^']+';\\n`,
    'm',
  );
  const found = importLine.exec(source);
  const className = found?.[1];

  if (found === null || className === undefined) {
    return undefined;
  }

  const entry = new RegExp(`^\\s*${className}(?:\\.\\w+\\([^)]*\\))?,\\n`, 'm');

  return {
    source: source.replace(found[0], '').replace(entry, ''),
    className,
  };
}
