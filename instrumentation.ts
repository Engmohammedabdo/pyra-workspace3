export async function register() {
  // Validate environment variables on server startup
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env');
  }
}
