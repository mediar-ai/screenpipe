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
exports.InboxManager = void 0;
const child_process_1 = require("child_process");
const net_1 = require("net");
function getAvailablePort() {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const server = (0, net_1.createServer)();
            server.unref();
            server.on("error", reject);
            server.listen(0, () => {
                const port = server.address().port;
                server.close(() => resolve(port));
            });
        });
    });
}
class InboxManager {
    send(message) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.actionServerPort) {
                this.actionServerPort = yield getAvailablePort();
                this.actionServerProcess = (0, child_process_1.fork)("./inbox-server.js", [
                    this.actionServerPort.toString(),
                ]);
            }
            if (message.actions) {
                message.actions = message.actions.map((action) => {
                    const actionId = crypto.randomUUID();
                    return {
                        label: action.label,
                        action: actionId,
                        port: this.actionServerPort,
                        callback: action.callback,
                    };
                });
            }
            try {
                const response = yield fetch("http://localhost:11435/inbox", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(Object.assign(Object.assign({}, message), { type: "inbox", actionServerPort: this.actionServerPort })),
                });
                return response.ok;
            }
            catch (error) {
                console.error("failed to send inbox message:", error);
                return false;
            }
        });
    }
}
exports.InboxManager = InboxManager;
