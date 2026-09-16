/**
 * The shell every mail shares, so a Mailable writes what it has to say and not
 * the HTML around it. Before this, a second mail meant copying the first one's
 * markup, and the two drifted from the day they were copied.
 *
 * Deliberately one function taking a body rather than a template engine: an
 * email is not a web page, every client renders it differently, and the useful
 * thing a framework can offer is one tested shell rather than a partials
 * system whose output nobody checks in Outlook.
 */
export interface MailLayoutOptions {
  title: string;
  /**
   * Legally required in several countries for anything not transactional, and
   * the reason it is a parameter rather than a constant: only the caller knows
   * which kind of message this is.
   */
  optOut?: { label: string; url: string };
}

// Inline styles and a table-free single column: every mail client strips a
// stylesheet, and half of them still mangle anything wider than one column on
// a phone.
export function mailLayout(body: string, options: MailLayoutOptions): string {
  const optOut = options.optOut
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">
      <a href="${options.optOut.url}" style="color:#6b7280">${options.optOut.label}</a>
    </p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${options.title}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111827">
    <div style="max-width:560px;margin:0 auto;padding:32px;background:#fff;border-radius:8px">
      ${body}
      ${optOut}
    </div>
  </body>
</html>`;
}
