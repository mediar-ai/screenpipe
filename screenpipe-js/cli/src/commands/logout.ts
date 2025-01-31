import { command } from "@drizzle-team/brocli";
import { Credentials } from "../utils/credentials";
import { colors, symbols } from "../utils/colors";

export const logoutCommand = command({
  name: "logout",
  desc: "End current session",
  handler: async () => {
    Credentials.clearCredentials();
    console.log(colors.success(`\n${symbols.success} Successfully logged out`));
    console.log(colors.info(`${symbols.info} Thanks for using ScreenPipe! Come back soon.`));
  }
});
