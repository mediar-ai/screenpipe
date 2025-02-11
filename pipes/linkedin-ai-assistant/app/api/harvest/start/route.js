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
exports.POST = POST;
const server_1 = require("next/server");
const harvest_connections_1 = require("@/lib/logic-sequence/harvest-connections");
const storage_1 = require("@/lib/storage/storage");
const chrome_session_1 = require("@/lib/chrome-session");
const crypto_1 = __importDefault(require("crypto"));
function POST() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('farming start endpoint called');
            const connections = yield (0, storage_1.loadConnections)();
            // Check if process is actually running via heartbeat
            if (connections.harvestingStatus === 'running') {
                const isAlive = yield (0, storage_1.isHarvestingAlive)();
                if (!isAlive) {
                    console.log('detected dead harvest process, resetting state');
                    yield (0, storage_1.saveHarvestingState)('stopped');
                }
                else {
                    console.log('farming already in progress');
                    return server_1.NextResponse.json({
                        message: 'farming already in progress',
                        harvestingStatus: 'running',
                        weeklyLimitReached: false,
                        dailyLimitReached: false,
                        connectionsSent: connections.connectionsSent || 0
                    }, { status: 200 });
                }
            }
            // Generate unique process ID for this harvest run
            const processId = crypto_1.default.randomUUID();
            yield (0, storage_1.updateHeartbeat)(processId);
            // Add browser validation
            if (connections.harvestingStatus === 'running') {
                const session = chrome_session_1.ChromeSession.getInstance();
                const isValid = yield session.validateConnection();
                if (!isValid) {
                    console.log('browser connection lost, resetting state');
                    yield (0, storage_1.saveHarvestingState)('stopped');
                }
                else {
                    console.log('farming already in progress');
                    return server_1.NextResponse.json({
                        message: 'farming already in progress',
                        harvestingStatus: 'running',
                        weeklyLimitReached: false,
                        dailyLimitReached: false,
                        connectionsSent: connections.connectionsSent || 0
                    }, { status: 200 });
                }
            }
            // Check cooldown before starting
            if (connections.nextHarvestTime && new Date(connections.nextHarvestTime) > new Date()) {
                console.log('in cooldown period until:', connections.nextHarvestTime);
                return server_1.NextResponse.json({
                    message: `farming cooldown active until ${new Date(connections.nextHarvestTime).toLocaleString()}`,
                    harvestingStatus: 'cooldown',
                    weeklyLimitReached: false,
                    dailyLimitReached: false,
                    connectionsSent: connections.connectionsSent || 0,
                    nextHarvestTime: connections.nextHarvestTime
                }, { status: 429 });
            }
            // Set state to running and start harvest
            console.log('setting farming state to running');
            yield (0, storage_1.saveHarvestingState)('running');
            yield (0, storage_1.updateConnectionsSent)(0); // Reset connections counter
            console.log('starting farming process');
            const result = yield (0, harvest_connections_1.startHarvesting)(35);
            console.log('harvest result:', result);
            // If in cooldown, return 429 but include all status info
            if (result.nextHarvestTime && new Date(result.nextHarvestTime) > new Date()) {
                return server_1.NextResponse.json({
                    message: `harvesting cooldown active until ${new Date(result.nextHarvestTime).toLocaleString()}`,
                    nextHarvestTime: result.nextHarvestTime,
                    connectionsSent: result.connectionsSent,
                    weeklyLimitReached: result.weeklyLimitReached || false,
                    dailyLimitReached: result.dailyLimitReached || false,
                    harvestingStatus: 'cooldown'
                }, { status: 429 });
            }
            // Return detailed status messages based on the harvesting result
            let message = '';
            if (result.weeklyLimitReached) {
                message = `weekly limit reached, retrying at ${new Date(result.nextHarvestTime).toLocaleString()}`;
            }
            else if (result.dailyLimitReached) {
                message = `daily limit of ${result.connectionsSent} connections reached, next farming at ${new Date(result.nextHarvestTime).toLocaleString()}`;
            }
            else if (result.harvestingStatus === 'stopped') {
                message = "farming stopped";
            }
            else {
                message = `farming started, sent ${result.connectionsSent} connections so far`;
            }
            return server_1.NextResponse.json({
                message,
                weeklyLimitReached: result.weeklyLimitReached,
                dailyLimitReached: result.dailyLimitReached,
                connectionsSent: result.connectionsSent,
                nextHarvestTime: result.nextHarvestTime,
                harvestingStatus: result.harvestingStatus
            }, { status: 200 });
        }
        catch (error) {
            console.error('error starting farming:', error);
            yield (0, storage_1.saveHarvestingState)('stopped');
            return server_1.NextResponse.json({
                message: error.message.toLowerCase(),
                weeklyLimitReached: false,
                dailyLimitReached: false,
                connectionsSent: 0,
                harvestingStatus: 'stopped'
            }, { status: 500 });
        }
    });
}
