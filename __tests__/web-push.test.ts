import { describe, expect, it } from 'vitest';
import { isValidPushEndpoint } from '@/lib/notifications/push-endpoint';

describe('isValidPushEndpoint', () => {
  it('allows known browser push providers over HTTPS', () => {
    expect(isValidPushEndpoint('https://fcm.googleapis.com/fcm/send/example')).toBe(true);
    expect(isValidPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example')).toBe(true);
    expect(isValidPushEndpoint('https://bn1.notify.windows.com/w/?token=example')).toBe(true);
    expect(isValidPushEndpoint('https://webpush.push.apple.com/Q/example')).toBe(true);
  });

  it('rejects endpoints that could be used for server-side request forgery', () => {
    expect(isValidPushEndpoint('http://fcm.googleapis.com/fcm/send/example')).toBe(false);
    expect(isValidPushEndpoint('https://localhost/push')).toBe(false);
    expect(isValidPushEndpoint('https://127.0.0.1/push')).toBe(false);
    expect(isValidPushEndpoint('https://10.0.0.5/push')).toBe(false);
    expect(isValidPushEndpoint('https://metadata.google.internal/push')).toBe(false);
    expect(isValidPushEndpoint('https://fcm.googleapis.com.evil.test/fcm/send/example')).toBe(false);
  });
});
