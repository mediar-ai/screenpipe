import { command } from "@drizzle-team/brocli";
import { addComponentCommand } from "./commands/add/add";
import { registerComponentCommand } from "./commands/register";

export const componentsCommands = command({
  name: "components",
  desc: "commands to interact with screenpipe's components",
  subcommands: [
    addComponentCommand,
    registerComponentCommand
  ]
});