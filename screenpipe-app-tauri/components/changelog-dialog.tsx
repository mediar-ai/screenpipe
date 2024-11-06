import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { MemoizedReactMarkdown } from "./markdown";

export const ChangelogDialog: React.FC = () => {
  const [changelogContent, setChangelogContent] = useState<string>("");
  const { showChangelogDialog, setShowChangelogDialog } = useChangelogDialog();

  useEffect(() => {
    const fetchChangelog = async () => {
      const response = await fetch("/CHANGELOG.md");
      const text = await response.text();
      setChangelogContent(text);
    };

    fetchChangelog();
  }, []);

  const onClose = () => setShowChangelogDialog(false);

  return (
    <Dialog open={showChangelogDialog} onOpenChange={onClose} >
      <DialogContent className="w-11/12 max-w-6xl p-6 h-[80vh] overflow-auto">
        <div className="max-w-max prose prose-medium prose-slate w-full h-full">
          <h1>Changelog</h1>
          <MemoizedReactMarkdown>{changelogContent}</MemoizedReactMarkdown>
        </div>
      </DialogContent>
    </Dialog>
  );
};