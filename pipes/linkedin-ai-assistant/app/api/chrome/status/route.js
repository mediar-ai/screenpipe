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
exports.runtime = void 0;
exports.GET = GET;
const server_1 = require("next/server");
const route_logger_1 = require("@/lib/route-logger");
exports.runtime = 'nodejs';
const logger = new route_logger_1.RouteLogger('chrome-status');
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            logger.log('checking chrome connection status...');
            const response = yield fetch('http://127.0.0.1:9222/json/version');
            if (!response.ok) {
                logger.log('chrome not connected');
                return server_1.NextResponse.json({
                    status: 'not_connected',
                    logs: logger.getLogs()
                }, { status: 200 });
            }
            const data = yield response.json();
            logger.log('chrome connected, getting websocket url');
            const wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
            logger.log(`websocket url: ${wsUrl}`);
            return server_1.NextResponse.json({
                wsUrl,
                status: 'connected',
                logs: logger.getLogs()
            });
        }
        catch (error) {
            logger.error(`error checking status: ${error}`);
            return server_1.NextResponse.json({
                status: 'not_connected',
                error: String(error),
                logs: logger.getLogs()
            }, { status: 200 });
        }
    });
}
