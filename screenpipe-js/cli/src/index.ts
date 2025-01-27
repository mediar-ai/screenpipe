#!/usr/bin/env node
import { Command } from "commander"

import packageJson from "../package.json"
import { add } from "./commands/add"

process.on("SIGINT", () => process.exit(0))
process.on("SIGTERM", () => process.exit(0))

async function main() {
  const program = new Command()
    .name("screenpipe")
    .description("add components and dependencies to your pipe")
    .version(
      packageJson.version || "1.0.0",
      "-v, --version",
      "display the version number"
    )

  program
    .addCommand(add)

  program.parse()
}

main()