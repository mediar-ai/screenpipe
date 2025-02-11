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
exports.GET = GET;
const server_1 = require("next/server");
const storage_1 = require("../../../../lib/storage/storage");
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const connections = yield (0, storage_1.loadConnections)();
            const now = new Date();
            const nextHarvestTime = connections.nextHarvestTime ? new Date(connections.nextHarvestTime) : null;
            console.log('checking harvest conditions:', {
                nextHarvestTime: nextHarvestTime === null || nextHarvestTime === void 0 ? void 0 : nextHarvestTime.toISOString(),
                currentStatus: connections.harvestingStatus,
            });
            // If it's time to harvest
            if (nextHarvestTime && now >= nextHarvestTime) {
                // Don't start if already running
                if (connections.harvestingStatus === 'running') {
                    yield (0, storage_1.saveCronLog)({
                        timestamp: now.toISOString(),
                        action: 'check',
                        result: 'already running',
                        nextHarvestTime: nextHarvestTime.toISOString()
                    });
                    return server_1.NextResponse.json({ message: 'harvest already running' });
                }
                console.log('starting harvest: next harvest time reached');
                const startResponse = yield fetch('http://localhost:3000/api/harvest/start', {
                    method: 'POST',
                });
                if (!startResponse.ok) {
                    yield (0, storage_1.saveCronLog)({
                        timestamp: now.toISOString(),
                        action: 'check',
                        result: 'failed to start',
                        nextHarvestTime: nextHarvestTime.toISOString()
                    });
                    throw new Error('failed to start harvest');
                }
                yield (0, storage_1.saveCronLog)({
                    timestamp: now.toISOString(),
                    action: 'check',
                    result: 'started harvest',
                    nextHarvestTime: nextHarvestTime.toISOString()
                });
                return server_1.NextResponse.json({ message: 'harvest started' });
            }
            yield (0, storage_1.saveCronLog)({
                timestamp: now.toISOString(),
                action: 'check',
                result: 'not time yet',
                nextHarvestTime: nextHarvestTime === null || nextHarvestTime === void 0 ? void 0 : nextHarvestTime.toISOString()
            });
            return server_1.NextResponse.json({
                message: 'harvest check completed, not time yet',
                nextHarvestTime: nextHarvestTime === null || nextHarvestTime === void 0 ? void 0 : nextHarvestTime.toISOString()
            });
        }
        catch (error) {
            console.error('error in harvest check:', error);
            yield (0, storage_1.saveCronLog)({
                timestamp: new Date().toISOString(),
                action: 'check',
                result: `error: ${error}`
            });
            return server_1.NextResponse.json({ error: 'failed to check harvest status' }, { status: 500 });
        }
    });
}
