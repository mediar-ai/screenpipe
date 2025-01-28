import prompts from "prompts"
import fs from "fs-extra"
import { highlighter, logger } from "./logger";
import path from 'path';
// import { main } from '@screenpipe/create-pipe';

export async function createPipe(
  options: any
){
    options = {
      srcDir: false,
      ...options,
    }

    let projectType: "next" = "next"
    let projectName: string = "my-app"
  
    const { type, name } = await prompts([
        {
            type: "select",
            name: "type",
            message: `The path ${highlighter.info(
              options.cwd
            )} does not contain a package.json file.\n  Would you like to start a new project?`,
            choices: [
              { title: "Next.js", value: "next" },
            ],
            initial: 0,
        },
        {
            type: "text",
            name: "name",
            message: "What is your project named?",
            initial: projectName,
            format: (value: string) => value.trim(),
            validate: (value: string) =>
            value.length > 128
                ? `Name should be less than 128 characters.`
                : true,
        },
    ])

    projectName = name
    projectType = type

    const projectPath = `${options.cwd}/${projectName}`

    // Check if path is writable.
    try {
      await fs.access(options.cwd, fs.constants.W_OK)
    } catch (error) {
      logger.break()
      logger.error(`The path ${highlighter.info(options.cwd)} is not writable.`)
      logger.error(
        `It is likely you do not have write permissions for this folder or the path ${highlighter.info(
          options.cwd
        )} does not exist.`
      )
      logger.break()
      process.exit(1)
    }

    // Check if project already exists
    if (fs.existsSync(path.resolve(options.cwd, projectName, "package.json"))) {
      logger.break()
      logger.error(
        `A project with the name ${highlighter.info(projectName)} already exists.`
      )
      logger.error(`Please choose a different name and try again.`)
      logger.break()
      process.exit(1)
    }

    if (projectType === "next") {
      // TODO: look into pipes cli
      // main
    }

    return {
      projectPath,
      projectName,
      projectType,
    }
  }