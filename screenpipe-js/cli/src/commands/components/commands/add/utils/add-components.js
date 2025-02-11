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
exports.addComponents = addComponents;
const handle_error_1 = require("./handle-error");
const api_1 = require("../registry/api");
const update_dependencies_1 = require("./updaters/update-dependencies");
const logger_1 = require("./logger");
const update_files_1 = require("./updaters/update-files");
function addComponents(components, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const registrySpinner = (_a = (0, logger_1.spinner)(`Checking registry.`, {
            silent: options.silent,
        })) === null || _a === void 0 ? void 0 : _a.start();
        const tree = (0, api_1.registryResolveItemsTree)(components);
        if (!tree) {
            registrySpinner === null || registrySpinner === void 0 ? void 0 : registrySpinner.fail();
            return (0, handle_error_1.handleError)(new Error("Failed to fetch components from registry."));
        }
        registrySpinner === null || registrySpinner === void 0 ? void 0 : registrySpinner.succeed();
        yield (0, update_dependencies_1.updateDependencies)(tree.dependencies, options.cwd, {
            silent: options.silent,
        });
        yield (0, update_dependencies_1.updateDependencies)(tree.devDependencies, options.cwd, {
            silent: options.silent,
            devDependency: true
        });
        yield (0, update_files_1.updateFiles)(tree.files, {
            cwd: options.cwd,
            overwrite: options.overwrite,
            silent: options.silent,
        });
    });
}
