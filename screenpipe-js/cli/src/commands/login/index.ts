import { Command } from "commander";
import * as p from "@clack/prompts";
import { cliLogin } from "./utils/cli-login";
import { apiKeyLogin } from "./utils/api-key-login";

export const loginCommand = new Command()
  .name("login")
  .description("authenticate with screenpipe")
  .action(async () => {
    p.intro("Welcome to Screenpipe");

    const type = await p.select({
      message: "Select login type",
      options: [
        { value: "browser", label: "Browser" },
        { value: "apiKey", label: "API Key" },
      ],
    });

    if (p.isCancel(type)) {
      p.cancel("Login cancelled");
      process.exit(1);
    }

    if (type === "browser") {
      await cliLogin();
    } else {
      const apiKey = await p.text({
        message: "Enter your API key",
        // validate: (value) => {
        //     if (value.length !== 32) {
        //         return 'API key must be 32 characters long';
        //     }
        // }
      });

      if (p.isCancel(apiKey)) {
        p.cancel("Login cancelled");
        process.exit(1);
      }

      await apiKeyLogin(apiKey);
    }

    p.outro("Login complete");
  });
