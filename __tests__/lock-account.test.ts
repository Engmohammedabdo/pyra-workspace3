import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/auth/auth-mapping', () => ({
  resolveAuthUserId: vi.fn(),
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: vi.fn() }));

import { resolveAuthUserId } from '@/lib/auth/auth-mapping';
import { lockAccount, unlockAccount } from '@/lib/hr/lock-account';

const makeClient = (updateResult: { error: { message: string } | null }) =>
  ({ auth: { admin: { updateUserById: vi.fn().mockResolvedValue(updateResult) } } } as unknown as SupabaseClient);

describe('lockAccount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bans the resolved auth user and returns locked:true', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue('uid-123');
    const client = makeClient({ error: null });
    const res = await lockAccount(client, 'sayed');
    expect(res).toEqual({ locked: true });
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith('uid-123', { ban_duration: '876000h' });
  });

  it('returns locked:false when the mapping cannot be resolved, without calling GoTrue', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const client = makeClient({ error: null });
    const res = await lockAccount(client, 'ghost');
    expect(res.locked).toBe(false);
    expect(res.error).toBe('no_auth_mapping');
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('returns locked:false with the message when GoTrue errors, never throws', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue('uid-123');
    const client = makeClient({ error: { message: 'gotrue down' } });
    const res = await lockAccount(client, 'sayed');
    expect(res).toEqual({ locked: false, error: 'gotrue down' });
  });

  it('unlockAccount lifts the ban with ban_duration none', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue('uid-123');
    const client = makeClient({ error: null });
    const res = await unlockAccount(client, 'sayed');
    expect(res).toEqual({ unlocked: true });
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith('uid-123', { ban_duration: 'none' });
  });
});
