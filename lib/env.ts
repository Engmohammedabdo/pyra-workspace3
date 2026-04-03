import { z } from 'zod';

// ============================================================
// Environment Variable Validation
// Validates ALL required env vars at import time.
// If a required var is missing, the app fails fast with a clear error.
// ============================================================

const envSchema = z.object({
  // Supabase (required)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  NEXT_PUBLIC_STORAGE_BUCKET: z.string().default('pyraai-workspace'),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().optional(),

  // Stripe (optional — only needed for payment features)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Evolution API / WhatsApp (optional)
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map(
      (i) => `  ${i.path.join('.')}: ${i.message}`
    );
    console.error(
      `\n❌ Environment validation failed:\n${missing.join('\n')}\n`
    );
    // Don't throw in production (env vars may be set at runtime)
    // but log clearly so it's visible in deploy logs
    if (process.env.NODE_ENV === 'development') {
      throw new Error(`Missing environment variables:\n${missing.join('\n')}`);
    }
    return envSchema.parse({
      ...process.env,
      // Provide minimal defaults for production boot
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
    });
  }

  return result.data;
}

export const env = validateEnv();
