import { z } from "zod";

export const registryComponentSchema = z.object({
  name: z.string(),
  src: z.string(),
  internal: z.boolean().optional(),
  docs: z.string().optional(),
  target: z.string(),
  dependencies: z.array(z.string()).optional(),
  registryDependencies: z.array(z.string()).optional(),
  devDependencies: z.array(z.string()).optional()
})
export type ComponentSchema = z.infer<typeof registryComponentSchema>

export const registrySchema = z.record(z.string(), registryComponentSchema)
export type RegistrySchema = z.infer<typeof registrySchema>

export const registryResolvedComponentsTreeSchema = registryComponentSchema.pick({
  dependencies: true,
  devDependencies: true,
  docs: true,
}).merge(
  z.object({
    files: z.array(z.object({
      src: z.string(),
      target: z.string()
    }))
  })
)