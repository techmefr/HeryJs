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

/**
 * Values are escaped on the way into the body. They were not, and the values a
 * template carries are exactly the ones that come from a request -- a display
 * name, a company, an order reference -- so anything a user typed reached the
 * recipient's mail client as markup.
 *
 * Escaped here rather than at the call site: a call site that forgets is
 * indistinguishable from one that had nothing to escape, and a template is
 * rendered from more than one place.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolate(
  text: string,
  data: Record<string, string>,
  escape: boolean,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = data[key] ?? '';

    return escape ? escapeHtml(value) : value;
  });
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
    // The subject is plain text in every mail client, so escaping it would
    // show a reader `&amp;` where they wrote `&`.
    subject: interpolate(template.subject, data, false),
    html: interpolate(template.html, data, true),
  };
}

// What the preview route lists. Derived from the templates themselves, so a
// template added without touching this still shows up.
export function templateNames(): string[] {
  return Object.keys(templates);
}
