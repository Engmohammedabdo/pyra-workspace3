import { describe, it, expect } from 'vitest';
import { shouldWriteLeadTouch } from '@/lib/whatsapp/lead-feed';

describe('shouldWriteLeadTouch', () => {
  it('writes when the credited agent OWNS the lead and it is not already logged', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'youssef', creditAgent: 'youssef', alreadyLogged: false })).toBe(true);
  });
  it('does NOT write to a colleague\'s lead', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'omar', creditAgent: 'youssef', alreadyLogged: false })).toBe(false);
  });
  it('fails closed on a null assignee', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: null, creditAgent: 'youssef', alreadyLogged: false })).toBe(false);
  });
  it('does NOT double-write an already-logged message', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'youssef', creditAgent: 'youssef', alreadyLogged: true })).toBe(false);
  });
  it('does NOT write when there is no lead', () => {
    expect(shouldWriteLeadTouch({ leadId: null, leadAssignedTo: null, creditAgent: 'youssef', alreadyLogged: false })).toBe(false);
  });
  it('inbound with no credit agent still writes when the lead has an owner', () => {
    // inbound message: creditAgent may be null, but the customer contacting an
    // owned lead is a real touch — credit the write to the lead owner.
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'youssef', creditAgent: null, alreadyLogged: false, inbound: true })).toBe(true);
  });
});
