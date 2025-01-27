import path from "path"
import { Command } from "commander"
import { z } from "zod"
import { logger } from "../utils/logger"
import { handleError } from "../utils/handle-error"
import { promptForRegistryComponents } from "../utils/prompt-for-component"

export const addOptionsSchema = z.object({
  components: z.array(z.string()).optional(),
  path: z.string().optional(),
  cwd: z.string(),
})

export const add = new Command()
  .name("add")
  .description("add a screenpipe component to your pipe")
  .argument(
    "[components...]",
    "the components to add"
  )
  .option(
    "-c, --cwd <cwd>",
    "the working directory. defaults to the current directory.",
    process.cwd()
  )
  .option("-p, --path <path>", "the path to add the component to.")
  .action(async (components, opts) => {
    try {
      const options = addOptionsSchema.parse({
        components,
        cwd: path.resolve(opts.cwd),
        ...opts,
      })

    if (!options.components?.length) {
        await promptForRegistryComponents(options)
    }

    } catch (error) {
      logger.break()
      handleError(error)
    }
})