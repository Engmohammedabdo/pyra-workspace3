import { act, render } from '@testing-library/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryProvider } from '@/components/providers/query-provider';

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

let authListener: AuthListener | null = null;
const unsubscribe = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (listener: AuthListener) => {
        authListener = listener;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  }),
}));

let client: QueryClient;
function QueryClientProbe() {
  client = useQueryClient();
  return null;
}

describe('QueryProvider authentication boundary', () => {
  beforeEach(() => {
    authListener = null;
    unsubscribe.mockClear();
  });

  it('clears all own-scope cache on sign out', () => {
    const view = render(
      <QueryProvider><QueryClientProbe /></QueryProvider>,
    );
    expect(authListener).not.toBeNull();

    act(() => authListener?.('INITIAL_SESSION', { user: { id: 'alice' } }));
    client.setQueryData(['currentUser'], { username: 'alice', role: 'employee' });
    client.setQueryData(['deductions', 'me'], { employee: { username: 'alice', salary: 1 } });

    act(() => authListener?.('SIGNED_OUT', null));

    expect(client.getQueryData(['currentUser'])).toBeUndefined();
    expect(client.getQueryData(['deductions', 'me'])).toBeUndefined();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('clears cached identity when a different account signs in', () => {
    render(<QueryProvider><QueryClientProbe /></QueryProvider>);
    act(() => authListener?.('INITIAL_SESSION', { user: { id: 'alice' } }));
    client.setQueryData(['currentUser'], { username: 'alice', role: 'employee' });
    client.setQueryData(['deductions', 'me'], { employee: { username: 'alice', salary: 1 } });

    act(() => authListener?.('SIGNED_IN', { user: { id: 'bob' } }));

    expect(client.getQueryData(['currentUser'])).toBeUndefined();
    expect(client.getQueryData(['deductions', 'me'])).toBeUndefined();
  });
});
