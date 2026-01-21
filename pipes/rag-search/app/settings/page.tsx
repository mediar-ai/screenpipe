"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Settings {
  openaiApiKey: string;
  indexingEnabled: boolean;
  maxResults: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    openaiApiKey: "",
    indexingEnabled: true,
    maxResults: 10,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setStatus({ type: "success", message: "Settings saved successfully" });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-container">
      <header className="header">
        <h1>Settings</h1>
        <Link href="/" className="btn">
          Back to Chat
        </Link>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="apiKey">OpenAI API Key</label>
          <input
            type="password"
            id="apiKey"
            value={settings.openaiApiKey}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, openaiApiKey: e.target.value }))
            }
            placeholder="sk-..."
          />
          <p className="hint">
            Get your API key from{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
            >
              OpenAI Dashboard
            </a>
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="maxResults">Max Search Results</label>
          <input
            type="number"
            id="maxResults"
            value={settings.maxResults}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                maxResults: parseInt(e.target.value) || 10,
              }))
            }
            min={1}
            max={50}
          />
          <p className="hint">
            Number of context chunks to include in RAG queries (1-50)
          </p>
        </div>

        <div className="form-group">
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="indexingEnabled"
              checked={settings.indexingEnabled}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  indexingEnabled: e.target.checked,
                }))
              }
            />
            <label htmlFor="indexingEnabled">Enable automatic indexing</label>
          </div>
          <p className="hint">
            When enabled, screen history will be indexed automatically every 10 minutes
          </p>
        </div>

        {status && (
          <div className={`status ${status.type}`}>{status.message}</div>
        )}

        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
