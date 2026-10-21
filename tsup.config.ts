import { defineConfig } from 'tsup';

// One package, several entry points → subpath exports (./api, ./player, ./ui, ./glas).
export default defineConfig({
  entry: {
    'api/index': 'src/api/index.ts',
    'player/index': 'src/player/index.ts',
    'ui/index': 'src/ui/index.ts',
    'glas/index': 'src/glas/index.ts',
  },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
