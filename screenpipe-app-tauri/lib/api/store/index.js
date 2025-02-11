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
exports.PipeApi = exports.PipeDownloadError = void 0;
const core_1 = require("@tauri-apps/api/core");
var PipeDownloadError;
(function (PipeDownloadError) {
    PipeDownloadError["PURCHASE_REQUIRED"] = "purchase required";
    PipeDownloadError["DOWNLOAD_FAILED"] = "failed to download pipe";
})(PipeDownloadError || (exports.PipeDownloadError = PipeDownloadError = {}));
class PipeApi {
    constructor(authToken) {
        this.baseUrl = "https://screenpi.pe";
        this.authToken = authToken;
    }
    static create(authToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const api = new PipeApi(authToken);
            yield api.init(authToken);
            return api;
        });
    }
    init(authToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const BASE_URL = yield (0, core_1.invoke)("get_env", { name: "BASE_URL_PRIVATE" });
                if (BASE_URL) {
                    this.baseUrl = BASE_URL;
                }
                this.authToken = authToken;
            }
            catch (error) {
                console.error("error initializing base url:", error);
            }
        });
    }
    getUserPurchaseHistory() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch(`${this.baseUrl}/api/plugins/user-purchase-history`, {
                    headers: {
                        Authorization: `Bearer ${this.authToken}`,
                    },
                });
                if (!response.ok) {
                    const { error } = (yield response.json());
                    throw new Error(`failed to fetch purchase history: ${error}`);
                }
                const data = (yield response.json());
                return data;
            }
            catch (error) {
                console.error("error getting purchase history:", error);
                throw error;
            }
        });
    }
    listStorePlugins() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch(`${this.baseUrl}/api/plugins/registry`, {
                    headers: {
                        Authorization: `Bearer ${this.authToken}`,
                    },
                });
                if (!response.ok) {
                    const { error } = yield response.json();
                    throw new Error(`failed to fetch plugins: ${error}`);
                }
                const data = yield response.json();
                return data;
            }
            catch (error) {
                console.error("error listing pipes:", error);
                throw error;
            }
        });
    }
    purchasePipe(pipeId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch(`${this.baseUrl}/api/plugins/purchase`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.authToken}`,
                    },
                    body: JSON.stringify({ pipe_id: pipeId }),
                });
                if (!response.ok) {
                    const { error } = yield response.json();
                    throw new Error(`failed to purchase pipe: ${error}`);
                }
                const data = (yield response.json());
                console.log("purchase data", data);
                return data;
            }
            catch (error) {
                console.error("error purchasing pipe:", error);
                throw error;
            }
        });
    }
    downloadPipe(pipeId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch(`${this.baseUrl}/api/plugins/download`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.authToken}`,
                    },
                    body: JSON.stringify({ pipe_id: pipeId }),
                });
                if (!response.ok) {
                    const { error } = (yield response.json());
                    throw new Error(error, {
                        cause: response.status === 403
                            ? PipeDownloadError.PURCHASE_REQUIRED
                            : PipeDownloadError.DOWNLOAD_FAILED,
                    });
                }
                const data = (yield response.json());
                return data;
            }
            catch (error) {
                console.warn("error downloading pipe:", error);
                throw error;
            }
        });
    }
    checkUpdate(pipeId, version) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch(`${this.baseUrl}/api/plugins/check-update`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.authToken}`,
                    },
                    body: JSON.stringify({ pipe_id: pipeId, version }),
                });
                if (!response.ok) {
                    const { error } = yield response.json();
                    throw new Error(`failed to check for updates: ${error}`);
                }
                const data = yield response.json();
                return data;
            }
            catch (error) {
                console.error("error checking for updates:", error);
                throw error;
            }
        });
    }
}
exports.PipeApi = PipeApi;
