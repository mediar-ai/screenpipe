#!/usr/bin/env bun
import { run } from "@drizzle-team/brocli";
import {
  loginCommand,
  logoutCommand,
  publishCommand,
  createCommand,
  listVersionsCommand,
} from "./commands";

run(
  [
    loginCommand,
    logoutCommand,
    publishCommand,
    createCommand,
    listVersionsCommand,
  ],
  {
    name: "screenpipe-dev",
    description: "screenpipe development CLI tool",
  }
);
