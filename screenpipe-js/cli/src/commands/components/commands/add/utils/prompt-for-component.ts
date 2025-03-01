import { z } from "zod"
import prompts from 'prompts';
import { handleError } from "./handle-error";
import { getRegistry } from "../registry/api";
import { logger } from "./logger";
import inquirer from "inquirer";

export async function promptForRegistryComponents(
    all?: boolean
  ) {
    const registryIndex = await getRegistry()

    if (!registryIndex) {
      logger.break()
      handleError(new Error("Failed to fetch registry index."))
      return []
    }
  
    if (all) {
      return Object.values(registryIndex).map((entry) => entry.name)
    }
  
    const { components } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "components",
        message: "Which components would you like to add?",
        choices: Object.values(registryIndex)
          .filter((item) => item.internal !== true)
          .map((entry) => ({
            name: entry.name,
            value: entry.name,
            // checked: options.all ? true : options.components?.includes(entry.name),
          })),
      },
    ]);
    
  
    if (!components?.length) {
      logger.warn("No components selected. Exiting.")
      logger.info("")
      process.exit(1)
    }
  
    const result = z.array(z.string()).safeParse(components)
    if (!result.success) {
      logger.error("")
      handleError(new Error("Something went wrong. Please try again."))
      return []
    }
    
    return result.data
  }