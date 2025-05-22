import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export const HOME_TAB_ID = "home";

export interface PipeTab {
  id: string;
  title: string;
  port?: number; // Optional for home tab
  url?: string;  // Optional for home tab
}

interface TabsContextProps {
  tabs: PipeTab[];
  activeTabId: string | null;
  addTab: (tab: PipeTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

const initialHomeTab: PipeTab = { id: HOME_TAB_ID, title: "Home" };

const TabsContext = createContext<TabsContextProps>({
  tabs: [initialHomeTab],
  activeTabId: HOME_TAB_ID,
  addTab: () => {},
  removeTab: () => {},
  setActiveTab: () => {},
});

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<PipeTab[]>([initialHomeTab]);
  const [activeTabId, setActiveTabId] = useState<string | null>(HOME_TAB_ID);

  const addTab = (tab: PipeTab) => {
    if (tab.id === HOME_TAB_ID) {
      setActiveTabId(HOME_TAB_ID);
      return;
    }
    const existingTab = tabs.find((t) => t.id === tab.id);
    if (existingTab) {
      setActiveTabId(tab.id);
      return;
    }
    setTabs((prevTabs) => [...prevTabs, tab]);
    setActiveTabId(tab.id);
  };

  const removeTab = useCallback((id: string) => {
    if (id === HOME_TAB_ID) {
      return; // Don't remove the home tab
    }
    setTabs((prevTabs) => {
      const tabToRemove = prevTabs.find(tab => tab.id === id);
      if (!tabToRemove) {
        return prevTabs; // Tab doesn't exist, return unchanged
      }

      const newTabs = prevTabs.filter((tab) => tab.id !== id);
      
      // Make sure we always navigate to a valid tab
      if (activeTabId === id) {
        // Find the previous tab in the list, or the first non-home tab, or home tab as last resort
        const currentIndex = prevTabs.findIndex(tab => tab.id === id);
        const previousTab = prevTabs[currentIndex - 1];
        const firstNonHomeTab = newTabs.find(tab => tab.id !== HOME_TAB_ID);
        
        if (previousTab && previousTab.id !== HOME_TAB_ID) {
          setActiveTabId(previousTab.id);
        } else if (firstNonHomeTab) {
          setActiveTabId(firstNonHomeTab.id);
        } else {
          setActiveTabId(HOME_TAB_ID);
        }
      }
      
      return newTabs;
    });
  }, [activeTabId]);

  const setActiveTab = (id: string) => {
    setActiveTabId(id);
  };
  
  // Add cmd+w keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Command+W (Mac) or Control+W (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
        // If only the home tab is left, don't prevent default
        // Let the native window close handler take care of it
        if (tabs.length === 1 && tabs[0].id === HOME_TAB_ID) {
          return;
        }
        
        // For all other cases, prevent the default browser behavior
        event.preventDefault();
        event.stopPropagation();
        
        // If we have an active tab and it's not the home tab, close it
        if (activeTabId && activeTabId !== HOME_TAB_ID) {
          removeTab(activeTabId);
        } else {
          // If for some reason we're on the home tab with multiple tabs open,
          // find the most recently added tab and close it
          const lastTab = tabs.find(tab => tab.id !== HOME_TAB_ID);
          if (lastTab) {
            removeTab(lastTab.id);
          }
        }
      }
    };

    // Use capture phase to ensure we get the event before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [tabs, activeTabId, removeTab]); // Include removeTab in dependencies

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeTabId,
        addTab,
        removeTab,
        setActiveTab,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
};

export const useTabs = () => useContext(TabsContext); 