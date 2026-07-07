import { createPrivateKey, createSign } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isValidPushEndpoint } from '@/lib/notifications/push-endpoint';

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidPublicKey(): string | null {
  return (
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    null
  );
}

function getVapidConfig(): VapidConfig | null {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY || null;
  const subject =
    process.env.VAPID_SUBJECT ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'mailto:admin@pyramedia.cloud';

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function toBase64Url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function createVapidJwt(endpoint: string, config: VapidConfig): string {
  const publicKey = fromBase64Url(config.publicKey);
  const privateKey = fromBase64Url(config.privateKey);

  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 public key');
  }

  const key = createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicKey.subarray(1, 33)),
      y: toBase64Url(publicKey.subarray(33, 65)),
      d: toBase64Url(privateKey),
    },
  });

  const aud = new URL(endpoint).origin;
  const header = toBase64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = toBase64Url(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject,
  }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${body}`);
  signer.end();
  return `${header}.${body}.${toBase64Url(signer.sign({ key, dsaEncoding: 'ieee-p1363' }))}`;
}

async function markPushSuccess(id: string) {
  const supabase = createServiceRoleClient();
  await supabase
    .from('pyra_push_subscriptions')
    .update({
      last_success_at: new Date().toISOString(),
      failure_count: 0,
      disabled_at: null,
    })
    .eq('id', id);
}

async function markPushFailure(
  id: string,
  disabled: boolean,
) {
  const supabase = createServiceRoleClient();
  await supabase
    .from('pyra_push_subscriptions')
    .update({
      last_failure_at: new Date().toISOString(),
      disabled_at: disabled ? new Date().toISOString() : null,
    })
    .eq('id', id);
}

async function sendSubscriptionPush(
  subscription: PushSubscriptionRow,
  config: VapidConfig,
) {
  try {
    if (!isValidPushEndpoint(subscription.endpoint)) {
      await markPushFailure(subscription.id, true);
      return;
    }

    const token = createVapidJwt(subscription.endpoint, config);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: '86400',
        Urgency: 'normal',
        Authorization: `vapid t=${token}, k=${config.publicKey}`,
      },
    });

    if (response.ok) {
      await markPushSuccess(subscription.id);
      return;
    }

    await markPushFailure(subscription.id, response.status === 404 || response.status === 410);
  } catch (err) {
    console.error('[web-push] send failed:', err);
    await markPushFailure(subscription.id, false);
  }
}

export async function sendWebPushToUsers(
  usernames: string[],
): Promise<void> {
  const config = getVapidConfig();
  const uniqueUsernames = Array.from(new Set(usernames.map((u) => u.trim()).filter(Boolean)));
  if (!config || uniqueUsernames.length === 0) return;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_push_subscriptions')
      .select('id, endpoint')
      .in('username', uniqueUsernames)
      .is('disabled_at', null);

    if (error || !data?.length) {
      if (error) console.error('[web-push] subscription lookup failed:', error.message);
      return;
    }

    await Promise.allSettled(
      (data as PushSubscriptionRow[]).map((subscription) =>
        sendSubscriptionPush(subscription, config),
      ),
    );
  } catch (err) {
    console.error('[web-push] dispatch failed:', err);
  }
}

export async function sendWebPushToUser(
  username: string,
): Promise<void> {
  await sendWebPushToUsers([username]);
}
