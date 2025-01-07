import { TauriProfileRepository } from "../infrastructure/tauri.profile.repository"

export async function getAllAvailableProfilesUseCase() { 
    const profileService = new TauriProfileRepository()
    return await profileService.getAllAvailableProfiles()
}