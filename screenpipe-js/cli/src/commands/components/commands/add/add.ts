import { logger } from "./utils/logger";
import { ERRORS, handleError } from "./utils/handle-error";
import { promptForRegistryComponents } from "./utils/prompt-for-component";
import { preFlightAdd } from "./preflights/preflight-add";
import { addComponents } from "./utils/add-components";
import { Command } from "commander";

export const addComponentCommand = new Command()
  .name("add")
  .description("add components and dependencies to your pipe")
  .argument("[components...]", "List of components by name")
  .option("--path <path>", "The path to add the component to.")
  .option("--silent", "Mute output.", false)
  .option("--overwrite", "Overwrite existing files.", false)
  .option(
    "--cwd <cwd>",
    "The working directory. Defaults to the current directory.",
    process.cwd()
  )
  .action(async (comps, opts) => {
    try {
      let components;

      // If there are no components, ask the user which ones they want.
      if (!comps?.length) {
        components = await promptForRegistryComponents();
      } else {
        components = [comps];
      }

      // Before adding check a few things
      const result = preFlightAdd(opts.cwd);

      // If the current directory is not a pipe, create one
      if (result?.errors[ERRORS.MISSING_DIR_OR_EMPTY_PIPE]) {
        logger.warn(
          "you need to create a pipe first. run bunx --bun @screenpipe/dev@latest pipe create or visit https://docs.screenpi.pe/plugins for more information."
        );
        process.exit(1);
      }

      // Add components to the directory
      await addComponents(components, {
        silent: opts.silent,
        cwd: opts.cwd,
        overwrite: opts.overwrite,
      });
    } catch (error) {
      logger.break();
      handleError(error);
    }
  });
