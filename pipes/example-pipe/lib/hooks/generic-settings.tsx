"use client";

import { useSettings } from "../settings-provider";
import { useState } from "react";

export function GenericSettings() {
  const { settings, updateSettings, loading } = useSettings();
  const [isSaving, setIsSaving] = useState(false);
  
  if (loading) {
    return <div>loading settings...</div>;
  }
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(settings!);
      console.log("settings saved successfully");
    } catch (error) {
      console.error("failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="w-full max-w-2xl p-4 border rounded-lg">
      <h2 className="text-lg font-medium mb-4">pipe settings</h2>
      
      {/* Add your settings UI here */}
      <div className="space-y-4">
        {/* Example setting field */}
        <div>
          <label className="block text-sm font-medium mb-1">example setting</label>
          <input 
            type="text"
            className="w-full p-2 border rounded"
            value={settings?.exampleSetting || ""}
            onChange={(e) => updateSettings({
              ...settings!,
              exampleSetting: e.target.value
            })}
          />
        </div>
      </div>
      
      <div className="mt-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "saving..." : "save settings"}
        </button>
      </div>
    </div>
  );
} 