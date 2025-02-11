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
exports.POST = POST;
const server_1 = require("next/server");
const harvest_connections_1 = require("@/lib/logic-sequence/harvest-connections");
const storage_1 = require("@/lib/storage/storage");
function POST() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield (0, storage_1.setStopRequested)(true);
            yield (0, harvest_connections_1.stopHarvesting)();
            yield (0, storage_1.saveHarvestingState)('stopped');
            // Give time for state to update
            yield new Promise(resolve => setTimeout(resolve, 500));
            return server_1.NextResponse.json({
                message: 'stopping farming process',
                harvestingStatus: 'stopped'
            });
        }
        catch (error) {
            return server_1.NextResponse.json({ message: error.message.toLowerCase() }, { status: 500 });
        }
    });
}
