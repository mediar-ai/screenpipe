// import { run } from "@drizzle-team/brocli";
// import {
//   // loginCommand,
//   // logoutCommand,
//   // publishCommand,
//   // registerCommand,
//   // listVersionsCommand,
//   // createCommand,
//   // componentsCommands
// } from "./commands";
// import { addComponentCommand } from "./commands/components/commands/add/add";

import { Command } from "commander";
import { 
  loginCommand,
  createCommand, 
  componentsCommands, 
  registerCommand,
  publishCommand,
  listVersionsCommand
} from "./commands";

// run(
//   [
//     // loginCommand,
//     // logoutCommand,
//     addComponentCommand
//   ],
//   {
//     name: "screenpipe-dev",
//     description: "screenpipe development CLI tool",
//   }
// );

process.on("SIGINT", () => process.exit(0))
process.on("SIGTERM", () => process.exit(0))

async function main() {
  const program = new Command();

  program
    .name('screenpipe-dev')
    .description('screenpipe development CLI tool')
    .version('0.0.1');
    
  program.addCommand(loginCommand)
  program.addCommand(createCommand)
  program.addCommand(componentsCommands)
  program.addCommand(registerCommand)
  program.addCommand(publishCommand)
  program.addCommand(listVersionsCommand)


  program.parse()
}

main()