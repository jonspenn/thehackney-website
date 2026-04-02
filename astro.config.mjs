import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  site: 'https://thehackney-website.pages.dev',
  integrations: [sitemap(), react()],
});
