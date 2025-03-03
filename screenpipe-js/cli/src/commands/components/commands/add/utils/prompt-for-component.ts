import { z } from "zod";
import * as p from "@clack/prompts";
import { handleError } from "./handle-error";
import { getRegistry } from "../registry/api";
import { logger } from "./logger";

export async function promptForRegistryComponents(all?: boolean) {
  const registryIndex = getRegistry();

  if (!registryIndex) {
    logger.break();
    handleError(new Error("Failed to fetch registry index."));
    return [];
  }

  if (all) {
    return Object.values(registryIndex).map((entry) => entry.name);
  }

  const components = await p.multiselect({
    message: "Which components would you like to add?",
    options: Object.values(registryIndex)
      .filter((item) => item.internal !== true)
      .map((entry) => ({
        value: entry.name,
        label: entry.name,
      })),
  });

  if (p.isCancel(components)) {
    p.cancel("No components selected");
    logger.info("");
    process.exit(1);
  }

  if (!components?.length) {
    logger.warn("No components selected. Exiting.");
    logger.info("");
    process.exit(1);
  }

  const result = z.array(z.string()).safeParse(components);
  if (!result.success) {
    logger.error("");
    handleError(new Error("Something went wrong. Please try again."));
    return [];
  }

  return result.data;
}
