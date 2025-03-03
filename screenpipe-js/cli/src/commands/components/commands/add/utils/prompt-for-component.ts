import { z } from "zod";
import prompts from "prompts";
import { handleError } from "./handle-error";
import { getRegistry } from "../registry/api";
import { logger, spinner } from "./logger";

export async function promptForRegistryComponents(all?: boolean) {
  const registrySpinner = spinner('Checking registry...');
  registrySpinner.start();
  const registryIndex = getRegistry();

  if (!registryIndex) {
    registrySpinner.fail('Failed to fetch registry index.');
    logger.break();
    handleError(new Error("Failed to fetch registry index."));
    return [];
  }

  registrySpinner.succeed('Registry checked successfully.');

  if (all) {
    return Object.values(registryIndex).map((entry) => entry.name);
  }

  const response = await prompts([
    {
      type: 'multiselect',
      name: 'components',
      message: 'Which components would you like to add?',
      instructions: false,
      hint: 'Space to select, Enter to confirm',
      choices: Object.values(registryIndex)
        .filter((item) => item.internal !== true)
        .map((entry) => ({
          title: entry.name,
          value: entry.name,
          selected: false
        })),
      validate: (value) => {
        if (!value.length) return 'Please select at least one component';
        return true;
      }
    }
  ], {
    onCancel: () => {
      logger.warn("No components selected. Exiting.");
      process.exit(1);
    }
  });

  const result = z.array(z.string()).safeParse(response.components);
  if (!result.success) {
    handleError(new Error("Something went wrong. Please try again."));
    return [];
  }

  return result.data;
}
