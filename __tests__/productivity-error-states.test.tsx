import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import hrMessages from '@/messages/en/hr.json';
import myworkMessages from '@/messages/en/mywork.json';
import statusMessages from '@/messages/en/statuses.json';

const mocks = vi.hoisted(() => ({
  taskListQuery: {
    data: undefined as unknown,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  },
  myProductivityQuery: {
    data: undefined as unknown,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  },
  reportQuery: {
    data: undefined as unknown,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  },
  trendsQuery: {
    data: undefined as unknown,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: () => mocks.taskListQuery };
});

vi.mock('@/hooks/useProductivity', () => ({
  useMyProductivity: () => mocks.myProductivityQuery,
  useProductivityReport: () => mocks.reportQuery,
  useProductivityTrends: () => mocks.trendsQuery,
}));

vi.mock('@/hooks/useDeadlineClock', () => ({
  useDeadlineClock: () => '2026-07-21T10:00:00.000Z',
  resolveTaskDeadlineDisplay: vi.fn(),
}));

import MyTasksClient from '@/app/dashboard/my-tasks/my-tasks-client';
import { MyProductivityCard } from '@/components/dashboard/MyProductivityCard';
import { ProductivityClient } from '@/app/dashboard/hr/productivity/productivity-client';
import { ProductivityTrendChart } from '@/components/hr/productivity/ProductivityTrendChart';

function renderWithMessages(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ ...hrMessages, ...myworkMessages, ...statusMessages }}
    >
      {node}
    </NextIntlClientProvider>,
  );
}

describe('productivity and task query error states', () => {
  beforeEach(() => {
    mocks.taskListQuery.refetch.mockClear();
    mocks.myProductivityQuery.refetch.mockClear();
    mocks.reportQuery.refetch.mockClear();
    mocks.trendsQuery.refetch.mockClear();
  });

  afterEach(cleanup);

  it('shows a localized retry state on the employee my-tasks page', () => {
    renderWithMessages(<MyTasksClient session={{} as never} />);

    expect(screen.getByText("Couldn't load your tasks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(mocks.taskListQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a compact localized error card for employee productivity', () => {
    renderWithMessages(<MyProductivityCard />);

    expect(screen.getByText("Couldn't load your productivity")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(mocks.myProductivityQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a retry state when the admin productivity report fails', () => {
    renderWithMessages(<ProductivityClient />);

    expect(screen.getByText("Couldn't load the productivity report")).toBeInTheDocument();
    const retry = screen.getAllByRole('button', { name: 'Try Again' })[1];
    fireEvent.click(retry);
    expect(mocks.reportQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a distinct retry state when productivity trends fail', () => {
    renderWithMessages(
      <ProductivityTrendChart
        trends={undefined}
        isLoading={false}
        isError
        onRetry={mocks.trendsQuery.refetch}
      />,
    );

    expect(screen.getByText("Couldn't load productivity trends")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(mocks.trendsQuery.refetch).toHaveBeenCalledTimes(1);
  });
});
