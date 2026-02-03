import { handleError } from "./handle-error";
import { registryResolveItemsTree } from "../registry/api";
import { updateDependencies } from "./updaters/update-dependencies";
import { spinner } from "./logger";
import { updateFiles } from "./updaters/update-files";
import { installShadcnComponents } from "./shadcn";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

export async function addComponents(
  components: string[],
  options: {
    silent?: boolean;
    cwd: string;
    overwrite: boolean;
  }
) {
  const registrySpinner = spinner(`Checking registry.`, {
    silent: options.silent,
  });
  registrySpinner.start();

  const tree = registryResolveItemsTree(components);

  if (!tree) {
    registrySpinner.fail("Failed to fetch components from registry.");
    return handleError(new Error("Failed to fetch components from registry."));
  }
  registrySpinner.succeed("Registry checked successfully.");

  // Install regular dependencies first
  await updateDependencies(tree.dependencies, {
    cwd: options.cwd,
    silent: options.silent,
  });

  await updateDependencies(tree.devDependencies, {
    cwd: options.cwd,
    silent: options.silent,
    devDependency: true,
  });

  // Install shadcn components if specified in the tree
  await installShadcnComponents(tree.shadcnComponent ?? [], {
    cwd: options.cwd,
    silent: options.silent,
    overwrite: options.overwrite,
  });

  // Finally update the files
  await updateFiles(tree.files, {
    cwd: options.cwd,
    overwrite: options.overwrite,
    silent: options.silent,
  });
}
