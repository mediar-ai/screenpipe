import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { PipeStoreMarkdown } from '@/components/pipe-store-markdown';
import { PipeWithStatus } from './types';

interface PipeDetailsProps {
  pipe: PipeWithStatus;
  onClose: () => void;
}

export const PipeDetails: React.FC<PipeDetailsProps> = ({ pipe, onClose }) => {
  return (
    <div className="p-4 space-y-4">
      <Button variant="ghost" onClick={onClose} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>
      <h2 className="text-2xl font-bold">{pipe.name}</h2>
      <div className="prose dark:prose-invert max-w-none">
        <PipeStoreMarkdown content={pipe.description || ''} />
      </div>
    </div>
  );
}; 