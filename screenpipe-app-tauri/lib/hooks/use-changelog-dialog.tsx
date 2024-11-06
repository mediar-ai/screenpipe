import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import localforage from "localforage";
import { getVersion } from "@tauri-apps/api/app";

interface ChangelogDialogContextType {
  showChangelogDialog: boolean;
  setShowChangelogDialog: (show: boolean) => void;
}

const ChangelogDialogContext = createContext<ChangelogDialogContextType | undefined>(undefined);

export const ChangelogDialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showChangelogDialog, setShowChangelogDialog] = useState(false);
  const hasMounted = useRef(false);

  useEffect(() => {
    const checkChangelogStatus = async () => {
      const version = await getVersion();
      const versionSeen = await localforage.getItem<string>("versionSeen");

      if (versionSeen === undefined || versionSeen !== version) {
        setShowChangelogDialog(true);
      }
    };
    checkChangelogStatus();
  }, []);

  useEffect(() => {
    if (hasMounted.current) {
      const setCurrentVersion = async () => {
        const currentVersion = await getVersion();
        await localforage.setItem("versionSeen", currentVersion);
      };

      if (!showChangelogDialog) {
        setCurrentVersion();
      }
    } else {
      hasMounted.current = true;
    }
  }, [showChangelogDialog]);

  return (
    <ChangelogDialogContext.Provider value={{ showChangelogDialog, setShowChangelogDialog }}>
      {children}
    </ChangelogDialogContext.Provider>
  );
};

export const useChangelogDialog = (): ChangelogDialogContextType => {
  const context = useContext(ChangelogDialogContext);
  if (context === undefined) {
    throw new Error("useChangelogDialog must be used within a ChangelogDialogProvider");
  }
  return context;
};