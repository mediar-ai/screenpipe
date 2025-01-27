import { z } from "zod";

const componentSchema = z.object({
    name: z.string(),
    location: z.string(),
    target: z.string(),
    dependencies: z.array(z.string()),
    devDependencies: z.array(z.string())
})

export const registrySchema = z.record(z.string(), componentSchema)