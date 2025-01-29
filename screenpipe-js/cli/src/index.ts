#!/usr/bin/env bun
import { run } from "@drizzle-team/brocli";
import {
  loginCommand,
  logoutCommand,
  publishCommand,
  registerCommand,
  listVersionsCommand,
  createCommand
} from "./commands";

run(
  [
    loginCommand,
    logoutCommand,
    createCommand,
    registerCommand,
    publishCommand,
    listVersionsCommand,
  ],
  {
    name: "screenpipe-dev",
    description: "screenpipe development CLI tool",
  }
);
