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
exports.listVersionsCommand = void 0;
const constants_1 = require("../../constants");
const credentials_1 = require("../../utils/credentials");
const colors_1 = require("../../utils/colors");
const commander_1 = require("commander");
const handle_error_1 = require("../components/commands/add/utils/handle-error");
exports.listVersionsCommand = new commander_1.Command()
    .name('list-versions')
    .description('List all versions of a pipe')
    .requiredOption('--name <name>', 'name of the pipe')
    .action((opts) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield fetch(`${constants_1.API_BASE_URL}/api/plugins/list-versions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${credentials_1.Credentials.getApiKey()}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: opts.name,
            }),
        });
        if (!response.ok) {
            const error = yield response.json();
            throw new Error(`failed to list versions ${error.error}`);
        }
        const data = yield response.json();
        console.log(colors_1.colors.header(`plugin Information`));
        console.log(colors_1.colors.listItem(`${colors_1.colors.label("Name")} ${opts.name}`));
        console.log(colors_1.colors.listItem(`${colors_1.colors.label("ID")} ${data.plugin_id}`));
        console.log(colors_1.colors.header("version History"));
        data.versions.forEach((version) => {
            const status = version.status === "published"
                ? colors_1.colors.success(version.status)
                : colors_1.colors.warning(version.status);
            console.log(colors_1.colors.primary(`\n  ${colors_1.symbols.arrow} version ${colors_1.colors.bold(version.version)} ${colors_1.colors.dim(`(${status})`)}`));
            console.log(colors_1.colors.listItem(`${colors_1.colors.label("created")} ${new Date(version.created_at).toLocaleString()}`));
            console.log(colors_1.colors.listItem(`${colors_1.colors.label("size")} ${(version.file_size / 1024).toFixed(2)} KB`));
            console.log(colors_1.colors.listItem(`${colors_1.colors.label("hash")} ${colors_1.colors.dim(version.file_hash)}`));
            if (version.changelog) {
                console.log(colors_1.colors.listItem(`${colors_1.colors.label("changelog")} ${version.changelog}`));
            }
        });
    }
    catch (error) {
        if (error instanceof Error) {
            (0, handle_error_1.handleError)(`\n${colors_1.symbols.error} list versions failed: ${error.message}`);
        }
        else {
            (0, handle_error_1.handleError)(`\n${colors_1.symbols.error} list versions failed with unexpected error`);
        }
    }
}));
