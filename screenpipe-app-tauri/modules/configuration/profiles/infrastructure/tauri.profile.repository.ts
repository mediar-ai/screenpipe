import { flattenObject, unflattenObject } from "@/lib/utils";
import { localDataDir } from "@tauri-apps/api/path";
import { LazyStore, LazyStore as TauriStore } from '@tauri-apps/plugin-store';
import { IProfileRepository } from "../interface/profile.repository.interface";
import { ProfileType } from "../types/profile";

export class TauriProfileRepository implements IProfileRepository {
  private async getStore(): Promise<TauriStore> {
    const dir = await localDataDir();
    return new LazyStore(`${dir}/screenpipe/profiles.bin`, {
      autoSave: false,
    })
  }

  async getActiveProfile(): Promise<ProfileType["id"]> {
    const tauriStore = await this.getStore();
    return (await tauriStore.get("activeProfile")) as string || "default" as string;
  }

  async getAllAvailableProfiles(): Promise<Record<ProfileType["id"], ProfileType>> {
    const tauriStore = await this.getStore();
    const allKeys = await tauriStore.keys();
    const values: Record<string, any> = {};

    for (const key of allKeys) {
      values[key] = await tauriStore.get(key);
    }

    return unflattenObject(values);
  }

  async replaceAllAvailableProfiles(newProfiles: Record<ProfileType["id"], ProfileType>): Promise<void> {
    const tauriStore = await this.getStore();
    const flattenedValue = flattenObject(newProfiles);

    const existingKeys = await tauriStore.keys();
    for (const key of existingKeys) {
      await tauriStore.delete(key);
    }

    for (const [key, val] of Object.entries(flattenedValue)) {
      await tauriStore.set(key, val);
    }

    await tauriStore.save();
  }

  async deleteAllAvailableProfiles(): Promise<void> {
    const tauriStore = await this.getStore();
    const keys = await tauriStore.keys();

    for (const key of keys) {
      await tauriStore.delete(key);
    }

    await tauriStore.save();
  }
}
