# HeryJs docs

The documentation site, built with Astro and Starlight.

```
pnpm --filter docs dev      # local dev server at localhost:4321
pnpm --filter docs build    # production build to docs/dist/
pnpm --filter docs preview  # preview the production build
```

Content lives in `src/content/docs/`; each Markdown or MDX file there is a route. The sidebar structure is defined in `astro.config.mjs`.
