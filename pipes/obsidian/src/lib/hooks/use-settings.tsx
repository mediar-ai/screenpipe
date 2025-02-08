"use client";

import { useState, useEffect } from "react";
import { getDefaultSettings, type Settings } from "@screenpipe/browser";

const SETTINGS_KEY = "screenpipe_settings";

export function useSettings() {
  const defaultSettings = getDefaultSettings();

  defaultSettings.customSettings = {
    ...(defaultSettings.customSettings || {}),
    obsidian: {
      prompt: `yo, you're my personal data detective! 🕵️‍♂️

rules for the investigation:
- extract names of people i interact with and what we discussed, when i encounter a person, make sure to extract their name like this [[John Doe]] so it's linked in my notes
- identify recurring topics/themes in my convos, use tags or [[Link them]] to my notes
- spot any promises or commitments made (by me or others)
- catch interesting ideas or insights dropped in casual chat
- note emotional vibes and energy levels in conversations
- highlight potential opportunities or connections
- track project progress and blockers mentioned

style rules:
- always put people's names in double square brackets, eg: [[John Doe]] to link to their notes, same for companies, eg: [[Google]], or projects, eg: [[Project X]]
- keep it real and conversational
- use bullet points for clarity
- include relevant timestamps
- group related info together
- max 4 lines per insight
- no corporate speak, keep it human
- for tags use hyphen between words, no spaces, eg: #my-tag not #my tag nor #myTag nor #my_tag

remember: you're analyzing screen ocr text & audio, etc. from my computer, so focus on actual interactions and content!
you'll get chunks of 5 mins roughly of data screen & audio recordings and have to write logs.
this data will be used later for analysis, it must contains valuable insights on what i am doing.
if you do your job well, i'll give you a 🍺 and $1m`,
    },
  };

  const [settings, setSettings] = useState<Settings | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(false);
  }, []);

  const updateSetting = async <T extends keyof Settings>(
    key: T,
    value: Settings[T],
    namespace?: string
  ) => {
    if (!settings) return;
    try {
      const updatedSettings = {
        ...settings,
        customSettings: {
          ...settings.customSettings,
          [namespace || "default"]: {
            ...(settings.customSettings?.[namespace || "default"] || {}),
            [key]: value,
          },
        },
      };
      setSettings(updatedSettings);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
    } catch (err) {
      setError(err as Error);
    }
  };

  const updateSettings = async (newSettings: any) => {
    const updatedSettings = {
      ...settings,
      ...newSettings,
    };
    setSettings(updatedSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
  };

  const resetSettings = async (
    settingKey?: keyof Settings,
    namespace?: string
  ) => {
    if (!settings) return;
    try {
      const updatedSettings = {
        ...settings,
        customSettings: {
          ...settings.customSettings,
          [namespace || ("default" as string)]: {
            ...(settings.customSettings?.[namespace || "default"] || {}),
            [settingKey as string]: undefined,
          },
        },
      };
      setSettings(updatedSettings);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
    } catch (err) {
      setError(err as Error);
    }
  };

  return {
    settings: settings || defaultSettings,
    loading,
    error,
    updateSetting,
    updateSettings,
    resetSettings,
  };
}
