import { logger } from "./add/utils/logger";
import { handleError } from "./add/utils/handle-error";
import { ComponentSchema, RegistrySchema } from "./add/registry/schema";
import { getRegistry } from "./add/registry/api";
import fs from 'fs-extra';
import { Command } from "commander";
import inquirer from "inquirer";

async function writeJsonToFile(filePath: string, data: RegistrySchema) {
  try {
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      logger.success(`component registry successfully updated.`);
  } catch (error) {
    if (error)
      if (error instanceof Error) {
        if (error.message === "No such file or directory") {
          logger.break()
          logger.warn("this command can only be called from within the screenpipe-js/cli of screenpipe's repository");
          process.exit(1)
        }
      }
    logger.break()
    handleError('critical: could not save information to registry');
    process.exit(1)
  }
}

export const registerComponentCommand = new Command()
  .name("register")
  .description("register a new component in screenpipe's component registry")
  .option("-n, --name <name>", "name of the component")
  .option("-s, --src", "github url for the component")
  .option("-t, --target", "path where file should be created")
  .action(async (opts) => {
    try {
      if (!opts.name) {
        const { name } = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "what's your component's name?",
          },
        ]);
        opts.name = name;
      }

      if (!opts.src) {
        const { src } = await inquirer.prompt([
          {
            type: "input",
            name: "src",
            message: "where should we download the component from? (URL pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path})",
            validate: input => input.startsWith("https://api.github.com/repos/") ? true : "URL must follow the pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path}. \n \n \nvisit: https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-js/cli/src/commands/components/README.md for more details.",
          },
        ]);
        opts.src = src;
      }

      if (!opts.target) {
        const { target } = await inquirer.prompt([
          {
            type: "input",
            name: "target",
            message: "where should the component be created?",
          },
        ]);
        opts.target = target;
      }

      if (!opts.name?.length || !opts.src?.length || !opts.target?.length) {
        logger.break();
        handleError("invalid component");
        process.exit(1);
      }

      const { deps } = await inquirer.prompt([
        {
          type: "input",
          name: "deps",
          message: "type all of the component's runtime dependencies by name, separated by a comma",
          filter: (input: string) => input.split(',').map(item => item.trim()).filter(item => item !== ""),
        },
      ]);

      const { devDeps } = await inquirer.prompt([
        {
          type: "input",
          name: "devDeps",
          message: "type all of the component's dev dependencies by name, separated by a comma",
          filter: (input: string) => input.split(',').map(item => item.trim()).filter(item => item !== ""),
        },
      ]);

      const { registryDeps } = await inquirer.prompt([
        {
          type: "input",
          name: "registryDeps",
          message: "type all of the component's registry dependencies by name, separated by a comma",
          filter: (input: string) => input.split(',').map(item => item.trim()).filter(item => item !== ""),
        },
      ]);

      const componentObject: ComponentSchema = {
        name: opts.name,
        src: opts.src,
        target: opts.target,
        dependencies: deps,
        devDependencies: devDeps,
        registryDependencies: registryDeps,
      };

      const currentRegistry = getRegistry();
      if (!currentRegistry) {
        logger.break();
        handleError("critical: build is missing registry file.");
        process.exit(1);
      }

      currentRegistry[opts.name] = componentObject;

      await writeJsonToFile("./src/commands/components/commands/add/registry/registry.json", currentRegistry);
      logger.log("run `bun run build` and open a PR at https://github.com/mediar-ai/screenpipe to update registry.");
    } catch (error) {
      logger.break();
      handleError(error);
    }
  })