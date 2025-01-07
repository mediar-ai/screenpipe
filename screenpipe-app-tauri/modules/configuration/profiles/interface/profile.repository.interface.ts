import { ProfileType } from "../types/profile";

/**
 * interface representing a repository that manages configuration profiles.
 */
export interface IProfileRepository {
    /**
     * retrieves the current active profile
     *
     * @returns a promise resolving to the name of the active profile, 
     */
    getActiveProfile(): Promise<ProfileType['id']>,
    /**
     * retrieves all available profiles from the storage.
     *
     * @returns a promise resolving to an object containing all profiles, 
     */
    getAllAvailableProfiles(): Promise<Record<ProfileType['id'], ProfileType>>;
  
    /**
     * replaces all existing profiles in the storage with the provided profiles.
     *
     * @param newProfiles - an object containing the new profiles to replace the existing ones. 
     * @returns a promise that resolves when the replacement operation is complete.
     */
    replaceAllAvailableProfiles(newProfiles: Record<ProfileType['id'], ProfileType>): Promise<void>;
  
    /**
     * deletes all available profiles from the storage.
     *
     * @returns a promise that resolves when all profiles have been deleted.
     */
    deleteAllAvailableProfiles(): Promise<void>;
}
  