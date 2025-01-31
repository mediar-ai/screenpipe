import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, FolderOpen, Puzzle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { PublishDialog } from '../publish-dialog';
import { PipeStorePlugin } from '@/lib/api/store';

interface AddPipeFormProps {
  onAddPipe: (url: string) => Promise<any>;
  onLoadFromLocalFolder: (setNewRepoUrl: (url: string) => void) => Promise<any>;
  isHealthy: boolean;
}

export const AddPipeForm: React.FC<AddPipeFormProps> = ({
  onAddPipe,
  onLoadFromLocalFolder,
  isHealthy,
}) => {
  const [newRepoUrl, setNewRepoUrl] = useState('');

  return (
    <div className="border rounded-lg p-4 space-y-3 w-[50%] mx-auto">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            type="url"
            placeholder={
              !isHealthy
                ? 'screenpipe not running...'
                : 'enter github url or local path'
            }
            value={newRepoUrl}
            onChange={(e) => setNewRepoUrl(e.target.value)}
            autoCorrect="off"
            autoComplete="off"
            disabled={!isHealthy}
          />
        </div>
        <Button
          onClick={() => onAddPipe(newRepoUrl)}
          disabled={!newRepoUrl || !isHealthy}
          size="icon"
          className="h-10 w-10"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => onLoadFromLocalFolder(setNewRepoUrl)}
          variant="outline"
          size="icon"
          className="h-10 w-10"
          disabled={!isHealthy}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">
        <a
          href="https://docs.screenpi.pe/docs/plugins"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline flex items-center gap-1"
        >
          <Puzzle className="h-3 w-3" />
          learn how to create your own pipe
        </a>
      </div>
    </div>
  );
}; 