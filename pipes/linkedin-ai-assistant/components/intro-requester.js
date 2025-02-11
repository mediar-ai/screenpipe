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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntroRequester = IntroRequester;
const button_1 = require("@/components/ui/button");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const template_editor_1 = __importDefault(require("@/components/template-editor"));
const state_viewer_1 = __importDefault(require("@/components/state-viewer"));
const templates_json_1 = __importDefault(require("@/lib/storage/templates.json"));
function IntroRequester() {
    const [status, setStatus] = (0, react_1.useState)('idle');
    const [completedMode, setCompletedMode] = (0, react_1.useState)(null);
    const [steps, setSteps] = (0, react_1.useState)([]);
    const [queueStats, setQueueStats] = (0, react_1.useState)(null);
    const [showSettings, setShowSettings] = (0, react_1.useState)(false);
    const [searchUrl, setSearchUrl] = (0, react_1.useState)(templates_json_1.default['paste-here-url-from-linkedin-with-2nd-grade-connections']);
    (0, react_1.useEffect)(() => {
        const handleStorageChange = () => __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch('/api/get-template');
                const template = yield response.json();
                setSearchUrl(template.paste_here_url_from_linkedin_with_2nd_grade_connections);
            }
            catch (error) {
                console.error('failed to get template:', error);
            }
        });
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);
    const isUrlValid = searchUrl.includes('linkedin.com/search');
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
        <span className="text-lg font-medium">introduction requester (experimental)</span>
        <button_1.Button variant="ghost" onClick={() => setShowSettings(!showSettings)} className={`text-gray-500 hover:text-gray-700 ${showSettings ? 'bg-gray-100' : ''}`}>
          {showSettings ? 'hide' : 'show'}
        </button_1.Button>
      </div>

      {showSettings && (<div className="mt-6 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button_1.Button onClick={() => startWorkflow('test')} disabled={status === 'running' || !isUrlValid} variant="outline" className="flex items-center gap-2">
                  {status === 'running' ? (<lucide_react_1.Loader2 className="w-4 h-4 animate-spin"/>) : status === 'complete' && completedMode === 'test' ? (<lucide_react_1.Check className="w-4 h-4"/>) : (<lucide_react_1.Play className="w-4 h-4"/>)}
                  test run (1 profile)
                </button_1.Button>
                <button_1.Button onClick={() => startWorkflow('full')} disabled={status === 'running' || !isUrlValid} className="flex items-center gap-2">
                  {status === 'running' ? (<lucide_react_1.Loader2 className="w-4 h-4 animate-spin"/>) : status === 'complete' && completedMode === 'full' ? (<lucide_react_1.Check className="w-4 h-4"/>) : (<lucide_react_1.Play className="w-4 h-4"/>)}
                  full run
                </button_1.Button>
              </div>
              {!isUrlValid && (<span className="text-red-500 text-sm">
                  please provide URL for target LinkedIn search in settings
                </span>)}
            </div>
            <template_editor_1.default initialTemplate={templates_json_1.default} defaultOpen={false}/>
            <state_viewer_1.default defaultOpen={false}/>
          </div>
        </div>)}

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
