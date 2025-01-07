import { flattenObject, unflattenObject } from '@/lib/utils';
import { localDataDir } from '@tauri-apps/api/path';
import { LazyStore as TauriStore } from '@tauri-apps/plugin-store';
import { SettingsType } from '../types/settings';
import { ISettingsRepository } from '../interface/settings.repository.interface';

export class TauriSettingsRepository implements ISettingsRepository {
  private storePromise: Promise<TauriStore> | null = null;

  /** 
   * @warning Do not change autoSave to true, it causes race conditions
   */
  private async getStore(activeProfile: string): Promise<TauriStore> {
    if (!this.storePromise) {
      this.storePromise = (async () => {
        const dir = await localDataDir();
       
        const file = activeProfile === "default" 
          ? `store.bin` 
          : `store-${activeProfile}.bin`

        console.log("activeProfile", activeProfile, file);
        return new TauriStore(`${dir}/screenpipe/${file}`, {
          autoSave: false,
        });
      })();
    }
    return this.storePromise;
  }

  public async getSettings(activeProfile: string): Promise<{ settings: SettingsType }> {
    const tauriStore = await this.getStore(activeProfile);
    const allKeys = await tauriStore.keys();
    const values: Record<string, any> = {};

    for (const key of allKeys) {
      values[key] = await tauriStore.get(key);
    }

    return { settings: unflattenObject(values) };
  }

  public async replaceSettings(settings: SettingsType, activeProfile: string): Promise<void> {
    const tauriStore = await this.getStore(activeProfile);
    const flattenedValue = flattenObject(settings);

    // Delete all existing keys first
    const existingKeys = await tauriStore.keys();
    for (const key of existingKeys) {
      await tauriStore.delete(key);
    }

    // Set new flattened values
    for (const [key, val] of Object.entries(flattenedValue)) {
      await tauriStore.set(key, val);
    }

    await tauriStore.save();
  }

  public async deleteSettings(activeProfile: string): Promise<void> {
    const tauriStore = await this.getStore(activeProfile);
    const keys = await tauriStore.keys();
    for (const key of keys) {
      await tauriStore.delete(key);
    }
    await tauriStore.save();
  }
}
