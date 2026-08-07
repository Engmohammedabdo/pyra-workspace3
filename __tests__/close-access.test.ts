import { describe, it, expect, vi } from 'vitest';
import { classifyCloseAccess, type OpenFollowUp, type LoadFollowUpResult } from '@/lib/crm/close-follow-up';

const openFollowUp: OpenFollowUp = {
  id: 'fu_1',
  lead_id: 'lead_1',
  assigned_to: 'ahmed.s',
  status: 'pending',
  title: 'اتصال متابعة',
  due_at: '2026-08-10T10:00:00.000Z',
};

const closedFollowUp: OpenFollowUp = {
  ...openFollowUp,
  id: 'fu_2',
  status: 'completed',
};

describe('classifyCloseAccess', () => {
  it('returns server_error on db_error and never calls isOwner', () => {
    const loaded: LoadFollowUpResult = { ok: false, reason: 'db_error' };
    const isOwner = vi.fn(() => true);

    const result = classifyCloseAccess(loaded, isOwner);

    expect(result).toEqual({ kind: 'server_error' });
    expect(isOwner).not.toHaveBeenCalled();
  });

  it('returns forbidden on not_found and never calls isOwner', () => {
    const loaded: LoadFollowUpResult = { ok: false, reason: 'not_found' };
    const isOwner = vi.fn(() => true);

    const result = classifyCloseAccess(loaded, isOwner);

    expect(result).toEqual({ kind: 'forbidden' });
    expect(isOwner).not.toHaveBeenCalled();
  });

  it('returns forbidden when already_closed and isOwner is false', () => {
    const loaded: LoadFollowUpResult = { ok: false, reason: 'already_closed', followUp: closedFollowUp };
    const isOwner = vi.fn(() => false);

    const result = classifyCloseAccess(loaded, isOwner);

    expect(result).toEqual({ kind: 'forbidden' });
    expect(isOwner).toHaveBeenCalledTimes(1);
  });

  it('returns already_done with the row when already_closed and isOwner is true', () => {
    const loaded: LoadFollowUpResult = { ok: false, reason: 'already_closed', followUp: closedFollowUp };
    const isOwner = vi.fn(() => true);

    const result = classifyCloseAccess(loaded, isOwner);

    expect(result).toEqual({ kind: 'already_done', followUp: closedFollowUp });
  });

  it('returns forbidden when open (ok: true) and isOwner is false', () => {
    const loaded: LoadFollowUpResult = { ok: true, followUp: openFollowUp };
    const isOwner = vi.fn(() => false);

    const result = classifyCloseAccess(loaded, isOwner);

    expect(result).toEqual({ kind: 'forbidden' });
    expect(isOwner).toHaveBeenCalledTimes(1);
  });

  it('returns proceed with the row when open (ok: true) and isOwner is true', () => {
    const loaded: LoadFollowUpResult = { ok: true, followUp: openFollowUp };
    const isOwner = vi.fn(() => true);

    const result = classifyCloseAccess(loaded, isOwner);

    expect(result).toEqual({ kind: 'proceed', followUp: openFollowUp });
  });

  it('passes the loaded row itself to isOwner so the predicate can inspect it', () => {
    const loaded: LoadFollowUpResult = { ok: true, followUp: openFollowUp };
    const isOwner = vi.fn((fu: OpenFollowUp) => fu.lead_id === 'lead_1' && fu.assigned_to === 'ahmed.s');

    const result = classifyCloseAccess(loaded, isOwner);

    expect(isOwner).toHaveBeenCalledWith(openFollowUp);
    expect(result).toEqual({ kind: 'proceed', followUp: openFollowUp });
  });

  it('a caller-specific predicate (lead_id + assigned_to) rejects a mismatched lead_id', () => {
    const loaded: LoadFollowUpResult = { ok: true, followUp: openFollowUp };
    const isOwner = vi.fn((fu: OpenFollowUp) => fu.lead_id === 'some_other_lead' && fu.assigned_to === 'ahmed.s');

    const result = classifyCloseAccess(loaded, isOwner);

    expect(result).toEqual({ kind: 'forbidden' });
  });
});
