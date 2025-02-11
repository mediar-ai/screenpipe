"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERRORS = void 0;
exports.handleError = handleError;
const zod_1 = require("zod");
const logger_1 = require("./logger");
function handleError(error) {
    logger_1.logger.error(`something went wrong. please check the error below for more details.`);
    logger_1.logger.error(`if the problem persists, please open an issue on github.`);
    logger_1.logger.error("");
    if (typeof error === "string") {
        logger_1.logger.error(error);
        logger_1.logger.break();
        process.exit(1);
    }
    if (error instanceof zod_1.z.ZodError) {
        logger_1.logger.error("validation failed:");
        for (const [key, value] of Object.entries(error.flatten().fieldErrors)) {
            logger_1.logger.error(`- ${logger_1.highlighter.info(key)}: ${value}`);
        }
        logger_1.logger.break();
        process.exit(1);
    }
    if (error instanceof Error) {
        logger_1.logger.error(error.message);
        logger_1.logger.break();
        process.exit(1);
    }
    logger_1.logger.break();
    process.exit(1);
}
exports.ERRORS = {
    MISSING_DIR_OR_EMPTY_PIPE: "1",
    COMPONENT_NOT_FOUND: "2",
    BUILD_MISSING_REGISTRY_FILE: "3"
};
