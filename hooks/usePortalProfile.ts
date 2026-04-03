'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

export interface ClientProfile {
  name: string;
  email: string;
  phone: string | null;
  company: string;
  [key: string]: unknown;
}

export function usePortalProfile() {
  return useQuery<ClientProfile>({
    queryKey: ['portal', 'profile'],
    queryFn: () => fetchAPI('/api/portal/profile'),
    staleTime: 120_000,
  });
}

export function useUpdatePortalProfile() {
  const queryClient = useQueryClient();
  return useMutation<ClientProfile, Error, Partial<ClientProfile>>({
    mutationFn: (data) => mutateAPI('/api/portal/profile', 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'profile'] });
    },
  });
}
