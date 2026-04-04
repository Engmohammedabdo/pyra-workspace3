import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // Downgrade pre-existing issues to warnings (don't block build)
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'prefer-const': 'warn',
    },
  },

  // ── Pattern Guard Rails ──────────────────────────────
  {
    files: ['components/**/*.{ts,tsx}', 'app/**/*-client.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'warn',
        {
          name: 'fetch',
          message:
            'Use fetchAPI/mutateAPI from hooks/api-helpers.ts instead of raw fetch(). Raw fetch is only allowed for FormData uploads and blob downloads.',
        },
      ],
    },
  },

  // Block LTR-only CSS classes in TSX files (RTL violations)
  {
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/\\b(ml-|mr-|pl-|pr-|text-left|text-right|border-l-|border-r-|rounded-l-|rounded-r-|float-left|float-right)\\b/]',
          message:
            'RTL violation: use ms-/me-/ps-/pe-/text-start/text-end/border-s-/border-e-/rounded-s-/rounded-e-/float-start/float-end instead.',
        },
      ],
    },
  },
];

export default config;
