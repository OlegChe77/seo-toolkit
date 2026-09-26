import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import siteConfig from './site.config.js';
import sitePlugin, { pageInputs } from './plugins/site-plugin.js';

const siteUrl = (process.env.SITE_URL || siteConfig.url).replace(/\/+$/, '');
const site = { ...siteConfig, url: siteUrl };

export default defineConfig({
  appType: 'mpa',
  plugins: [sitePlugin(site)],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rolldownOptions: {
      input: pageInputs(fileURLToPath(new URL('.', import.meta.url))),
    },
  },
});
