"use client";
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";

const AiProvider: React.FC = () => {
  const { settings } = useSettings();
  const [aiSettings, setAiSettings] = useState({
    openaiApiKey: settings.coustomSettings.search.openaiApiKey,
    aiModel: settings.coustomSettings.search.aiModel,
    aiUrl: settings.coustomSettings.search.aiUrl,
    customPrompt: settings.coustomSettings.search.customPrompt,
    aiProviderType: settings.coustomSettings.search.aiProviderType,
    embeddedLLM: {
      port: settings.coustomSettings.search.embeddedLLM.port,
      enabled: settings.coustomSettings.search.embeddedLLM.enabled,
      model: settings.coustomSettings.search.embeddedLLM.model,
    },
    aiMaxContextChars: settings.coustomSettings.search.aiMaxContextChars,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAiSettings((prevSettings) => ({
      ...prevSettings,
      [name]: value,
    }));
    console.log("changed", aiSettings);
  };
  const handleSave = async () => {
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "customSettings.search",
          value: aiSettings,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      const result = await response.json();
      console.log("Settings saved", result);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="openaiApiKey"
              className="block text-sm font-medium text-gray-700"
            >
              OpenAI API Key
            </label>
            <Input
              id="openaiApiKey"
              name="openaiApiKey"
              value={aiSettings.openaiApiKey}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="aiModel"
              className="block text-sm font-medium text-gray-700"
            >
              AI Model
            </label>
            <Input
              id="aiModel"
              name="aiModel"
              value={aiSettings.aiModel}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="aiUrl"
              className="block text-sm font-medium text-gray-700"
            >
              AI URL
            </label>
            <Input
              id="aiUrl"
              name="aiUrl"
              value={aiSettings.aiUrl}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="customPrompt"
              className="block text-sm font-medium text-gray-700"
            >
              Custom Prompt
            </label>
            <Input
              id="customPrompt"
              name="customPrompt"
              value={aiSettings.customPrompt}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="aiProviderType"
              className="block text-sm font-medium text-gray-700"
            >
              AI Provider Type
            </label>
            <Input
              id="aiProviderType"
              name="aiProviderType"
              value={aiSettings.aiProviderType}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="embeddedLLM.port"
              className="block text-sm font-medium text-gray-700"
            >
              Embedded LLM Port
            </label>
            <Input
              id="embeddedLLM.port"
              name="embeddedLLM.port"
              value={aiSettings.embeddedLLM.port}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="embeddedLLM.enabled"
              className="block text-sm font-medium text-gray-700"
            >
              Embedded LLM Enabled
            </label>
            <Input
              id="embeddedLLM.enabled"
              name="embeddedLLM.enabled"
              value={aiSettings.embeddedLLM.enabled.toString()}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="embeddedLLM.model"
              className="block text-sm font-medium text-gray-700"
            >
              Embedded LLM Model
            </label>
            <Input
              id="embeddedLLM.model"
              name="embeddedLLM.model"
              value={aiSettings.embeddedLLM.model}
              onChange={handleChange}
            />
          </div>
          <div>
            <label
              htmlFor="aiMaxContextChars"
              className="block text-sm font-medium text-gray-700"
            >
              AI Max Context Chars
            </label>
            <Input
              id="aiMaxContextChars"
              name="aiMaxContextChars"
              value={aiSettings.aiMaxContextChars.toString()}
              onChange={handleChange}
            />
          </div>
        </div>
        <Button className="my-2" onClick={handleSave}>
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
};

export default AiProvider;
