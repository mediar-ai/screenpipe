import { getActiveProfileUseCase } from "../../profiles/use-cases/get-active-profile.use-case";
import { TauriSettingsRepository } from "../infrastructure/tauri.settings.repository";
import { SettingsType } from "../types/settings";

async function replaceSettingsUseCase(settings: SettingsType) { 
    const settinsService = new TauriSettingsRepository()
    const activeProfile = await getActiveProfileUseCase()
    return await settinsService.replaceSettings(settings, activeProfile)
}

export default replaceSettingsUseCase