"use strict";
"use client";
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
exports.StartWorkflow = StartWorkflow;
const button_1 = require("@/components/ui/button");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
function StartWorkflow() {
    const [status, setStatus] = (0, react_1.useState)('idle');
    const [completedMode, setCompletedMode] = (0, react_1.useState)(null);
    const [steps, setSteps] = (0, react_1.useState)([]);
    const [queueStats, setQueueStats] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        if (status === 'running') {
            const interval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                const statusRes = yield fetch('/api/workflow/status');
                const data = yield statusRes.json();
                setSteps(data.steps);
                setQueueStats(data.queueStats);
                if (!data.isRunning) {
                    setStatus('complete');
                    clearInterval(interval);
                }
            }), 1000);
            return () => clearInterval(interval);
        }
    }, [status]);
    const startWorkflow = (mode) => __awaiter(this, void 0, void 0, function* () {
        try {
            setStatus('running');
            setCompletedMode(null);
            const response = yield fetch('/api/workflow/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    allowTruncate: true
                })
            });
            if (!response.ok) {
                throw new Error('failed to start workflow');
            }
        }
        catch (error) {
            console.error('workflow error:', error);
            setStatus('error');
        }
    });
    return (<div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="text-sm">introduction requester:</span>
        <div className="flex gap-2">
          <button_1.Button onClick={() => startWorkflow('test')} disabled={status === 'running'} variant="outline" className="flex items-center gap-2">
            {status === 'running' ? (<lucide_react_1.Loader2 className="w-4 h-4 animate-spin"/>) : status === 'complete' && completedMode === 'test' ? (<lucide_react_1.Check className="w-4 h-4"/>) : (<lucide_react_1.Play className="w-4 h-4"/>)}
            test run (1 profile)
          </button_1.Button>
          <button_1.Button onClick={() => startWorkflow('full')} disabled={status === 'running'} className="flex items-center gap-2">
            {status === 'running' ? (<lucide_react_1.Loader2 className="w-4 h-4 animate-spin"/>) : status === 'complete' && completedMode === 'full' ? (<lucide_react_1.Check className="w-4 h-4"/>) : (<lucide_react_1.Play className="w-4 h-4"/>)}
            full run
          </button_1.Button>
        </div>
      </div>

      {steps.length > 0 && (<div className="mt-4 space-y-2 text-sm">
          {steps.map((step, i) => (<div key={i} className="flex items-center gap-2">
              {step.status === 'running' && <lucide_react_1.Loader2 className="w-3 h-3 animate-spin"/>}
              {step.status === 'done' && <div className="w-3 h-3 rounded-full bg-green-500"/>}
              {step.status === 'error' && <div className="w-3 h-3 rounded-full bg-red-500"/>}
              <span className="font-medium">{step.step}:</span>
              <span className="text-gray-600">{step.details}</span>
            </div>))}
          
          {queueStats && (<div className="mt-2 p-2 bg-gray-50 rounded-md">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>profiles in queue: {queueStats.currentQueueSize}</div>
                <div>total visited: {queueStats.totalVisited}</div>
                <div>newly queued: {queueStats.newlyQueued}</div>
                <div>already processed: {queueStats.alreadyVisited}</div>
              </div>
            </div>)}
        </div>)}
    </div>);
}
