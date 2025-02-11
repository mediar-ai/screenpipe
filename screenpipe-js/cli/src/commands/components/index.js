"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.componentsCommands = void 0;
const add_1 = require("./commands/add/add");
const register_1 = require("./commands/register");
const commander_1 = require("commander");
exports.componentsCommands = new commander_1.Command()
    .name("components")
    .description("easily add screenpipe components to your project");
exports.componentsCommands.addCommand(add_1.addComponentCommand);
exports.componentsCommands.addCommand(register_1.registerComponentCommand);
