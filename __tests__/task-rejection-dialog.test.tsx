import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import boardsMessages from '@/messages/en/boards.json';
import { TaskRejectionDialog } from '@/components/boards/task-rejection-dialog';

afterEach(cleanup);

describe('TaskRejectionDialog', () => {
  it('has no default classification and requires both a choice and a note', async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(
      <NextIntlClientProvider locale="en" messages={boardsMessages}>
        <TaskRejectionDialog
          open
          isSubmitting={false}
          feedsQualityScore
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>,
    );

    const revision = screen.getByRole('radio', { name: /Revision required/i });
    const outright = screen.getByRole('radio', { name: /Outright rejection/i });
    const confirm = screen.getByRole('button', { name: /Confirm rejection/i });

    expect(revision).toHaveAttribute('aria-checked', 'false');
    expect(outright).toHaveAttribute('aria-checked', 'false');
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Review note/i), {
      target: { value: 'The submitted version must be rebuilt.' },
    });
    expect(confirm).toBeDisabled();

    fireEvent.click(outright);
    expect(outright).toHaveAttribute('aria-checked', 'true');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({
      note: 'The submitted version must be rebuilt.',
      rejection_kind: 'outright',
    });
  });

  it('does not claim a non-production rejection feeds the monthly quality score', () => {
    render(
      <NextIntlClientProvider locale="en" messages={boardsMessages}>
        <TaskRejectionDialog
          open
          isSubmitting={false}
          feedsQualityScore={false}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/documented review decision/i)).toBeInTheDocument();
    expect(screen.queryByText(/monthly quality score/i)).not.toBeInTheDocument();
  });

  it('is the only rejection entry point in the task sheet and forwards the explicit marker', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/boards/task-sheet.tsx'), 'utf8');

    expect(source).toContain("import { TaskRejectionDialog");
    expect(source).toContain('<TaskRejectionDialog');
    expect(source).toMatch(/handleReject\s*=\s*async\s*\(input:\s*TaskRejectionInput\)/);
    expect(source).toContain("data: { action: 'reject', ...input }");
    expect(source).toContain('getTaskRejectionActivityDisplay');
    expect(source).toContain('rejectionDisplay.kind');
    expect(source).toContain('rejectionDisplay.note');
    expect(source).not.toContain('const [rejectNote');
    expect(source).not.toContain('const [showReject');
  });
});
