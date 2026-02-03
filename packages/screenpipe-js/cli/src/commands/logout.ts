import { Credentials } from "../utils/credentials";
import { colors, symbols } from "../utils/colors";
import { Command } from "commander";
import { logger } from "./components/commands/add/utils/logger";

export const logoutCommand = new Command()
  .name("logout")
  .description("end current session")
  .action(async () => {
    Credentials.clearCredentials();
    logger.success(`\n${symbols.success} successfully logged out`);
    logger.info(`${symbols.info} thanks for using screenpipe! come back soon.`);
  })