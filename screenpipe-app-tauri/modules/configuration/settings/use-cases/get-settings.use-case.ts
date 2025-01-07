import { getActiveProfileUseCase } from "../../profiles/use-cases/get-active-profile.use-case"
import { TauriSettingsRepository } from "../infrastructure/tauri.settings.repository"

async function getSettingsUseCase() { 
    const settingsRepository = new TauriSettingsRepository()
    const activeProfile = await getActiveProfileUseCase()
    return await settingsRepository.getSettings(activeProfile)
}

export default getSettingsUseCase