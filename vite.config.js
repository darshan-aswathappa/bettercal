import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest-setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js'],
    },
  },
});
