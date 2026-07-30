interface MailTemplate {
  subject: string;
  html: string;
}

const templates: Record<string, MailTemplate> = {
  welcome: {
    subject: 'Welcome to {{app}}',
    html: '<p>Hi {{name}}, welcome to {{app}}.</p>',
  },
};

function interpolate(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] ?? '');
}

export function renderTemplate(
  name: string,
  data: Record<string, string> = {},
): { subject: string; html: string } {
  const template = templates[name];
  if (!template) {
    throw new Error(`Unknown mail template "${name}"`);
  }

  return {
    subject: interpolate(template.subject, data),
    html: interpolate(template.html, data),
  };
}
