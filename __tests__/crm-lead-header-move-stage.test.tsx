/**
 * The «نقل لمرحلة» button's visibility and disabled states on the lead header. // i18n-exempt: doc comment
 *
 * These are the access-control rows of the manual QA matrix expressed as
 * assertions: an employee (no leads.move_stage) must never see the control,
 * and the two states where the move is refused must say why rather than
 * failing on the server.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import crmMessages from '@/messages/en/crm.json';
import type { PyraSalesLead } from '@/types/database';

vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => false, // quotes.create — keeps the quote CTA out of the way
  useAnyPermission: () => false,
}));

import { LeadHeader } from '@/components/crm/lead-detail/lead-header';

const LEAD = {
  id: 'sl_1',
  name: 'Acme Co',
  company: null,
  phone: null,
  email: null,
  stage_id: 'stg_new_inquiry',
  lead_type: null,
  priority: 'normal',
  win_probability: 0,
  client_id: null,
  archived_at: null,
} as unknown as PyraSalesLead;

function renderHeader(props: {
  canMoveStage?: boolean;
  moveStageDisabledReason?: string | null;
  onMoveStage?: () => void;
}) {
  render(
    <NextIntlClientProvider locale="en" messages={crmMessages}>
      <LeadHeader
        lead={LEAD}
        onMoveStage={props.onMoveStage ?? vi.fn()}
        canMoveStage={props.canMoveStage}
        moveStageDisabledReason={props.moveStageDisabledReason ?? null}
      />
    </NextIntlClientProvider>,
  );
}

const moveButton = () => screen.queryByRole('button', { name: /Move stage/i });

afterEach(cleanup);

describe('lead header — move stage button', () => {
  it('is hidden for a user without leads.move_stage', () => {
    renderHeader({ canMoveStage: false });
    expect(moveButton()).toBeNull();
  });

  it('is hidden when no handler is wired', () => {
    render(
      <NextIntlClientProvider locale="en" messages={crmMessages}>
        <LeadHeader lead={LEAD} canMoveStage />
      </NextIntlClientProvider>,
    );
    expect(moveButton()).toBeNull();
  });

  it('is enabled for a user who can move stages', () => {
    renderHeader({ canMoveStage: true });
    expect(moveButton()).toBeInTheDocument();
    expect(moveButton()).not.toBeDisabled();
  });

  it('is disabled with the reason when the deal is archived', () => {
    renderHeader({
      canMoveStage: true,
      moveStageDisabledReason: 'This deal is archived — unarchive it first',
    });
    expect(moveButton()).toBeDisabled();
    expect(
      screen.getByTitle('This deal is archived — unarchive it first'),
    ).toBeInTheDocument();
  });

  it('is disabled with the reason when the deal is won and the user cannot reopen', () => {
    renderHeader({
      canMoveStage: true,
      moveStageDisabledReason: 'This deal is closed — only an admin can reopen it',
    });
    expect(moveButton()).toBeDisabled();
    expect(
      screen.getByTitle('This deal is closed — only an admin can reopen it'),
    ).toBeInTheDocument();
  });
});
