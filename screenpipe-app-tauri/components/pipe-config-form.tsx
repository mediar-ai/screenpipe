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
import { Layout, RefreshCw } from "lucide-react";
import { toast } from "./ui/use-toast";
import { Pipe } from "./pipe-store";
import { SqlAutocompleteInput } from "./sql-autocomplete-input";

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

  const handleInputChange = (name: string, value: any) => {
    if (!config) return;
    setConfig((prevConfig) => ({
      ...prevConfig,
      fields: prevConfig?.fields.map((field: FieldConfig) =>
        field.name === name ? { ...field, value } : field
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting config:", config);
    try {
      toast({
        title: "Updating pipe configuration",
        description: "Please wait...",
      });

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
        throw new Error("Failed to update pipe config");
      }

      onConfigSave(config || {});

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
      <h3 className="text-lg font-semibold">Pipe Configuration</h3>
      {config?.fields.map((field: FieldConfig) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name} className="font-medium">
            {field.name} ({field.type})
          </Label>
          {renderConfigInput(field)}
          <p className="text-sm text-gray-500">{field.description}</p>
        </div>
      ))}
      <Button type="submit">Save Configuration</Button>
    </form>
  );
};
