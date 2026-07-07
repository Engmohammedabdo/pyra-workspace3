import { isIP } from 'net';

const ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
];

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isValidPushEndpoint(endpoint: string): boolean {
  try {
    if (endpoint.length > 2048) return false;
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase();
    if (!hostname || hostname === 'localhost' || isIP(hostname)) return false;

    return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) =>
      hostMatchesSuffix(hostname, suffix),
    );
  } catch {
    return false;
  }
}
