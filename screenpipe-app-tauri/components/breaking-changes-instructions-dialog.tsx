import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import localforage from "localforage";
import { useToast } from "@/components/ui/use-toast";
import { Command } from "@tauri-apps/plugin-shell";

export function BreakingChangesInstructionsDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [hasShownDialog, setHasShownDialog] = useState(false);
  const [hasPipes, setHasPipes] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleResetAllPipes = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`http://localhost:3030/pipes/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        }),
      });
      if(!response.ok){
        toast({
          title: "failed to purge pipes",
          description: "failed to purge pipes, please try again",
          variant: "destructive"
        });
        return;
      }
      toast({
        title: "all pipes deleted",
        description: "you can now reinstall the updated pipes from the store",
      });
      localforage.setItem("has-shown-delete-pipes-dialog", true);
      setOpen(false);
    } catch (error) {
      console.error("failed to reset pipes:", error);
      toast({
        title: "error deleting pipes",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!hasPipes) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[525px] [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <Trash2 className="h-5 w-5" />
            critical update: new pipe system available
          </DialogTitle>
          <DialogDescription className="space-y-4">
            <p>
              we&apos;ve completely redesigned the pipe system from the ground
              up to make it more powerful and efficient. this is a breaking
              change that requires action from you.
            </p>
            <div className="bg-muted p-4 rounded-md space-y-2">
              <p className="font-medium">required actions:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>delete all your existing pipes using the button below</li>
                <li>
                  reinstall the pipes you need from the updated collection
                </li>
              </ol>
            </div>
            <p className="text-sm text-muted-foreground">
              clicking &apos;delete all pipes&apos; will remove all your
              existing pipes. don&apos;t worry, you can reinstall them from the
              store afterwards.
            </p>
            <p className="text-sm text-muted-foreground">
              face any issues? DM us on{" "}
              <a
                href="https://discord.gg/dU9EBuw7Uq"
                target="_blank"
                className="text-blue-500 hover:underline"
              >
                discord
              </a>
              .
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button onClick={handleResetAllPipes} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                deleting...
              </>
            ) : (
              "delete all pipes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
