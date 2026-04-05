/**
 * WhatsApp notification helpers — sound + desktop notifications.
 *
 * Uses the Web Audio API for notification sounds and
 * the Notification API for desktop notifications.
 */

const STORAGE_KEY = 'wa-notification-prefs';

interface NotificationPrefs {
  soundEnabled: boolean;
  desktopEnabled: boolean;
}

function getPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return { soundEnabled: true, desktopEnabled: true };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return { soundEnabled: true, desktopEnabled: true };
}

export function setNotificationPrefs(prefs: Partial<NotificationPrefs>) {
  if (typeof window === 'undefined') return;
  const current = getPrefs();
  const updated = { ...current, ...prefs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

// Shared AudioContext singleton to prevent resource leaks
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContext();
  }
  return sharedAudioCtx;
}

/**
 * Play a simple notification beep using the Web Audio API.
 * No external sound file needed.
 */
export function playNotificationSound() {
  const prefs = getPrefs();
  if (!prefs.soundEnabled) return;

  try {
    const audioCtx = getAudioCtx();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch {
    // Audio not supported or blocked
  }
}

/**
 * Request desktop notification permission.
 * Returns the permission state.
 */
export async function requestDesktopPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Show a desktop notification.
 */
export function showDesktopNotification(
  title: string,
  body: string,
  onClick?: () => void
) {
  const prefs = getPrefs();
  if (!prefs.desktopEnabled) return;

  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // Don't show if tab is focused
  if (document.hasFocus()) return;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      tag: 'whatsapp-message',
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick?.();
    };

    // Auto-close after 5s
    setTimeout(() => notification.close(), 5000);
  } catch {
    // Notification API not supported or blocked
  }
}
