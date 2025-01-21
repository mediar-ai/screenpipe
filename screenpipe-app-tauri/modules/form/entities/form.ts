import { z } from "zod";
import { fieldSchema } from "./field/field-metadata";

export const formSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    fields: z.array(fieldSchema),
    hideTitle: z.boolean().optional(),
    buttonText: z.string()
})
export type FormSchema = z.infer<typeof formSchema>;
