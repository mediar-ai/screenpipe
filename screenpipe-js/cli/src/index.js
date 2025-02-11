#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const commands_1 = require("./commands");
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const program = new commander_1.Command();
        program
            .name('screenpipe-dev')
            .description('screenpipe development CLI tool')
            .version('0.0.1');
        program.addCommand(commands_1.loginCommand);
        program.addCommand(commands_1.logoutCommand);
        program.addCommand(commands_1.appCommands);
        program.addCommand(commands_1.pipeCommands);
        program.addCommand(commands_1.componentsCommands);
        program.parse();
    });
}
main();
