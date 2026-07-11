import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Pinned to Vite 7 (rollup + esbuild): the rolldown-based Vite 8 mis-bundles
// maplibre-gl's self-contained web worker — the worker blob references
// out-of-scope hoisted helpers ("GV is not defined" minified, "f is not
// defined" unminified), GeoJSON sources silently produce no tiles, and the
// red-line boundary never renders. Production-only; dev serves unbundled
// modules so it works there. Re-test the boundary layer on a production
// build before moving back to Vite 8.
export default defineConfig({
  plugins: [react()],
})
