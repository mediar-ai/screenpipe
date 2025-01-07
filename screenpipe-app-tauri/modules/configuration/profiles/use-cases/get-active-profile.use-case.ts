import { TauriProfileRepository } from "../infrastructure/tauri.profile.repository"

export async function getActiveProfileUseCase() { 
    const profileService = new TauriProfileRepository()
    return await profileService.getActiveProfile()
}