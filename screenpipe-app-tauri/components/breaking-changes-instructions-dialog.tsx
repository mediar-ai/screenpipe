import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import localforage from "localforage";

export function BreakingChangesInstructionsDialog() {
  const [open, setOpen] = useState(false);
  const [hasShownDialog, setHasShownDialog] = useState(false);
  const [hasPipes, setHasPipes] = useState(false);

  useEffect(() => {
    const init = async () => {
      const shown = await localforage.getItem("has-shown-delete-pipes-dialog");
      setHasShownDialog(!!shown);

      try {
        const response = await fetch("http://localhost:3030/pipes/list");
        const data = await response.json();
        setHasPipes(data.data.length > 0);
      } catch (error) {
        console.error("failed to check pipes:", error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!hasShownDialog && hasPipes) {
      setOpen(true);
      localforage.setItem("has-shown-delete-pipes-dialog", true);
    }
  }, [hasShownDialog, hasPipes]);

  if (!hasPipes) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <Trash2 className="h-5 w-5" />
            major update: please reinstall all pipes
          </DialogTitle>
          <DialogDescription>
            we&apos;ve made significant changes to the pipe system. to ensure
            everything works correctly, please delete all your existing pipes
            and reinstall them. you can do this by clicking the trash icon in
            the pipe store.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
