"use strict";
"use server";
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
exports.getScreenpipeAppSettings = getScreenpipeAppSettings;
exports.updateScreenpipeAppSettings = updateScreenpipeAppSettings;
const js_1 = require("@screenpipe/js");
function getScreenpipeAppSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        return yield js_1.pipe.settings.getAll();
    });
}
function updateScreenpipeAppSettings(newSettings) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield js_1.pipe.settings.update(newSettings);
    });
}
