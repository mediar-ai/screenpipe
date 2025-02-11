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
exports.fetchCache = exports.dynamic = void 0;
exports.GET = GET;
const server_1 = require("next/server");
const storage_1 = require("@/lib/storage/storage");
exports.dynamic = 'force-dynamic';
exports.fetchCache = 'force-no-store';
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const connectionsStore = yield (0, storage_1.loadConnections)();
            const isAlive = yield (0, storage_1.isHarvestingAlive)();
            // Reset state if process is dead but status is running
            if (connectionsStore.harvestingStatus === 'running' && !isAlive) {
                console.log('detected dead harvest process, resetting state to stopped');
                yield (0, storage_1.saveHarvestingState)('stopped');
                connectionsStore.harvestingStatus = 'stopped';
            }
            // Calculate stats using reduce
            const stats = Object.values(connectionsStore.connections).reduce((acc, connection) => {
                const status = connection.status || 'pending';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});
            return server_1.NextResponse.json({
                stats: {
                    pending: (stats === null || stats === void 0 ? void 0 : stats.pending) || 0,
                    accepted: (stats === null || stats === void 0 ? void 0 : stats.accepted) || 0,
                    declined: (stats === null || stats === void 0 ? void 0 : stats.declined) || 0,
                    email_required: (stats === null || stats === void 0 ? void 0 : stats.email_required) || 0,
                    cooldown: (stats === null || stats === void 0 ? void 0 : stats.cooldown) || 0,
                    total: Object.keys(connectionsStore.connections).length,
                    lastRefreshDuration: connectionsStore.lastRefreshDuration,
                    averageProfileCheckDuration: connectionsStore.averageProfileCheckDuration,
                    withdrawStatus: connectionsStore.withdrawStatus || {
                        isWithdrawing: false
                    }
                },
                isAlive,
                harvestingStatus: connectionsStore.harvestingStatus,
                nextHarvestTime: connectionsStore.nextHarvestTime,
                connectionsSent: connectionsStore.connectionsSent,
                statusMessage: connectionsStore.statusMessage
            });
        }
        catch (error) {
            console.error('stats check failed:', error);
            return server_1.NextResponse.json({ error: error.message }, { status: 500 });
        }
    });
}
