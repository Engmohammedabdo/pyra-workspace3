import { describe, expect, it } from 'vitest';
import { selectUndeliverableRecipients } from '@/lib/notifications/notify';

describe('selectUndeliverableRecipients', () => {
  it('drops recipients whose user row is not active', () => {
    const undeliverable = selectUndeliverableRecipients(
      ['sayed', 'youssef'],
      [
        { username: 'sayed', status: 'inactive' },
        { username: 'youssef', status: 'active' },
      ],
    );

    expect(undeliverable.has('sayed')).toBe(true);
    expect(undeliverable.has('youssef')).toBe(false);
  });

  it('drops every non-active status, not just "inactive"', () => {
    // The auth gates use `status !== 'active'`, so ANY other value is denied
    // access. This predicate must agree with them for every value.
    const undeliverable = selectUndeliverableRecipients(
      ['a', 'b', 'c', 'd'],
      [
        { username: 'a', status: 'suspended' },
        { username: 'b', status: null },
        { username: 'c', status: 'Active' },
        { username: 'd', status: '' },
      ],
    );

    expect([...undeliverable].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps a recipient with no user row rather than swallowing it', () => {
    // recipient_username has no foreign key and prod holds orphan assignees.
    // An unknown username is a missing-validation defect upstream — dropping
    // it here would hide that defect instead of surfacing it.
    const undeliverable = selectUndeliverableRecipients(
      ['ghost'],
      [],
    );

    expect(undeliverable.has('ghost')).toBe(false);
  });

  it('returns nothing to drop when every recipient is active', () => {
    const undeliverable = selectUndeliverableRecipients(
      ['youssef', 'abdou'],
      [
        { username: 'youssef', status: 'active' },
        { username: 'abdou', status: 'active' },
      ],
    );

    expect(undeliverable.size).toBe(0);
  });

  it('ignores rows for users that were not requested', () => {
    const undeliverable = selectUndeliverableRecipients(
      ['youssef'],
      [
        { username: 'youssef', status: 'active' },
        { username: 'sayed', status: 'inactive' },
      ],
    );

    expect(undeliverable.size).toBe(0);
  });

  it('handles an empty recipient list', () => {
    expect(selectUndeliverableRecipients([], []).size).toBe(0);
  });
});
