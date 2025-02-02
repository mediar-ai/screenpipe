import { Credentials } from "../utils/credentials";
import { colors, symbols } from "../utils/colors";
import { Command } from "commander";

export const logoutCommand = new Command()
  .name("logout")
  .description("end current session")
  .action(async () => {
    Credentials.clearCredentials();
    console.log(colors.success(`\n${symbols.success} Successfully logged out`));
    console.log(colors.info(`${symbols.info} Thanks for using ScreenPipe! Come back soon.`));
  })