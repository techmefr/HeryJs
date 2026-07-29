export function renderErrorPage(status: number, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${status} - ${message}</title>
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
</style>
</head>
<body>
  <div style="text-align:center">
    <h1>${status}</h1>
    <p>${message}</p>
  </div>
</body>
</html>
`;
}
