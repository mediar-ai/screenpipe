#!/usr/bin/env bun

import { Command } from "commander";
import { 
  appCommands,
  loginCommand,
  componentsCommands, 
  logoutCommand,
  pipeCommands
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
  program.addCommand(appCommands)
  program.addCommand(pipeCommands)
  program.addCommand(componentsCommands)


  program.parse()
}

main()
