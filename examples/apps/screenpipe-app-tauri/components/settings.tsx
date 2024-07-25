import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function Settings({
  onKeyChange,
  className,
}: {
  onKeyChange: (key: string) => void;
  className?: string;
}) {
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const savedKey = localStorage.getItem("openaiApiKey");
    if (savedKey) {
      setApiKey(savedKey);
      onKeyChange(savedKey);
    }
  }, [onKeyChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem("openaiApiKey", newKey);
    onKeyChange(newKey);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Settings</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>OpenAI API Settings</DialogTitle>
          <DialogDescription>
            Enter your OpenAI API key to use the chat functionality.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="apiKey" className="text-right">
              API Key
            </Label>
            <Input
              id="apiKey"
              value={apiKey}
              onChange={handleChange}
              className="col-span-3"
              placeholder="Enter your OpenAI API Key"
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an API key? Get one from{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            OpenAI&apos;s website
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
