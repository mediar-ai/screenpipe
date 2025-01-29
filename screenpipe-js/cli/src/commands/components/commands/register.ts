import { command, string } from "@drizzle-team/brocli";
import { logger } from "./add/utils/logger";
import { handleError } from "./add/utils/handle-error";
import prompts from "prompts";
import { ComponentSchema, RegistrySchema } from "./add/registry/schema";
import { getRegistry } from "./add/registry/api";
import fs from 'fs-extra';

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

export const registerComponentCommand = command({
    name: "register",
    desc: "register a new component in screenpipe's component registry",
    options: {
      name: string().desc("name of the component"),
      src: string().desc("github url for the component."),
      target: string().desc("path where file should be created."),
    },
    handler: async (opts) => {
      try {
        if (!opts.name) {
          const { name } = await prompts({
            type: "text",
            name: "name",
            message: "what's your component's name?",
            instructions: false,
          })

          opts.name = name
        }

        if (!opts.src) {
          const { src } = await prompts({
            type: "text",
            name: "src",
            message: "where should we download the component from?",
            hint: "url with the following pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path}. see README for more info.",
          })

          opts.src = src
        }

        if (!opts.target) {
          const { target } = await prompts({
            type: "text",
            name: "target",
            message: "where should the component be created?",
          })

          opts.target = target
        }

        if (!opts.name?.length || !opts.src?.length || !opts.target?.length) {
          logger.break()
          handleError('invalid component')
          process.exit(1)
        }

        const { deps } = await prompts({
          type: "list",
          name: "deps",
          message: "type all of the component's runtime dependencies by name, separated by a comma",
          separator: ',',
        })

        const { devDeps } = await prompts({
          type: "list",
          name: "devDeps",
          message: "type all of the component's dev dependencies by name, separated by a comma",
          separator: ',',
        })

        const { registryDeps } = await prompts({
          type: "list",
          name: "registryDeps",
          message: "type all of the component's registry dependencies by name, separated by a comma",
          separator: ',',
        })

        const componentObject:  ComponentSchema = {
          name: opts.name as string,
          src: opts.src as string,
          target: opts.target as string,
          dependencies: (deps as string[]).filter(item => item !== ""),
          devDependencies: (devDeps as string[]).filter(item => item !== ""),
          registryDependencies: (registryDeps as string[]).filter(item => item !== "")
        }
        
        const currentRegistry = await getRegistry()
        if (!currentRegistry) {
          logger.break()
          handleError('critical: build is missing registry file.')
          process.exit(1)
        }

        currentRegistry[opts.name as string] = componentObject

        await writeJsonToFile('./src/commands/components/commands/add/registry/registry.json', currentRegistry)
        logger.log("run `bun run build` and open a PR at https://github.com/mediar-ai/screenpipe to update registry.")
      } catch (error) {
        logger.break()
        handleError(error)
      }
    },
  })