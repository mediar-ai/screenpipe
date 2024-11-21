import React, { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { invoke } from "@tauri-apps/api/core";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Layers, Layout, RefreshCw } from "lucide-react";
import { toast } from "./ui/use-toast";
import { Pipe } from "./pipe-store";
import { SqlAutocompleteInput } from "./sql-autocomplete-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { HelpCircle } from "lucide-react";
import { MemoizedReactMarkdown } from "./markdown";
import { CodeBlock } from "./ui/codeblock";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";

type PipeConfigFormProps = {
  pipe: Pipe;
  onConfigSave: (config: Record<string, any>) => void;
};

type FieldConfig = {
  name: string;
  type: string;
  default: any;
  description: string;
  value: any;
};

export const PipeConfigForm: React.FC<PipeConfigFormProps> = ({
  pipe,
  onConfigSave,
}) => {
  const [config, setConfig] = useState(pipe.config);
  console.log("pipe", pipe);
  console.log("config", config);

  useEffect(() => {
    setConfig(pipe.config);
  }, [pipe]);

  const handleInputChange = (name: string, value: any) => {
    if (!config) return;
    setConfig((prevConfig) => ({
      ...prevConfig,
      fields: prevConfig?.fields?.map((field: FieldConfig) =>
        field.name === name ? { ...field, value } : field
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("submitting config:", config);
    
    if (!config?.fields) {
      console.log("no config fields found, aborting");
      return;
    }

    try {
      toast({
        title: "updating pipe configuration",
        description: "please wait...",
      });

      if (!pipe.id) {
        throw new Error("pipe id is missing");
      }

      const response = await fetch(`http://localhost:3030/pipes/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pipe_id: pipe.id,
          config: config,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`failed to update pipe config: ${errorText}`);
      }

      const result = await response.json();
      console.log("update response:", result);

      onConfigSave(config);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      toast({
        title: "Configuration updated",
        description: "The pipe configuration has been successfully updated.",
      });
    } catch (error) {
      console.error("Error saving pipe config:", error);
      toast({
        title: "Error updating configuration",
        description: "Failed to update pipe configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  const renderConfigInput = (field: FieldConfig) => {
    const value = field?.value ?? field?.default;

    const resetToDefault = () => {
      handleInputChange(field.name, field.default);
    };

    switch (field.type) {
      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value}
              onCheckedChange={(checked) =>
                handleInputChange(field.name, checked)
              }
            />
            <Label htmlFor={field.name}>{field.name}</Label>
          </div>
        );
      case "number":
        return (
          <div className="flex items-center space-x-2">
            <Input
              id={field.name}
              type="number"
              value={value}
              onChange={(e) =>
                handleInputChange(field.name, parseFloat(e.target.value) || 0)
              }
              onWheel={(e) => e.preventDefault()} // prevent scrolling down breaking stuff
              step="any"
              autoCorrect="off"
              spellCheck="false"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetToDefault}
                    className="h-8 w-8"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      case "time":
        return (
          <div className="flex items-center space-x-2">
            <Input
              id={field.name}
              type="time"
              value={value}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              autoCorrect="off"
              spellCheck="false"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetToDefault}
                    className="h-8 w-8"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      case "window":
        return (
          <div className="flex items-center space-x-2 w-full">
            <SqlAutocompleteInput
              className="w-full"
              id={field.name}
              placeholder={`Enter ${field.name}`}
              value={value}
              onChange={(newValue) => handleInputChange(field.name, newValue)}
              type="window"
              icon={<Layout className="h-4 w-4" />}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetToDefault}
                    className="h-8 w-8"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      case "app":
        return (
          <div className="flex items-center space-x-2 w-full">
            <SqlAutocompleteInput
              className="w-full"
              id={field.name}
              placeholder={`Enter ${field.name}`}
              value={value}
              onChange={(newValue) => handleInputChange(field.name, newValue)}
              type="app"
              icon={<Layout className="h-4 w-4" />}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetToDefault}
                    className="h-8 w-8"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      case "contentType":
        return (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Select
                value={value}
                onValueChange={(newValue) =>
                  handleInputChange(field.name, newValue)
                }
              >
                <SelectTrigger id={field.name} className="relative w-full">
                  <Layers
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <SelectValue placeholder="content type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="pl-6">all</span>
                  </SelectItem>
                  <SelectItem value="ocr">
                    <span className="pl-6">ocr</span>
                  </SelectItem>
                  <SelectItem value="audio">
                    <span className="pl-6">audio</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={resetToDefault}
                      className="h-8 w-8"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset to default</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        );
      case "path":
        return (
          <div className="flex items-center space-x-2">
            <Input
              id={field.name}
              type="text"
              value={value}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              autoCorrect="off"
              spellCheck="false"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        const selectedPath = await open({
                          directory: true,
                          multiple: false,
                        });
                        if (selectedPath) {
                          handleInputChange(field.name, selectedPath);
                        }
                      } catch (error) {
                        console.error("failed to select path:", error);
                      }
                    }}
                    className="h-8 w-8"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Select folder</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetToDefault}
                    className="h-8 w-8"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      default:
        return (
          <div className="flex items-center space-x-2">
            <Input
              id={field.name}
              type="text"
              value={value}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              autoCorrect="off"
              spellCheck="false"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetToDefault}
                    className="h-8 w-8"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h3 className="text-lg font-semibold">pipe configuration</h3>
      {config?.fields?.map((field: FieldConfig) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name} className="font-medium">
            {field.name} ({field.type})
          </Label>
          {renderConfigInput(field)}
          <MemoizedReactMarkdown
            className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full"
            remarkPlugins={[remarkGfm, remarkMath]}
            components={{
              p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
              },
              a({ node, href, children, ...props }) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
              code({ node, className, children, ...props }) {
                const content = String(children).replace(/\n$/, "");
                const match = /language-(\w+)/.exec(className || "");

                if (!match) {
                  return (
                    <code
                      className="px-1 py-0.5 rounded-sm font-mono text-sm"
                      {...props}
                    >
                      {content}
                    </code>
                  );
                }

                return (
                  <CodeBlock
                    key={Math.random()}
                    language={(match && match[1]) || ""}
                    value={content}
                    {...props}
                  />
                );
              },
            }}
          >
            {field.description}
          </MemoizedReactMarkdown>
        </div>
      ))}
      {config?.fields && config.fields.length > 0 && (
        <Button type="submit" onClick={handleSubmit}>save configuration</Button>
      )}
    </form>
  );
};
