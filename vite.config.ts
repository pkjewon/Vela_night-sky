import { defineConfig } from 'vitest/config';

// GitHub Pages 주소가 https://pkjewon.github.io/Vela_night-sky/ 라서 base를 맞춘다.
export default defineConfig({
  base: '/Vela_night-sky/',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
