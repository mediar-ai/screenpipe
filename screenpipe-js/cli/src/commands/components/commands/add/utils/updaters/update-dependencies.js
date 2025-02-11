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
exports.updateDependencies = updateDependencies;
const execa_1 = require("execa");
const logger_1 = require("../logger");
function updateDependencies(dependencies, cwd, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        dependencies = Array.from(new Set(dependencies));
        if (!(dependencies === null || dependencies === void 0 ? void 0 : dependencies.length)) {
            return;
        }
        options = Object.assign({ silent: false }, options);
        const dependenciesSpinner = (_a = (0, logger_1.spinner)(`Installing dependencies.`, {
            silent: options.silent,
        })) === null || _a === void 0 ? void 0 : _a.start();
        dependenciesSpinner === null || dependenciesSpinner === void 0 ? void 0 : dependenciesSpinner.start();
        yield (0, execa_1.execa)('bun', [
            "add",
            ...dependencies,
            ...(options.devDependency ? [`--dev`] : []),
        ], {
            cwd: cwd,
        });
        dependenciesSpinner === null || dependenciesSpinner === void 0 ? void 0 : dependenciesSpinner.succeed();
    });
}
