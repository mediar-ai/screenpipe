#!/usr/bin/env node

import { command } from "@drizzle-team/brocli";
import { addComponentCommand } from "./commands/add/add";

export const componentsCommands = command({
  name: "components",
  desc: "commands to interact with screenpipe's components",
  subcommands: [
    addComponentCommand
  ]
});