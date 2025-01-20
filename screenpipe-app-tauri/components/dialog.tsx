import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

import { create, useStore } from 'zustand';
import { Settings } from "@/modules/settings/settings";

interface DialogState {
    isOpen: boolean;
    openDialog: () => void;
    closeDialog: () => void;
    toggleDialog: () => void;
  }
  
export const useDialogStore = create<DialogState>((set) => ({
    isOpen: false,
    openDialog: () => set({ isOpen: true }),
    closeDialog: () => set({ isOpen: false }),
    toggleDialog: () => set((state) => ({ isOpen: !state.isOpen })),
}));
  

export function SettingsDialog() {
    const isOpen = useDialogStore((state) => state.isOpen)
    const setOpen = useDialogStore((state) => state.toggleDialog)

  return (
    <Dialog open={isOpen} onOpenChange={setOpen} modal>
        <DialogContent
            className="max-w-[80vw] w-full max-h-[80vh] h-full p-0"
        >
            <Settings />
        </DialogContent>
    </Dialog>
  );
}

