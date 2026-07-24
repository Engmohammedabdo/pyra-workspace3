import { describe, it, expect } from 'vitest';
import { isConnectedCall } from '@/lib/calls/match';

describe('isConnectedCall', () => {
  it('treats an answered outgoing call as connected', () => {
    expect(isConnectedCall({ direction: 'outgoing', duration_seconds: 42 })).toBe(true);
  });
  it('treats an answered incoming call as connected', () => {
    expect(isConnectedCall({ direction: 'incoming', duration_seconds: 7 })).toBe(true);
  });
  it('treats a 0-second outgoing dial as NOT connected (nobody picked up)', () => {
    expect(isConnectedCall({ direction: 'outgoing', duration_seconds: 0 })).toBe(false);
  });
  it('treats a 0-second incoming call as NOT connected', () => {
    expect(isConnectedCall({ direction: 'incoming', duration_seconds: 0 })).toBe(false);
  });
  it('treats a missed call as NOT connected regardless of duration', () => {
    expect(isConnectedCall({ direction: 'missed', duration_seconds: 30 })).toBe(false);
  });
  it('treats a negative/garbage duration as NOT connected', () => {
    expect(isConnectedCall({ direction: 'outgoing', duration_seconds: -1 })).toBe(false);
  });
});
