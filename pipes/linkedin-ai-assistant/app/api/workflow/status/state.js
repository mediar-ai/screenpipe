"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueStats = exports.currentSteps = void 0;
exports.setRunningState = setRunningState;
exports.updateWorkflowStep = updateWorkflowStep;
exports.updateQueueStats = updateQueueStats;
exports.getState = getState;
let isRunning = false;
exports.currentSteps = [];
exports.queueStats = null;
function setRunningState(state) {
    isRunning = state;
    if (state) {
        exports.currentSteps = [];
        exports.queueStats = null;
    }
}
function updateWorkflowStep(step, status, details) {
    const existingStep = exports.currentSteps.find(s => s.step === step);
    if (existingStep) {
        existingStep.status = status;
        existingStep.details = details;
    }
    else {
        exports.currentSteps.push({ step, status, details });
    }
}
function updateQueueStats(stats) {
    exports.queueStats = stats;
}
function getState() {
    return {
        isRunning,
        steps: exports.currentSteps,
        queueStats: exports.queueStats
    };
}
