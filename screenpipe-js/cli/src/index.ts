#!/usr/bin/env bun
import { run } from "@drizzle-team/brocli";
import {
  loginCommand,
  logoutCommand,
  publishCommand,
  registerCommand,
  listVersionsCommand,
  createCommand,
  componentsCommands
} from "./commands";

run(
  [
    loginCommand,
    logoutCommand,
    createCommand,
    componentsCommands,
    registerCommand,
    publishCommand,
    listVersionsCommand,
  ],
  {
    name: "screenpipe-dev",
    description: "screenpipe development CLI tool",
  }
);
