export interface MakeableContext {
  pascalName: string;
  kebabName: string;
}

export function mailableFile(ctx: MakeableContext): string {
  return `import type { Mailable, MailMessage } from '#technical/mail/mail-driver';

export class ${ctx.pascalName} implements Mailable {
  constructor(readonly to: string) {}

  build(): MailMessage {
    return {
      to: this.to,
      subject: '${ctx.pascalName}',
      html: '<p>Write what ${ctx.pascalName} says here.</p>',
    };
  }
}
`;
}

export function exportableFile(ctx: MakeableContext): string {
  return `import type { Exportable, ExportRow } from '#technical/export/export-driver';

export class ${ctx.pascalName} implements Exportable {
  readonly filename = '${ctx.kebabName}';

  readonly columns: readonly string[] = ['id', 'name'];

  rows(): ExportRow[] {
    return [];
  }
}
`;
}
