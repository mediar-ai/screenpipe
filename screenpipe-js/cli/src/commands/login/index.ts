import { Command } from "commander";
import inquirer from "inquirer";
import { cliLogin } from "./utils/cli-login";
import { apiKeyLogin } from "./utils/api-key-login";
import { handleError } from "../components/commands/add/utils/handle-error";

export const loginCommand = new Command()
.name("login")
.description("authenticate with screenpipe")
.action(async () => {
    let type;
    try {
        type = await inquirer.prompt([
                {
                    type: "list",
                    name: "type",
                    message: "select login type",
                    choices: ["browser", "api key"],
            }
        ]);
    } catch (error) {
        process.exit(1);
    }

    if (type?.type === "browser") {
        await cliLogin();
    } else {
        let apiKey;
        try {
            apiKey = await inquirer.prompt([
                {
                    type: "input",
                    name: "apiKey",
                    message: "enter your API key",
                    // validate: (input: string) => {
                //     if (input.length !== 32) {
                //         return "API key must be 32 characters long";
                //     }
                //     return true;
                    // }
                }
            ]);
        } catch (error) {
            process.exit(1);
        }

        if (apiKey) {
            await apiKeyLogin(apiKey.apiKey);
        }
    }
});


