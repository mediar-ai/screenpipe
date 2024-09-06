import React, { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Pipe } from "@/lib/hooks/use-pipes";
import { invoke } from "@tauri-apps/api/core";

type PipeConfigFormProps = {
  pipe: Pipe;
  onConfigSave: (config: Record<string, any>) => void;
};

export const PipeConfigForm: React.FC<PipeConfigFormProps> = ({
  pipe,
  onConfigSave,
}) => {
  const [config, setConfig] = useState<Record<string, any>>(pipe.config || {});

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const loadedConfig = await invoke("load_pipe_config", {
          pipeName: pipe.name,
        });
        setConfig(loadedConfig as Record<string, any>);
      } catch (error) {
        console.error("Error loading pipe config:", error);
      }
    };

    loadConfig();
  }, [pipe.name]);

  const handleInputChange = (name: string, value: any) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invoke("save_pipe_config", { pipeName: pipe.name, config });
      onConfigSave(config);
    } catch (error) {
      console.error("Error saving pipe config:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold">Pipe Configuration</h3>
      {Object.entries(config).map(([key, value]) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={key}>{key}</Label>
          {typeof value === "boolean" ? (
            <Checkbox
              id={key}
              checked={value}
              onCheckedChange={(checked) => handleInputChange(key, checked)}
            />
          ) : (
            <Input
              id={key}
              type={typeof value === "number" ? "number" : "text"}
              value={value}
              onChange={(e) => handleInputChange(key, e.target.value)}
            />
          )}
        </div>
      ))}
      <Button type="submit">Save Configuration</Button>
    </form>
  );
};
