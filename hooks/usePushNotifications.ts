'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';

export type PushState = 'loading' | 'unsupported' | 'config-missing' | 'blocked' | 'disabled' | 'enabled';

interface VapidKeyResponse {
  enabled: boolean;
  publicKey: string | null;
}

function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setState(subscription ? 'enabled' : 'disabled');
  }, []);

  useEffect(() => {
    refresh().catch(() => setState('disabled'));
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!isPushSupported()) {
      setState('unsupported');
      throw new Error('Push notifications are not supported');
    }

    setIsBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setState('blocked');
        throw new Error('Notification permission is blocked');
      }
      if (permission !== 'granted') {
        setState('disabled');
        throw new Error('Notification permission was not granted');
      }

      const key = await fetchAPI<VapidKeyResponse>('/api/push/vapid-public-key');
      if (!key.enabled || !key.publicKey) {
        setState('config-missing');
        throw new Error('Web Push is not configured');
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(key.publicKey),
      });

      await mutateAPI('/api/push/subscriptions', 'POST', subscription.toJSON());
      setState('enabled');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }

    setIsBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await mutateAPI('/api/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState('disabled');
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { state, isBusy, enable, disable, refresh };
}
