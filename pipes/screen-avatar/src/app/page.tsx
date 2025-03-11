"use client";

import dynamic from 'next/dynamic';

const StreamingAvatarDemo = dynamic(
  () => import('@/components/streaming-avatar').then(mod => mod.StreamingAvatarDemo),
  { ssr: false }
);

export default function Page() {
  return (
    <div className="container mx-auto p-4">
      <StreamingAvatarDemo 
      />
    </div>
  );
}
