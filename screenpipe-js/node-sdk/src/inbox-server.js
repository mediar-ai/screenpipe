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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.actionCallbacks = void 0;
exports.startInboxServer = startInboxServer;
// inbox-server.ts
const express_1 = __importDefault(require("express"));
const actionCallbacks = new Map();
exports.actionCallbacks = actionCallbacks;
function startInboxServer(port) {
    return __awaiter(this, void 0, void 0, function* () {
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        // cors middleware
        app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.header("Access-Control-Allow-Headers", "Content-Type");
            if (req.method === "OPTIONS") {
                res.sendStatus(200);
                return;
            }
            next();
        });
        app.post("/action", (req, res) => {
            const { action } = req.body;
            const callback = actionCallbacks.get(action);
            if (callback) {
                callback()
                    .then(() => {
                    res.json({ success: true });
                    actionCallbacks.delete(action);
                })
                    .catch((error) => {
                    console.error("action callback failed:", error);
                    res.status(500).json({ success: false, error: error.message });
                });
            }
            else {
                res.status(404).json({ success: false, error: "action not found" });
            }
        });
        return new Promise((resolve) => {
            app.listen(port, () => {
                console.log(`action server listening on port ${port}`);
                resolve(app);
            });
        });
    });
}
