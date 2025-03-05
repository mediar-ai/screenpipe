import { useState, useEffect } from "react";
import { Settings } from "@/lib/types";
import {
  getScreenpipeAppSettings,
  updateScreenpipeAppSettings,
} from "../actions/get-screenpipe-app-settings";

const DEFAULT_SETTINGS: Partial<Settings> = {
  exampleSetting: "default value",
  prompt: `yo, you're my personal data detective! 🕵

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
};

export function usePipeSettings() {
  const [settings, setSettings] = useState<Partial<Settings> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load screenpipe app settings
      const screenpipeSettings = await getScreenpipeAppSettings();
      
      console.log("loaded settings:", screenpipeSettings);

      // Merge with defaults
      setSettings({
        ...DEFAULT_SETTINGS,
        ...screenpipeSettings.customSettings?.pipe,
        screenpipeAppSettings: screenpipeSettings,
      });
    } catch (error) {
      console.error("failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      // Split settings
      const { screenpipeAppSettings, ...pipeSettings } = newSettings;

      // Update screenpipe settings
      await updateScreenpipeAppSettings({
        ...screenpipeAppSettings,
        customSettings: {
          ...screenpipeAppSettings?.customSettings,
          pipe: pipeSettings,
        },
      });

      // Update local state
      setSettings({
        ...DEFAULT_SETTINGS,
        ...pipeSettings,
        screenpipeAppSettings: screenpipeAppSettings || settings?.screenpipeAppSettings,
      });
      
      console.log("settings updated successfully");
      return true;
    } catch (error) {
      console.error("failed to update settings:", error);
      return false;
    }
  };

  return { settings, updateSettings, loading };
}
