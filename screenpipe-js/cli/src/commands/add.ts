import path from "path"
import { Command } from "commander"
import { z } from "zod"
import { logger } from "../utils/logger"
import { handleError } from "../utils/handle-error"
import { promptForRegistryComponents } from "../utils/prompt-for-component"
import { preFlightAdd } from "../preflights/preflight-add"
import * as ERRORS from '@/src/utils/errors';
import { createPipe } from "../utils/create-pipe"
import { addComponents } from "../utils/add-components"

export const addOptionsSchema = z.object({
  components: z.array(z.string()).optional(),
  path: z.string().optional(),
  cwd: z.string(),
  silent: z.boolean(),
  overwrite: z.boolean(),
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
  .option("-o, --overwrite", "overwrite existing files.", false)
  .option("-s, --silent", "mute output.", false)
  .option("-p, --path <path>", "the path to add the component to.")
  .action(async (components, opts) => {
    try {
      
      const options = addOptionsSchema.parse({
        components,
        cwd: path.resolve(opts.cwd),
        ...opts,
      })

      if (!options.components?.length) {
          options.components = await promptForRegistryComponents(options)
      }

        const result = await preFlightAdd(options)

        if (result?.errors[ERRORS.MISSING_DIR_OR_EMPTY_PIPE]) {
          await createPipe(options)
        }

        await addComponents(options.components, options)
    } catch (error) {
      logger.break()
      handleError(error)
    }
})