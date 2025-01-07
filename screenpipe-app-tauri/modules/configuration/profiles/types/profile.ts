import { SettingsSchema, SettingsType } from "../../settings/types/settings"
import { z } from 'zod';

export const ProfileSchema = z.object({
    id: z.string(),
    settings: SettingsSchema
})

export type ProfileType = z.infer<typeof ProfileSchema>