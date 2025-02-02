import { addComponentCommand } from "./commands/add/add";
import { registerComponentCommand } from "./commands/register";
import { Command } from "commander";

export const componentsCommands = new Command()
  .name("components")
  .description("commands to interact with screenpipe's components")

componentsCommands.addCommand(addComponentCommand)

componentsCommands.addCommand(registerComponentCommand)