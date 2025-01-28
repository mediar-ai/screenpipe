import fs from "fs";
import { boolean, command, number, string } from "@drizzle-team/brocli";
import { Credentials } from "../utils/credentials";
import { API_BASE_URL } from "../constants";
import { colors, symbols } from "../utils/colors";

export const createCommand = command({
  name: "create",
  desc: "Create a new pipe",
  options: {
    name: string().required().desc("name of the pipe"),
    paid: boolean().desc("set this flag to create a paid pipe"),
    price: number().desc("price in USD (required for paid pipes)"),
    source: string().desc("source code URL (e.g. GitHub repository)"),
  },
  transform: (opts) => {
    if (opts.paid && !opts.price) {
      throw new Error(
        "Price is required for paid pipes, i.e. --price <amount>"
      );
    }
    if (opts.paid && opts.price && opts.price <= 0) {
      throw new Error("Price must be positive for paid pipes");
    }
    return opts;
  },
  handler: async (opts) => {
    try {
      const apiKey = Credentials.getApiKey();
      if (!apiKey) {
        console.error(
          colors.error(
            `${
              symbols.error
            } Not logged in. Please login first using ${colors.highlight(
              "screenpipe login"
            )}`
          )
        );
        process.exit(1);
      }

      let packageJson: {
        description: string;
      };

      try {
        packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
      } catch (error) {
        console.error(
          colors.error(
            `${symbols.error} Failed to read package.json. Make sure you're in the correct directory.`
          )
        );
        process.exit(1);
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
        console.log(
          colors.dim(
            `${symbols.arrow} No README.md found, required for description`
          )
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
        throw new Error(errorData.error || "Failed to create plugin");
      }

      const data = await response.json();
      console.log(
        colors.success(
          `\n${symbols.success} Successfully created pipe: ${colors.highlight(
            opts.name
          )}`
        )
      );

      // Display additional info
      console.log(colors.info(`\n${symbols.info} Plugin Details:`));
      console.log(colors.listItem(`${colors.label("Name")} ${opts.name}`));
      console.log(
        colors.listItem(
          `${colors.label("Type")} ${isPaid ? `Paid ($${price})` : "Free"}`
        )
      );
      if (opts.source) {
        console.log(
          colors.listItem(`${colors.label("Source")} ${opts.source}`)
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(
          colors.error(`\n${symbols.error} Creating failed: ${error.message}`)
        );
      } else {
        console.error(
          colors.error(
            `\n${symbols.error} Creating failed with unexpected error`
          )
        );
      }
      process.exit(1);
    }
  },
});
