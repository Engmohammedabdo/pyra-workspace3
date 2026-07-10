import { describe, it, expect } from 'vitest';
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_STYLES,
} from '@/lib/constants/statuses';

describe('attendance status constants', () => {
  it('has a label for every status value', () => {
    for (const v of Object.values(ATTENDANCE_STATUS)) {
      expect(ATTENDANCE_STATUS_LABELS[v]).toBeTruthy();
    }
  });
  it('has a style for every status value', () => {
    for (const v of Object.values(ATTENDANCE_STATUS)) {
      expect(ATTENDANCE_STATUS_STYLES[v]).toBeTruthy();
    }
  });
  it('includes the seven known statuses', () => {
    expect(Object.values(ATTENDANCE_STATUS).sort()).toEqual(
      ['absent', 'early_leave', 'excused', 'holiday', 'late', 'present', 'weekend'],
    );
  });
});
