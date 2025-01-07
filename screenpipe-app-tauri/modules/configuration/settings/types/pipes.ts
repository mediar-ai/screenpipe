import { z } from 'zod';

export const PipeSchema = z.object({
  enabled: z.boolean(),
  name: z.string(),
  downloads: z.number(),
  version: z.string(),
  author: z.string(),
  authorLink: z.string(),
  repository: z.string(),
  lastUpdate: z.string(),
  description: z.string(),
  fullDescription: z.string(),
  mainFile: z.string().optional(),
  config: z.record(z.string(), z.any()).optional()
})

export type PipeType = z.infer<typeof PipeSchema>