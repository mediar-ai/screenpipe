import { TauriProfileRepository } from "../infrastructure/tauri.profile.repository"
import { ProfileType } from "../types/profile"

export async function replaceAllAvailableProfiles(newProfiles:  Record<ProfileType["id"], ProfileType>) { 
    const profileService = new TauriProfileRepository()
    return await profileService.replaceAllAvailableProfiles(newProfiles)
}