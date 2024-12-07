"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface TemplateEditorProps {
  initialTemplate: Record<string, any>;
}

export default function TemplateEditor({ initialTemplate }: TemplateEditorProps) {
  const [template, setTemplate] = useState(initialTemplate);
  const [isOpen, setIsOpen] = useState(true);

  const handleChange = (key: string, value: string) => {
    setTemplate(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    try {
      console.log("Template saved:", template);
      // TODO: Implement save logic
    } catch (error) {
      console.error("error saving template:", error);
    }
  };

  return (
    <div className="w-full max-w-7xl flex flex-col gap-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <CollapsibleTrigger className="flex items-center gap-2 w-full">
          <h2 className="text-xl font-semibold">LinkedIn automation settings</h2>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "transform rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-6">
          <div className="flex flex-col gap-6">
            {Object.entries(template).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-2">
                <label className="text-sm font-medium">{key.replace(/_/g, ' ')}</label>
                <textarea
                  className="w-full min-h-[100px] p-4 border rounded-lg font-mono text-sm 
                    bg-white dark:bg-black text-black dark:text-white resize-vertical"
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={`Enter ${key}...`}
                />
              </div>
            ))}
          </div>
          <button
        className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 w-fit"
        onClick={handleSave}
      >
        save changes
      </button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
} 