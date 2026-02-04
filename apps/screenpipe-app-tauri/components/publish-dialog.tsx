import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, ExternalLink } from "lucide-react";
import { toast } from "./ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { PipeWithStatus } from "./pipe-store/types";

interface PublishDialogProps {
  app: PipeWithStatus | null;
}

export const PublishDialog: React.FC<PublishDialogProps> = ({ app }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(app?.id || "");
  const [description, setDescription] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [price, setPrice] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [githubUsername, setGithubUsername] = useState("");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      const host = "https://screenpi.pe";
      // const host = "http://localhost:3001";

      const response = await fetch(`${host}/api/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          githubUrl,
          price: parseFloat(price),
          githubUsername,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error("failed to publish");

      setIssueUrl(data.issueUrl);
      toast({
        title: "submission received",
        description: "we'll review your app and add it to the store soon",
      });
    } catch (error) {
      console.error("failed to publish:", error);
      toast({
        title: "error publishing app",
        description: "please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setOpen(true)}
              variant="outline"
              size="icon"
              className="h-10 w-10"
            >
              <Upload className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>publish to store</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>publish to store</DialogTitle>
            <DialogDescription>
              submit your app to the screenpipe community store
            </DialogDescription>
          </DialogHeader>

          {issueUrl ? (
            <div className="py-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-lg font-medium">
                  submission successful!
                </div>
                <p className="text-sm text-muted-foreground">
                  your app has been submitted for review
                </p>
              </div>
              <Button className="w-full" onClick={() => openUrl(issueUrl)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                view submission status
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  setIssueUrl(null);
                  // Reset other form fields
                  setName("");
                  setDescription("");
                  setGithubUrl("");
                  setGithubUsername("");
                }}
              >
                close
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-awesome-app"
                    autoCorrect="off"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="what does your app do?"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="github">github repository url</Label>
                  <div className="flex gap-2">
                    <Input
                      id="github"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/username/repo"
                      autoCorrect="off"
                      autoComplete="off"
                    />
                    <Button
                      variant="outline"
                      onClick={() => openUrl("https://github.com/new")}
                      size="icon"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">price (soon)</Label>
                  <Input
                    id="price"
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="github-username">github username</Label>
                  <Input
                    id="github-username"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    placeholder="your github username"
                    autoCorrect="off"
                    autoComplete="off"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    !name ||
                    !description ||
                    !githubUrl ||
                    !githubUsername ||
                    isSubmitting
                  }
                >
                  {isSubmitting ? "submitting..." : "submit for review"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
