import { TauriProfileRepository } from "../infrastructure/tauri.profile.repository"

export async function deleteAllAvailableProfilesUseCase() { 
    const profileService = new TauriProfileRepository()
    return await profileService.deleteAllAvailableProfiles()
}