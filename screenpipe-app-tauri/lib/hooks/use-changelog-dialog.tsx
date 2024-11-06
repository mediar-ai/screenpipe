import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import localforage from "localforage";
import { useAppVersion } from "./use-app-version";

interface ChangelogDialogContextType {
  showChangelogDialog: boolean;
  setShowChangelogDialog: (show: boolean) => void;
}

const ChangelogDialogContext = createContext<ChangelogDialogContextType | undefined>(undefined);

export const ChangelogDialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showChangelogDialog, setShowChangelogDialog] = useState(false);
  const hasMounted = useRef(false);
  const version = useAppVersion();

  useEffect(() => {
    const checkChangelogStatus = async () => {
      const versionSeen = await localforage.getItem<string>("versionSeen");

      if (versionSeen === undefined || versionSeen !== version) {
        setShowChangelogDialog(true);
      }
    };
    checkChangelogStatus();
  }, [version]);

  useEffect(() => {
    if (hasMounted.current) {
      const setCurrentVersion = async () => {
        await localforage.setItem("versionSeen", version);
      };

      if (!showChangelogDialog) {
        setCurrentVersion();
      }
    } else {
      hasMounted.current = true;
    }
  }, [showChangelogDialog, version]);

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