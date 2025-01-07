import { z } from 'zod';

export const UserSchema = z.object({
    id: z.string().optional(),
    email: z.string().optional(),
    name: z.string().optional(),
    image: z.string().optional(),
    token: z.string().optional(),
    clerk_id: z.string().optional(),
    credits: z.object({
        amount: z.number()
    }).optional()
})

export type UserType = z.infer<typeof UserSchema>;