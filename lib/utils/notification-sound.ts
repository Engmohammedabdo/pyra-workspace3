'use client';

const STORAGE_KEY = 'pyra_notification_sound';

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== 'off'; // default ON
}

export function setNotificationSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
}

/**
 * Two-tone ascending chime via Web Audio — no audio asset needed.
 * Browsers block audio before the first user gesture; failures are ignored
 * (the visual badge + desktop notification still fire).
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined' || !isNotificationSoundEnabled()) return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    tone(880, 0, 0.18);       // A5
    tone(1174.66, 0.15, 0.22); // D6
    setTimeout(() => { ctx.close().catch(() => undefined); }, 900);
  } catch {
    // audio unavailable — ignore
  }
}
