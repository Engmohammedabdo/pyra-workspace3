export interface FollowUp {
  id: string;
  lead_id: string;
  quote_id?: string;
  title?: string;
  notes?: string;
  due_at: string;
  status: string;
  assigned_to?: string;
  completed_at?: string;
  created_at: string;
}

export type FollowUpFilter = 'pending' | 'completed' | 'cancelled' | 'all';
