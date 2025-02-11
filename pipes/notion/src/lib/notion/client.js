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
exports.NotionClient = void 0;
const notion_1 = require("./notion");
class NotionClient {
    constructor(credentials) {
        this.credentials = credentials;
    }
    static validate(credentials) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (0, notion_1.validateCredentials)(credentials);
        });
    }
    createLog(logEntry) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (0, notion_1.syncWorkLog)(this.credentials, logEntry);
        });
    }
    createIntelligence(intelligence) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (0, notion_1.syncIntelligence)(this.credentials, intelligence);
        });
    }
}
exports.NotionClient = NotionClient;
