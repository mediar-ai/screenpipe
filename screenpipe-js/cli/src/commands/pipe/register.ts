import fs from "fs";
import { Credentials } from "../../utils/credentials";
import { API_BASE_URL } from "../../constants";
import { colors, symbols } from "../../utils/colors";
import { Command } from "commander";
import { logger } from "../components/commands/add/utils/logger";
import { handleError } from "../components/commands/add/utils/handle-error";
import * as p from "@clack/prompts";

export const registerCommand = new Command()
  .name("register")
  .description("register a new pipe")
  .requiredOption("--name <name>", "name of the pipe", (value) => {
    if (value.includes(" ")) {
      throw new Error("name cannot contain spaces");
    }
    // Check for valid characters (only letters, hyphens, and numbers)
    if (!/^[a-zA-Z0-9-]+$/.test(value)) {
      throw new Error("name can only contain letters, numbers, and hyphens");
    }
    // Check maximum length
    if (value.length > 20) {
      throw new Error("name cannot be longer than 20 characters");
    }
    return value;
  })
  .option("--paid", "set this flag to create a paid pipe")
  .option(
    "--price <price>",
    "price in usd (required for paid pipes)",
    parseFloat
  )
  .requiredOption(
    "--source <source>",
    "source code url (e.g., github repository)",
    (value) => {
      if (!value.startsWith("https://github.com/")) {
        throw new Error("source must start with https://github.com/");
      }
      return value;
    }
  )
  .option("--discord <handle>", "your discord handle (e.g., username#1234)")
  .action(async (opts) => {
    p.intro(`${colors.highlight("⚠️ IMPORTANT: Publishing Process ⚠️")}`);

    p.note(
      `Before publishing your pipe, you MUST contact ${colors.highlight(
        "louis030195"
      )} on Discord.
      Join the Discord server: ${colors.highlight(
        "https://discord.gg/dU9EBuw7Uq"
      )}
      This step is required to complete the publishing process.`,
      "Contact Required"
    );

    const confirmed = await p.confirm({
      message: "Have you contacted louis030195 on Discord before proceeding?",
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel(
        "Please contact louis030195 on Discord before publishing your pipe."
      );
      process.exit(0);
    }

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
          source_url: opts.source,
          discord_handle: opts.discord,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        handleError(errorData.error || "failed to create plugin");
      }

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
      console.log(colors.listItem(`${colors.label("source")} ${opts.source}`));
      console.log(
        colors.listItem(`${colors.label("discord")} ${opts.discord}`)
      );

      p.outro(`Successfully registered your pipe! 🎉`);
    } catch (error) {
      if (error instanceof Error) {
        handleError(`\n${symbols.error} creating failed: ${error.message}`);
      } else {
        handleError(`\n${symbols.error} creating failed with unexpected error`);
      }
    }
  });
