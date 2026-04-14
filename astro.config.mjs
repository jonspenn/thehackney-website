import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  site: 'https://thehackney-website.pages.dev',
  integrations: [
    sitemap({
      // Exclude internal/hidden routes from the public sitemap.
      // /reports/* is the internal click-tracking dashboard for Hugo
      // and James and must NEVER be discoverable by search engines.
      // /admin/* is the combined dashboard, protected by Cloudflare Access.
      // Add any new private paths to this filter.
      filter: (page) => !page.includes("/reports/") && !page.includes("/admin/"),
    }),
    react(),
  ],
});
