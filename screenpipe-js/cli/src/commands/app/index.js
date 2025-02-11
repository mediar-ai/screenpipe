"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appCommands = void 0;
const commander_1 = require("commander");
const create_1 = require("./create");
exports.appCommands = new commander_1.Command()
    .name("app")
    .description("create a new screenpipe application using default templates");
exports.appCommands.addCommand(create_1.createAppCommand);
