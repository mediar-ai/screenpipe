import fs from 'fs-extra';
import path from "path";
import { highlighter, logger, spinner } from "../logger";
import prompts from "prompts";
import { existsSync } from "fs";
import { fetchFileFromGitHubAPI } from "../download-file-from-github";

export async function updateFiles(
    componentLocations: {src: string, target: string}[],
    options: {
      cwd: string,
      overwrite?: boolean
      silent?: boolean
    }
  ) {
    if (!componentLocations?.length) {
      return {
        filesCreated: [],
        filesUpdated: [],
        filesSkipped: [],
      }
    }

    options = {
      overwrite: false,
      silent: false,
      ...options,
    }

    const filesCreatedSpinner = spinner(`Updating files.`, {
      silent: options.silent,
    })?.start()

    const filesCreated = []
    const filesUpdated = []
    const filesSkipped = []

    for (const location of componentLocations) {
        const targetDir = path.dirname(location.target)

        const existingFile = existsSync(location.target)
        if (existingFile && !options.overwrite) {
            filesCreatedSpinner.stop()
            const { overwrite } = await prompts({
              type: "confirm",
              name: "overwrite",
              message: `The file ${highlighter.info(
                location.target
              )} already exists. Would you like to overwrite?`,
              initial: false,
            })
      
            if (!overwrite) {
              filesSkipped.push(path.relative(options.cwd, location.target))
              continue
            }

            filesCreatedSpinner?.start()

            // Create the target directory if it doesn't exist.
            if (!existsSync(targetDir)) {
                await fs.mkdir(targetDir, { recursive: true })
            }
        }

        // Create the target directory if it doesn't exist.
        if (!existsSync(targetDir)) {
            await fs.mkdir(targetDir, { recursive: true })
        }

        await fetchFileFromGitHubAPI(location.src, location.target)
        existingFile
            ? filesUpdated.push(path.relative(options.cwd, location.target))
            : filesCreated.push(path.relative(options.cwd, location.target))
    }
    
    const hasUpdatedFiles = filesCreated.length || filesUpdated.length
    if (!hasUpdatedFiles && !filesSkipped.length) {
      filesCreatedSpinner?.info("No files updated.")
    }
  
    if (filesCreated.length) {
      filesCreatedSpinner?.succeed(
        `Created ${filesCreated.length} ${
          filesCreated.length === 1 ? "file" : "files"
        }:`
      )
      if (!options.silent) {
        for (const file of filesCreated) {
          logger.log(`  - ${file}`)
        }
      }
    } else {
      filesCreatedSpinner?.stop()
    }
  
    if (filesUpdated.length) {
      spinner(
        `Updated ${filesUpdated.length} ${
          filesUpdated.length === 1 ? "file" : "files"
        }:`,
        {
          silent: options.silent,
        }
      )?.info()
      if (!options.silent) {
        for (const file of filesUpdated) {
          logger.log(`  - ${file}`)
        }
      }
    }
  
    if (filesSkipped.length) {
      spinner(
        `Skipped ${filesSkipped.length} ${
          filesUpdated.length === 1 ? "file" : "files"
        }: (use --overwrite to overwrite)`,
        {
          silent: options.silent,
        }
      )?.info()
      if (!options.silent) {
        for (const file of filesSkipped) {
          logger.log(`  - ${file}`)
        }
      }
    }
  
    if (!options.silent) {
      logger.break()
    }
  
    return {
      filesCreated,
      filesUpdated,
      filesSkipped,
    }
  }