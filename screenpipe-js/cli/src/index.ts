import { Command } from "commander";
import { 
  loginCommand,
  createCommand, 
  componentsCommands, 
  registerCommand,
  publishCommand,
  listVersionsCommand,
  logoutCommand
} from "./commands";

process.on("SIGINT", () => process.exit(0))
process.on("SIGTERM", () => process.exit(0))

async function main() {
  const program = new Command();

  program
    .name('screenpipe-dev')
    .description('screenpipe development CLI tool')
    .version('0.0.1');

  program.addCommand(loginCommand)
  program.addCommand(logoutCommand)
  program.addCommand(createCommand)
  program.addCommand(componentsCommands)
  program.addCommand(registerCommand)
  program.addCommand(publishCommand)
  program.addCommand(listVersionsCommand)


  program.parse()
}

main()