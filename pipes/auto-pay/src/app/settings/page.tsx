'use client';

import { useSettings } from '@/hooks/use-settings';

export default function Home() {
  const { settings, isLoading, error, updateSettings } = useSettings();

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  if (error) {
    return <div>Error loading settings: {error.message}</div>;
  }

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Auto Pay Settings</h1>
      <pre className="bg-gray-100 p-4 rounded">
        {JSON.stringify(settings, null, 2)}
      </pre>
    </main>
  );
} 