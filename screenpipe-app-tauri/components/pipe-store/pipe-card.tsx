import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Puzzle } from 'lucide-react';
import { PipeStoreMarkdown } from '@/components/pipe-store-markdown';
import { PipeWithStatus } from './types';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '@/components/ui/use-toast';

interface PipeCardProps {
  pipe: PipeWithStatus;
  onInstall: (pipe: PipeWithStatus) => Promise<void>;
  onClick: (pipe: PipeWithStatus) => void;
}

const truncateDescription = (description: string, maxLines: number = 4) => {
    if (!description) return "";
    const cleaned = description.replace(/Â/g, "").trim();
  
    // Split into lines and track codeblock state
    const lines = cleaned.split(/\r?\n/);
    let inCodeBlock = false;
    let visibleLines: string[] = [];
    let lineCount = 0;
  
    for (const line of lines) {
      // Check for codeblock markers
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        visibleLines.push(line);
        continue;
      }
  
      // If we're in a codeblock, include the line
      if (inCodeBlock) {
        visibleLines.push(line);
        continue;
      }
  
      // For non-codeblock content, count lines normally
      if (lineCount < maxLines) {
        visibleLines.push(line);
        if (line.trim()) lineCount++;
      }
    }
  
    // If we ended inside a codeblock, close it
    if (inCodeBlock) {
      visibleLines.push("```");
    }
  
    const result = visibleLines.join("\n");
    return lineCount >= maxLines ? result + "..." : result;
  };
  
export const PipeCard: React.FC<PipeCardProps> = ({ pipe, onInstall, onClick }) => {
  const handleOpenWindow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (pipe.installedConfig?.port) {
        await invoke('open_pipe_window', {
          port: pipe.installedConfig.port,
          title: pipe.id,
        });
      }
    } catch (err) {
      console.error('failed to open pipe window:', err);
      toast({
        title: 'error opening pipe window',
        description: 'please try again or check the logs',
        variant: 'destructive',
      });
    }
  };

  return (
    <div
      className="border rounded-lg p-4 hover:bg-muted/40 transition-colors cursor-pointer"
      onClick={() => onClick(pipe)}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{pipe.name}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">by {pipe.developer_accounts.developer_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {pipe.isInstalled ? (
              pipe.installedConfig?.port && pipe.installedConfig.enabled ? (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleOpenWindow}
                  disabled={!pipe.isRunning}
                  className="hover:bg-muted"
                >
                  <Puzzle className="h-3.5 w-3.5" />
                </Button>
              ) : null
            ) : (
              <Button
                size="icon"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onInstall(pipe);
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="text-sm text-muted-foreground mt-2 flex-1 line-clamp-3">
          <PipeStoreMarkdown
            content={truncateDescription(pipe.description || '')}
            variant="compact"
          />
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {pipe.plugin_analytics.downloads_count != null && (
            <span className="mr-2">{pipe.plugin_analytics.downloads_count} downloads</span>
          )}
          {pipe.created_at && (
            <span>Updated {new Date(pipe.created_at).toLocaleDateString()}</span>
          )}
        </div>
        {pipe.is_paid && (
          <div className="text-xs text-muted-foreground mt-2">
            requires {pipe.price} credits
          </div>
        )}
      </div>
    </div>
  );
}; 