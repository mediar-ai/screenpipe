"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipeCommands = void 0;
const commander_1 = require("commander");
const register_1 = require("./register");
const publish_1 = require("./publish");
const list_versions_1 = require("./list-versions");
const create_1 = require("./create");
exports.pipeCommands = new commander_1.Command()
    .name("pipe")
    .description("create and manage pipes");
exports.pipeCommands.addCommand(create_1.createPipeCommand);
exports.pipeCommands.addCommand(register_1.registerCommand);
exports.pipeCommands.addCommand(publish_1.publishCommand);
exports.pipeCommands.addCommand(list_versions_1.listVersionsCommand);
