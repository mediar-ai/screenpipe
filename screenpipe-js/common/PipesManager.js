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
exports.PipesManager = void 0;
class PipesManager {
    list() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiUrl = "http://localhost:3030";
                const response = yield fetch(`${apiUrl}/pipes/list`, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                });
                const data = yield response.json();
                return data.data;
            }
            catch (error) {
                console.error("failed to list pipes:", error);
                return [];
            }
        });
    }
    download(url) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiUrl = "http://localhost:3030";
                const response = yield fetch(`${apiUrl}/pipes/download`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        url,
                    }),
                });
                return response.ok;
            }
            catch (error) {
                console.error("failed to download pipe:", error);
                return false;
            }
        });
    }
    enable(pipeId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiUrl = "http://localhost:3030";
                const response = yield fetch(`${apiUrl}/pipes/enable`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        pipe_id: pipeId,
                    }),
                });
                return response.ok;
            }
            catch (error) {
                console.error("failed to enable pipe:", error);
                return false;
            }
        });
    }
    disable(pipeId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiUrl = "http://localhost:3030";
                const response = yield fetch(`${apiUrl}/pipes/disable`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        pipe_id: pipeId,
                    }),
                });
                return response.ok;
            }
            catch (error) {
                console.error("failed to disable pipe:", error);
                return false;
            }
        });
    }
    update(pipeId, config) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiUrl = "http://localhost:3030";
                const response = yield fetch(`${apiUrl}/pipes/update`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        pipe_id: pipeId,
                        config,
                    }),
                });
                return response.ok;
            }
            catch (error) {
                console.error("failed to update pipe:", error);
                return false;
            }
        });
    }
}
exports.PipesManager = PipesManager;
