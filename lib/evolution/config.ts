/**
 * Evolution API configuration.
 *
 * Environment variables:
 *   EVOLUTION_API_URL  – e.g. https://evo.pyramedia.info
 *   EVOLUTION_API_KEY  – global API key for Evolution API
 */

export const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || 'https://evo.pyramedia.info';

export const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
