import { defineConfig } from 'astro/config';

// Static output on purpose: every page authenticates from the browser with the
// session token, so there is nothing to render on a server and no adapter to
// deploy. The pages are files.
export default defineConfig({
  server: { port: 4322 },
});
