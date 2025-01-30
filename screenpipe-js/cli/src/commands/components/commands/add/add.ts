import { boolean, command, GenericCommandHandler, OutputType, string } from "@drizzle-team/brocli";
import { logger } from "./utils/logger";
import { ERRORS, handleError } from "./utils/handle-error";
import { promptForRegistryComponents } from "./utils/prompt-for-component";
import { preFlightAdd } from "./preflights/preflight-add";
import { addComponents } from "./utils/add-components";

export const addComponentCommand = command({
    name: "add",
    desc: "add components and dependencies to your pipe",
    options: {
      components: string().desc("name of the pipe"),
      path: string().desc("the path to add the component to."),
      silent: boolean().desc("mute output.").default(false),
      overwrite: boolean().desc("overwrite existing files.").default(false),
      cwd: string().desc("the working directory. defaults to the current directory.").default(process.cwd())
    },
    handler: async (opts) => {
      try {
        let components

        // If there are no components, ask the user which ones they want.
        if (!opts?.components?.length) {
          components = await promptForRegistryComponents()
        } else {
          components = [opts.components]
        }

        // Before addig check a few things
        const result = await preFlightAdd(opts.cwd)

        // If the current directory is not a pipe, create one
        if (result?.errors[ERRORS.MISSING_DIR_OR_EMPTY_PIPE]) {
          logger.warn('you need to create a pipe first. run bunx @screenpipe/create-pipe@latest or visit https://docs.screenpi.pe/docs/plugins for more information.')
          process.exit(1)
          // await createPipe(options)
        }

        // Add components to the directory
        await addComponents(components, {silent: opts.silent, cwd: opts.cwd, overwrite: opts.overwrite})
      } catch (error) {
        logger.break()
        handleError(error)
      }
    },
  })