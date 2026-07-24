'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const authenticatedUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user.id ?? null;

      if (event === 'INITIAL_SESSION') {
        authenticatedUserId.current = nextUserId;
        return;
      }
      if (event === 'SIGNED_OUT') {
        authenticatedUserId.current = null;
        queryClient.clear();
        return;
      }
      if (event === 'SIGNED_IN') {
        if (authenticatedUserId.current !== nextUserId) {
          queryClient.clear();
        }
        authenticatedUserId.current = nextUserId;
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient, supabase]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
