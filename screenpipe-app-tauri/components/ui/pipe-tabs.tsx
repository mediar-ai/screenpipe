"use client"

import React from 'react';
import { useTabs, PipeTab, HOME_TAB_ID } from '@/lib/hooks/use-tabs';
import { X, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PipeStore } from '../pipe-store';

export const PipeTabsComponent: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTabs();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-end overflow-x-auto bg-black/5 backdrop-blur-md p-1 border-b border-neutral-700/50 shadow-sm">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => removeTab(tab.id)}
            isHomeTab={tab.id === HOME_TAB_ID}
          />
        ))}
      </div>
      <div className="flex-1 overflow-hidden bg-neutral-900">
        {tabs.map((tab) => (
          <TabContent
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isHomeTab={tab.id === HOME_TAB_ID}
          />
        ))}
      </div>
    </div>
  );
};

interface TabButtonProps {
  tab: PipeTab;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  isHomeTab: boolean;
}

const TabButton: React.FC<TabButtonProps> = ({ tab, isActive, onClick, onClose, isHomeTab }) => {
  return (
    <div
      className={cn(
        "flex items-center pl-4 pr-3 h-12 min-w-[120px] max-w-[200px] cursor-pointer select-none transition-all duration-200 ease-in-out",
        "border-t border-x border-transparent",
        "rounded-t-lg",
        isActive
          ? "bg-neutral-800/70 border-neutral-700/60 text-green-400 shadow-md -mb-px transform scale-105 z-10"
          : "bg-neutral-800/30 text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200"
      )}
      onClick={onClick}
      title={tab.title}
    >
      {isHomeTab && <Home className="h-4 w-4 mr-2 flex-shrink-0" />}
      <span className="truncate mr-2 text-sm font-medium">{tab.title}</span>
      {!isHomeTab && (
        <button
          className="ml-auto p-1 rounded-full hover:bg-neutral-600/50 text-neutral-500 hover:text-neutral-100 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Close tab"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

interface TabContentProps {
  tab: PipeTab;
  isActive: boolean;
  isHomeTab: boolean;
}

const TabContent: React.FC<TabContentProps> = ({ tab, isActive, isHomeTab }) => {
  if (!isActive) return null;

  if (isHomeTab) {
    return (
      <div className="w-full h-full overflow-y-auto p-4 bg-neutral-900 text-neutral-100">
        <PipeStore />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-neutral-850">
      <iframe
        src={tab.url}
        className="w-full h-full border-0"
        title={tab.title}
      />
    </div>
  );
}; 