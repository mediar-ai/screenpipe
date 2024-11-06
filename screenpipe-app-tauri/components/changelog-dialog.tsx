import React, { useEffect, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { LucideX } from "lucide-react";

export const ChangelogDialog: React.FC = () => {
  const [changelogContent, setChangelogContent] = useState<string>("");
  const { showChangelogDialog, setShowChangelogDialog } = useChangelogDialog();
  console.log("🚀 ~ showChangelogDialog:", showChangelogDialog)

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
        <ReactMarkdown className="max-w-max prose prose-medium prose-slate w-full h-full">{changelogContent}</ReactMarkdown>
      </DialogContent>
    </Dialog>
  );
};