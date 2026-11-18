import { defineConfig } from 'vite';
import { version } from './package.json';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (e.g. /<user>/<tool>/), not only the site root.
  base: './',
  // The package version, shown small in the bottom-right corner of the screen.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    // `npm run server` in a second terminal answers the leaderboard API during development.
    proxy: { '/api': `http://localhost:${process.env.PORT || 5034}` },
  },
});
