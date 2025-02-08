import { create } from "zustand";

interface SettingsDialogStore {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const useSettingsDialog = create<SettingsDialogStore>((set) => ({
  isOpen: false,
  setIsOpen: (open) => set({ isOpen: open }),
}));
