'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore, fetchSettings, updateSettings } from '@/lib/settings';

export function useSettings() {
  const queryClient = useQueryClient();
  const setSettings = useSettingsStore((state) => state.setSettings);

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const data = await fetchSettings();
      setSettings(data);
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return {
    settings,
    isLoading,
    error,
    updateSettings: mutation.mutate,
    isUpdating: mutation.isPending,
  };
} 