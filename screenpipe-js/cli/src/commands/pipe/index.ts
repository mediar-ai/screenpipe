import { Command } from "commander";
import { registerCommand } from "./register";
import { publishCommand } from "./publish";
import { listVersionsCommand } from "./list-versions";
import { createPipeCommand } from "./create";

export const pipeCommands = new Command()
  .name("pipe")
  .description("create and manage pipes")

  pipeCommands.addCommand(createPipeCommand)
  pipeCommands.addCommand(registerCommand)
  pipeCommands.addCommand(publishCommand)
  pipeCommands.addCommand(listVersionsCommand)