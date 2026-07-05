import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    // .claude/worktrees/ holds checkouts from parallel agent sessions —
    // without this exclude their test copies run too (inflated counts, and
    // a stale failing worktree would break the suite for everyone).
    exclude: [...configDefaults.exclude, '**/.claude/**', '**/.next/**'],
    setupFiles: ['./__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
