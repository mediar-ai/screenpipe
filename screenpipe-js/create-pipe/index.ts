#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import { select, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import https from "https";
import { Extract } from "unzip-stream";

const PIPE_ADDITIONS = {
  dependencies: {
    "@screenpipe/js": "latest",
  },
  devDependencies: {
    "bun-types": "latest",
  },
};

const PIPE_TYPE_OPTIONS = [
  {
    name: "ui - create a pipe with a user interface",
    value: "ui",
  },
  {
    name: "headless - create a pipe without ui",
    value: "headless",
  },
];

async function downloadAndExtractRepo(
  owner: string,
  repo: string,
  branch: string,
  subdir: string,
  destPath: string
): Promise<void> {
  const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

  // Create a temporary directory for extraction
  const tempDir = path.join(destPath, "_temp");
  await fs.ensureDir(tempDir);

  return new Promise((resolve, reject) => {
    const request = https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error("Redirect location not found"));
            return;
          }

          https
            .get(redirectUrl, async (redirectResponse) => {
              if (redirectResponse.statusCode !== 200) {
                reject(
                  new Error(
                    `Failed to download: ${redirectResponse.statusCode}`
                  )
                );
                return;
              }

              const extractStream = Extract({ path: tempDir });

              extractStream.on("finish", async () => {
                try {
                  // Move files from the specific subdirectory to the final destination
                  const sourcePath = path.join(
                    tempDir,
                    `screenpipe-${branch}`,
                    subdir
                  );
                  await fs.copy(sourcePath, destPath);
                  // Clean up temp directory
                  await fs.remove(tempDir);
                  console.log("extraction completed");
                  resolve();
                } catch (err) {
                  reject(err);
                }
              });

              extractStream.on("error", async (err) => {
                await fs.remove(tempDir).catch(console.error);
                reject(err);
              });

              redirectResponse.pipe(extractStream);
            })
            .on("error", async (err) => {
              await fs.remove(tempDir).catch(console.error);
              reject(err);
            });
        } else {
          reject(new Error(`Failed to download: ${response.statusCode}`));
        }
      })
      .on("error", async (err) => {
        await fs.remove(tempDir).catch(console.error);
        reject(err);
      });

    request.end();
  });
}

async function main() {
  console.log(chalk.bold("\nwelcome to create-pipe! 🚀\n"));
  console.log("let's create a new screenpipe pipe.\n");
  console.log(
    "pipes are plugins that interact with captured screen and audio data."
  );
  console.log("build powerful agents, monetize it, etc.\n");

  // get project name
  const pipeName = await input({
    message: "what is your pipe name?",
    default: "my-screenpipe",
    validate: (input) => {
      if (input.trim().length === 0) return "pipe name is required";
      return true;
    },
  });

  // get directory
  const directory = await input({
    message: "where would you like to create your pipe?",
    default: pipeName,
  });

  // get pipe type
  const pipeType = await select({
    message: "would you like to add a user interface to your pipe?",
    choices: PIPE_TYPE_OPTIONS,
  });

  // ai customization confirmation
  // const useAI = await confirm({
  //   message: "would you like to use ai to customize your pipe? (experimental)",
  //   default: false,
  // });

  const spinner = ora("creating your pipe...").start();

  try {
    // Download and extract the appropriate template
    if (pipeType === "ui") {
      await downloadAndExtractRepo(
        "mediar-ai",
        "screenpipe",
        "main",
        "examples/typescript/pipe-simple-nextjs",
        directory
      );

      // Update package.json with the pipe name
      const pkgPath = path.join(process.cwd(), directory, "package.json");
      const pkg = await fs.readJson(pkgPath);

      pkg.name = pipeName;
      pkg.dependencies = {
        ...pkg.dependencies,
        ...PIPE_ADDITIONS.dependencies,
      };
      pkg.devDependencies = {
        ...pkg.devDependencies,
        ...PIPE_ADDITIONS.devDependencies,
      };

      await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    } else {
      await downloadAndExtractRepo(
        "mediar-ai",
        "screenpipe",
        "main",
        "examples/typescript/pipe-obsidian-time-logs",
        directory
      );

      // Update pipe.ts only for headless pipes
      const pipePath = path.join(process.cwd(), directory, "pipe.ts");
      let pipeContent = await fs.readFile(pipePath, "utf8");
      pipeContent = pipeContent.replace(
        /name: ["'].*["']/,
        `name: "${pipeName}"`
      );
      await fs.writeFile(pipePath, pipeContent);
    }

    // if (useAI) {
    //   spinner.text = "customizing with ai...";
    //   // TODO: implement AI customization
    //   await new Promise((resolve) => setTimeout(resolve, 1000)); // placeholder
    // }

    spinner.succeed(chalk.green("pipe created successfully! 🎉"));

    console.log("\nto get started:");
    console.log(chalk.cyan(`cd ${directory}`));
    console.log(chalk.cyan("bun install"));

    if (pipeType === "ui") {
      console.log(chalk.cyan("bun dev"));
    } else {
      // TODO make these shits non mandatory
      console.log(
        chalk.cyan(`export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="${pipeName}"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/${pipeName}"

bun run pipe.ts
        `)
      );
    }

    console.log(
      "\nwhen you're ready, you can ship your pipe to the app by adding it to the pipe store using the UI and then send a PR to the main repo.\n"
    );
  } catch (error) {
    spinner.fail("failed to create pipe");
    console.error(error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("unexpected error:", err);
  process.exit(1);
});
