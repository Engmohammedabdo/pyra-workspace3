import { describe, it, expect } from 'vitest';
import {
  PIPELINE_FINAL_STAGES,
  PIPELINE_TERMINAL_STAGE_IDS,
  STAGE_NOT_INTERESTED,
} from '@/lib/constants/statuses';

// This file is the ONLY guard on the owner's 2026-08-07 decision to pin the
// "not interested" stage id in code instead of adding an `is_terminal` column
// to pyra_sales_pipeline_stages. If someone removes the constant or drops it
// from the terminal list, these tests are what tells them.
describe('PIPELINE_TERMINAL_STAGE_IDS', () => {
  it('pins the production id of the custom «غير مهتم» stage', () => {
    expect(STAGE_NOT_INTERESTED).toBe('ps_zT_9mNvS8qxMq-7d');
  });

  it('includes the not-interested stage', () => {
    expect(PIPELINE_TERMINAL_STAGE_IDS).toContain(STAGE_NOT_INTERESTED);
  });

  it('still includes every seeded final stage', () => {
    for (const stage of PIPELINE_FINAL_STAGES) {
      expect(PIPELINE_TERMINAL_STAGE_IDS).toContain(stage);
    }
  });

  it('does NOT include «لا يرد» — a no-answer lead still needs chasing', () => {
    expect(PIPELINE_TERMINAL_STAGE_IDS).not.toContain('ps_e-w41Um9opZvPTPf');
  });

  it('has no duplicates', () => {
    expect(new Set(PIPELINE_TERMINAL_STAGE_IDS).size).toBe(
      PIPELINE_TERMINAL_STAGE_IDS.length,
    );
  });
});
