import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (e.g. /<user>/<tool>/), not only the site root.
  base: './',
  server: {
    // `npm run server` in a second terminal answers the leaderboard API during development.
    proxy: { '/api': `http://localhost:${process.env.PORT || 5034}` },
  },
});
