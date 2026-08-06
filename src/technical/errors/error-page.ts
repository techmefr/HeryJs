const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * An error message is not a literal: Nest's own 404 carries the request URL,
 * and a domain exception is free to quote whatever the caller sent. Both land
 * in the markup below, so both are escaped before they get there.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

export function renderErrorPage(
  status: number,
  message: string,
  reference?: string,
): string {
  const safeStatus = escapeHtml(String(status));
  const safeMessage = escapeHtml(message);
  // The one thing worth printing on a 500 page: the id under which the stack
  // was logged, so whoever hit it can quote something the logs can be searched
  // for instead of describing what they were doing.
  const safeReference = reference === undefined ? '' : escapeHtml(reference);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeStatus} - ${safeMessage}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    display: flex;
    min-height: 100vh;
    align-items: center;
    justify-content: center;
    font-family: system-ui, sans-serif;
    background: #fff;
    color: #171717;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a; color: #f5f5f5; }
  }
  h1 { margin: 0 0 0.5rem; font-size: 2.5rem; color: #ea580c; }
  p { margin: 0; color: #737373; font-size: 0.9rem; }
  code { display: block; margin-top: 1rem; color: #a3a3a3; font-size: 0.8rem; }
</style>
</head>
<body>
  <div style="text-align:center">
    <h1>${safeStatus}</h1>
    <p>${safeMessage}</p>${safeReference === '' ? '' : `\n    <code>Reference: ${safeReference}</code>`}
  </div>
</body>
</html>
`;
}
