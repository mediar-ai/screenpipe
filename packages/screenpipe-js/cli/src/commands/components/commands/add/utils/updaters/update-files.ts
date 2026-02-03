import fs from "fs-extra";
import path from "path";
import { highlighter, logger, spinner } from "../logger";
import * as p from "@clack/prompts";
import { existsSync } from "fs";
import { fetchFileFromGitHubAPI } from "../download-file-from-github";

export async function updateFiles(
  componentLocations: { src: string; target: string }[],
  options: {
    cwd: string;
    overwrite?: boolean;
    silent?: boolean;
  }
) {
  if (!componentLocations?.length) {
    return {
      filesCreated: [],
      filesUpdated: [],
      filesSkipped: [],
    };
  }

  options = {
    overwrite: false,
    silent: false,
    ...options,
  };

  // Check if src directory exists
  const hasSrcDir = fs.existsSync(path.join(options.cwd, "src"));

  // Modify target paths if src directory doesn't exist
  if (!hasSrcDir) {
    logger.info(
      "No src directory found. Components will be installed in the root directory instead."
    );

    componentLocations = componentLocations.map((location) => {
      if (location.target.startsWith("./src/")) {
        return {
          ...location,
          target: "./" + location.target.substring(6), // Remove the 'src/' part
        };
      }
      return location;
    });
  }

  const filesCreatedSpinner = spinner(`Creating files...`, {
    silent: options.silent,
  });
  filesCreatedSpinner.start();

  const filesCreated = [];
  const filesUpdated = [];
  const filesSkipped = [];

  for (const location of componentLocations) {
    const targetDir = path.dirname(location.target);

    const existingFile = existsSync(location.target);
    if (existingFile && !options.overwrite) {
      filesCreatedSpinner.stop();

      const overwrite = await p.confirm({
        message: `The file ${highlighter.info(
          location.target
        )} already exists. Would you like to overwrite?`,
      });

      if (p.isCancel(overwrite) || !overwrite) {
        filesSkipped.push(path.relative(options.cwd, location.target));
        continue;
      }

      filesCreatedSpinner.start();

      // Create the target directory if it doesn't exist.
      if (!existsSync(targetDir)) {
        await fs.mkdir(targetDir, { recursive: true });
      }
    }

    // Create the target directory if it doesn't exist.
    if (!existsSync(targetDir)) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    await fetchFileFromGitHubAPI(location.src, location.target);
    existingFile
      ? filesUpdated.push(path.relative(options.cwd, location.target))
      : filesCreated.push(path.relative(options.cwd, location.target));
  }

  const hasUpdatedFiles = filesCreated.length || filesUpdated.length;
  if (!hasUpdatedFiles && !filesSkipped.length) {
    filesCreatedSpinner.info("No files created.");
    return { filesCreated, filesUpdated, filesSkipped };
  }

  if (!options.silent) {
    filesCreatedSpinner.stop();

    if (filesCreated.length) {
      p.note(
        [
          `Created ${filesCreated.length} ${
            filesCreated.length === 1 ? "file" : "files"
          }:`,
          ...filesCreated.map((file) => `  - ${file}`),
        ].join("\n"),
        "Created"
      );
    }

    if (filesUpdated.length) {
      p.note(
        [
          `Updated ${filesUpdated.length} ${
            filesUpdated.length === 1 ? "file" : "files"
          }:`,
          ...filesUpdated.map((file) => `  - ${file}`),
        ].join("\n"),
        "Updated"
      );
    }

    if (filesSkipped.length) {
      p.note(
        [
          `Skipped ${filesSkipped.length} ${
            filesSkipped.length === 1 ? "file" : "files"
          }:`,
          ...filesSkipped.map((file) => `  - ${file}`),
          "",
          "Use --overwrite to overwrite existing files",
        ].join("\n"),
        "Skipped"
      );
    }
  }

  return {
    filesCreated,
    filesUpdated,
    filesSkipped,
  };
}
