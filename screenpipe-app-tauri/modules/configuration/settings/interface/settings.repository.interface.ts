import { SettingsType } from "../types/settings";

export interface ISettingsRepository {
    /**
     * retrieves settings object.
     * @returns a promise that resolves to an object containing settings.
     */
    getSettings(activeProfile: string): Promise<{ settings: SettingsType }>;
  
    /**
     * saves the provided settings object through replacement.
     * @param settings - the settings object to persist.
     * @returns a promise that resolves when the operation is complete.
     */
    replaceSettings(settings: SettingsType, activeProfile: string): Promise<void>;
  
    /**
     * deletes all settings.
     * @returns a promise that resolves when the operation is complete.
     */
    deleteSettings(activeProfile: string): Promise<void>;
  }
  