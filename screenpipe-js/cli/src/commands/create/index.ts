import { Command } from "commander";
import { createPipeCommand } from "./pipe";
import { createAppCommand } from "./app";

export const createCommands = new Command()
  .name("create")
  .description("commands to initiate projects that contribute to screenpipe")

createCommands.addCommand(createPipeCommand)

createCommands.addCommand(createAppCommand)