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
exports.PipeApi = void 0;
class PipeApi {
    constructor(baseUrl = "http://localhost:3030") {
        this.baseUrl = baseUrl;
    }
    listPipes() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch(`${this.baseUrl}/pipes/list`);
                if (!response.ok) {
                    throw new Error(`failed to fetch pipes: ${response.statusText}`);
                }
                const data = yield response.json();
                if (!data.success) {
                    throw new Error("failed to list pipes: api returned success: false");
                }
                return data.data;
            }
            catch (error) {
                console.error("error listing pipes:", error);
                throw error;
            }
        });
    }
    startAudio(deviceName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const type = deviceName.includes("(input)") ? "Input" : "Output";
                const name = deviceName.replaceAll("(input)", "").replaceAll("(output)", "").trim();
                const response = yield fetch(`${this.baseUrl}/audio/start`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        device_name: name,
                        device_type: type,
                    }),
                });
                if (!response.ok) {
                    throw new Error(`failed to start audio: ${response.statusText}`);
                }
                const data = yield response.json();
                if (!data.success) {
                    throw new Error(`failed to start audio: ${data.message}`);
                }
            }
            catch (error) {
                console.error("error starting audio:", error);
                throw error;
            }
        });
    }
    stopAudio(deviceName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const type = deviceName.includes("(input)") ? "Input" : "Output";
                const name = deviceName.replaceAll("(input)", "").replaceAll("(output)", "").trim();
                const response = yield fetch(`${this.baseUrl}/audio/stop`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        device_name: name,
                        device_type: type,
                    }),
                });
                if (!response.ok) {
                    throw new Error(`failed to stop audio: ${response.statusText}`);
                }
                const data = yield response.json();
                if (!data.success) {
                    throw new Error(`failed to stop audio: ${data.message}`);
                }
            }
            catch (error) {
                console.error("error stopping audio:", error);
                throw error;
            }
        });
    }
}
exports.PipeApi = PipeApi;
