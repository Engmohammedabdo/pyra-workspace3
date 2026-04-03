import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test the schema shape (without actually validating process.env)
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  NEXT_PUBLIC_STORAGE_BUCKET: z.string().default('pyraai-workspace'),
  STRIPE_SECRET_KEY: z.string().optional(),
  EVOLUTION_API_URL: z.string().url().optional(),
});

describe('Env Validation Schema', () => {
  it('accepts valid env vars', () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.test',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.role',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required vars', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'validkey1234',
      SUPABASE_SERVICE_ROLE_KEY: 'validkey1234',
    });
    expect(result.success).toBe(false);
  });

  it('allows optional Stripe keys to be missing', () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'validkey1234',
      SUPABASE_SERVICE_ROLE_KEY: 'validkey1234',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.STRIPE_SECRET_KEY).toBeUndefined();
    }
  });

  it('provides default for storage bucket', () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'validkey1234',
      SUPABASE_SERVICE_ROLE_KEY: 'validkey1234',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_STORAGE_BUCKET).toBe('pyraai-workspace');
    }
  });
});
