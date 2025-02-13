import { create } from "zustand";

type StatusDialogStore = {
  isOpen: boolean;
  showError: boolean;
  dismissedAfterError: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setShowError: (showingError: boolean) => void;
};

export const useStatusDialog = create<StatusDialogStore>((set) => ({
  isOpen: false,
  showError: false,
  dismissedAfterError: false,
  open: () => set({ isOpen: true }),
  close: () => set((state) => {
    // if close was called after error, set dismissedAfterError to true
    // this is used to prevent the dialog from being shown again automatically after it has been dismissed manually
    if (state.showError) {
      return { isOpen: false, dismissedAfterError: true };
    }

    return { isOpen: false };
  }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  // this function is primarily used by screenpipe-status/context.tsx 
  // called whenever an error is detected either through permissions state or system health
  setShowError: (showError: boolean) => set((state) => { 
    // if dialog was already dismissed after error, do not do anything
    if (state.dismissedAfterError) return state;

    // if error, open dialog and set showError to true
    if (showError) return { showError: true, isOpen: true };

    // if no error to show, reset dismissedAfterError
    if (!showError) return { showError: false, dismissedAfterError: false };

    return state;
  }),
}));
