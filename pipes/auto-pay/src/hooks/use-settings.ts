'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Settings, UpdateSettingsParams } from '@/types/settings';

interface UseSettingsResult {
  settings: Settings | undefined;
  isLoading: boolean;
  error: Error | null;
  updateSettings: (params: UpdateSettingsParams) => Promise<void>;
  isUpdating: boolean;
}

export function useSettings(): UseSettingsResult {
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      return response.json();
    },
  });

  const { mutateAsync: updateSettings, isPending: isUpdating } = useMutation({
    mutationFn: async (params: UpdateSettingsParams) => {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    isUpdating,
  };
} 