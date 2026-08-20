import { describe, it, expect } from 'vitest';
import { resolveOutgoingAgent } from '@/lib/whatsapp/attribution';

describe('resolveOutgoingAgent', () => {
  it('prefers the explicit system-send actor', () => {
    expect(resolveOutgoingAgent({ actorUsername: 'youssef', lineHolder: 'sara', conversationAssignee: 'omar' })).toBe('youssef');
  });
  it('falls back to the line holder (colour line) when no actor', () => {
    expect(resolveOutgoingAgent({ lineHolder: 'youssef', conversationAssignee: 'omar' })).toBe('youssef');
  });
  it('falls back to the conversation assignee (shared line, no holder)', () => {
    expect(resolveOutgoingAgent({ lineHolder: null, conversationAssignee: 'omar' })).toBe('omar');
  });
  it('returns null when nothing is known (unassigned shared-line)', () => {
    expect(resolveOutgoingAgent({})).toBeNull();
  });
  it('treats empty strings as absent', () => {
    expect(resolveOutgoingAgent({ actorUsername: '', lineHolder: 'youssef' })).toBe('youssef');
  });
});
