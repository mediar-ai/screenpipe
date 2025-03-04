import { z } from "zod"
import { highlighter, logger } from "./logger"

export function handleError(error: unknown) {
  // logger.error(
  //   `something went wrong. please check the error below for more details.`
  // )
  // logger.error(`if the problem persists, please open an issue on github.`)
  // logger.error("")
  if (typeof error === "string") {
    logger.error(error)
    logger.break()
    process.exit(1)
  }

  if (error instanceof z.ZodError) {
    logger.error("validation failed:")
    for (const [key, value] of Object.entries(error.flatten().fieldErrors)) {
      logger.error(`- ${highlighter.info(key)}: ${value}`)
    }
    logger.break()
    process.exit(1)
  }

  if (error instanceof Error) {
    logger.error(error.message)
    logger.break()
    process.exit(1)
  }

  logger.break()
  process.exit(1)
}

export const ERRORS = {
  MISSING_DIR_OR_EMPTY_PIPE: "1",
  COMPONENT_NOT_FOUND: "2",
  BUILD_MISSING_REGISTRY_FILE: "3"
} as const
