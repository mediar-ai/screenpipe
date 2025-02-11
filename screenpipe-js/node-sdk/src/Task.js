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
exports.Task = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
class Task {
    constructor(name) {
        this._time = null;
        this._handler = null;
        this._cronTask = null;
        this._name = name;
        this._interval = 0;
    }
    every(interval) {
        this._interval = interval;
        return this;
    }
    at(time) {
        this._time = time;
        return this;
    }
    do(handler) {
        this._handler = handler;
        return this;
    }
    schedule() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._handler) {
                throw new Error(`No handler defined for task: ${this._name}`);
            }
            const cronExpression = this.toCronExpression();
            this._cronTask = node_cron_1.default.schedule(cronExpression, this._handler, {
                name: this._name,
            });
        });
    }
    stop() {
        var _a;
        return (_a = this._cronTask) === null || _a === void 0 ? void 0 : _a.stop();
    }
    toCronExpression() {
        if (typeof this._interval === "number") {
            const minutes = Math.floor(this._interval / 60000);
            return `*/${minutes} * * * *`;
        }
        const [value, unit] = this._interval.split(" ");
        switch (unit) {
            case "second":
            case "seconds":
                return `*/${value} * * * * *`;
            case "minute":
            case "minutes":
                return `*/${value} * * * *`;
            case "hour":
            case "hours":
                return `0 */${value} * * *`;
            case "day":
            case "days":
                return `0 0 */${value} * *`;
            default:
                throw new Error(`Unsupported interval unit: ${unit}`);
        }
    }
}
exports.Task = Task;
