'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';

export interface MyWorkTaskItem {
  id: string;
  title: string;
  due_date: string | null;
  board_id: string;
  board_name: string;
  column_name: string;
  is_done_column: boolean;
}

export interface MyWorkLeaveItem {
  id: string;
  username: string;
  display_name: string;
  type: string;
  start_date: string;
  end_date: string;
  days_count: number;
}

export interface MyWorkExpenseItem {
  id: string;
  description: string | null;
  amount: number;
  currency: string;
  vendor: string | null;
  submitted_by: string;
}

export interface MyWorkTimesheetItem {
  id: string;
  username: string;
  display_name: string;
  period_start: string;
  period_end: string;
  total_hours: number | null;
}

export interface MyWorkConversationItem {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  last_message_at: string | null;
  unread_count: number;
}

export interface MyWorkLeadItem {
  id: string;
  full_name: string;
  status: string;
  last_contact_at: string | null;
  phone: string | null;
}

export interface MyWorkFollowUpItem {
  id: string;
  title: string;
  scheduled_for: string;
  lead_id: string | null;
  lead_name: string | null;
}

export interface MyWorkResponse {
  tasks: {
    overdue: MyWorkTaskItem[];
    today: MyWorkTaskItem[];
    this_week: MyWorkTaskItem[];
  };
  approvals_waiting: {
    leave: MyWorkLeaveItem[];
    expense: MyWorkExpenseItem[];
    timesheet: MyWorkTimesheetItem[];
    total: number;
  };
  conversations: { unread: MyWorkConversationItem[] };
  leads: { needs_action: MyWorkLeadItem[] };
  follow_ups: { due: MyWorkFollowUpItem[] };
  counts: {
    tasks_total: number;
    approvals_total: number;
    conversations_unread: number;
    leads_action: number;
    follow_ups_due: number;
  };
}

export function useMyWork() {
  return useQuery<MyWorkResponse>({
    queryKey: ['my-work'],
    queryFn: () => fetchAPI('/api/my-work'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
