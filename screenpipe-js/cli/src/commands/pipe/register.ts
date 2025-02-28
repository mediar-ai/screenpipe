import fs from "fs";
import { Credentials } from "../../utils/credentials";
import { API_BASE_URL } from "../../constants";
import { colors, symbols } from "../../utils/colors";
import { Command } from "commander";
import { logger } from "../components/commands/add/utils/logger";
import { handleError } from "../components/commands/add/utils/handle-error";

export const registerCommand = new Command()
  .name("register")
  .description("register a new pipe")
  .requiredOption("--name <name>", "name of the pipe")
  .option("--paid", "set this flag to create a paid pipe")
  .option(
    "--price <price>",
    "price in usd (required for paid pipes)",
    parseFloat
  )
  .option("--source <source>", "source code url (e.g., github repository)")
  .action(async (opts) => {
    if (opts.paid && opts.price == null) {
      handleError(
        "error: price is required for paid pipes, i.e., --price <amount>"
      );
    }
    if (opts.paid && opts.price <= 0) {
      handleError("error: price must be positive for paid pipes");
    }

    try {
      const apiKey = Credentials.getApiKey();
      if (!apiKey) {
        handleError(
          symbols.error +
            " not logged in. please login first using" +
            colors.highlight("screenpipe login")
        );
      }

      let packageJson: {
        description: string;
      };

      try {
        packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
      } catch (error) {
        handleError(
          `${symbols.error} failed to read package.json. make sure you're in the correct directory.`
        );
      }

      const isPaid = opts.paid || false;
      const price = opts.price;

      // Read description from README.md
      let description = null;
      try {
        const readmeContent = fs.readFileSync("README.md", "utf-8");
        if (readmeContent) {
          description = readmeContent;
        }
      } catch (error) {
        logger.warn(
          `${symbols.arrow} no README.md found, required for description`
        );
      }

      const response = await fetch(`${API_BASE_URL}/api/plugins/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: opts.name,
          description: description,
          is_paid: isPaid,
          price: isPaid ? price : null,
          source_url: opts.source || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        handleError(errorData.error || "failed to create plugin");
      }

      const data = await response.json();
      logger.success(
        `\n${symbols.success} successfully created pipe: ${colors.highlight(
          opts.name
        )}`
      );

      // Display additional info
      logger.info(`\n${symbols.info} plugin details:`);
      console.log(colors.listItem(`${colors.label("name")} ${opts.name}`));
      console.log(
        colors.listItem(
          `${colors.label("type")} ${isPaid ? `paid ($${price})` : "free"}`
        )
      );
      if (opts.source) {
        console.log(
          colors.listItem(`${colors.label("source")} ${opts.source}`)
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        handleError(`\n${symbols.error} creating failed: ${error.message}`);
      } else {
        handleError(`\n${symbols.error} creating failed with unexpected error`);
      }
    }
  });
