import { useEffect, useState } from 'react';
import { parseKeyboardShortcut } from '@/lib/utils';
import { platform, type Platform } from '@tauri-apps/plugin-os';

interface ShortcutDisplayProps {
  shortcut: string;
}

export function ShortcutDisplay({ shortcut }: ShortcutDisplayProps) {
  const currentPlatform = platform();
  const displayText = parseKeyboardShortcut(shortcut, currentPlatform);
  return <span className="truncate text-sm">{displayText}</span>;
}
