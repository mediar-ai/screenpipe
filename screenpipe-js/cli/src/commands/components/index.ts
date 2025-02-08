import { addComponentCommand } from "./commands/add/add";
import { registerComponentCommand } from "./commands/register";
import { Command } from "commander";

export const componentsCommands = new Command()
  .name("components")
  .description("easily add screenpipe components to your project")

componentsCommands.addCommand(addComponentCommand)

componentsCommands.addCommand(registerComponentCommand)