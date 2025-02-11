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
const react_1 = __importDefault(require("react"));
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const navigation_1 = __importDefault(require("./navigation"));
const use_toast_1 = require("@/components/ui/use-toast");
const core_1 = require("@tauri-apps/api/core");
const posthog_js_1 = __importDefault(require("posthog-js"));
const store_1 = require("@/lib/api/store");
const use_settings_1 = require("@/lib/hooks/use-settings");
const OnboardingPipeStore = ({ className = "", handlePrevSlide, handleNextSlide, }) => {
    const [isLoading, setIsLoading] = react_1.default.useState(false);
    const [status, setStatus] = react_1.default.useState("");
    const { settings } = (0, use_settings_1.useSettings)();
    const handleOpenSearchPipe = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        setIsLoading(true);
        try {
            posthog_js_1.default.capture("open_search_pipe_from_onboarding");
            // Create initial toast
            const t = (0, use_toast_1.toast)({
                title: "opening search pipe",
                description: "please wait...",
                duration: 5000,
            });
            // Check if screenpipe is running, if not spawn it
            try {
                yield fetch("http://localhost:3030/health");
            }
            catch (error) {
                // Screenpipe not running, try to spawn it
                yield (0, core_1.invoke)("stop_screenpipe");
                yield new Promise((resolve) => setTimeout(resolve, 1000));
                yield (0, core_1.invoke)("spawn_screenpipe");
                yield new Promise((resolve) => setTimeout(resolve, 5000));
            }
            // First check if pipe is installed by listing pipes
            const listResponse = yield fetch("http://localhost:3030/pipes/list");
            const listData = yield listResponse.json();
            const searchPipe = listData.data.find((p) => { var _a; return ((_a = p.config) === null || _a === void 0 ? void 0 : _a.id) === "search"; });
            // If not installed, download it first
            if (!searchPipe) {
                setStatus("downloading search pipe... (~10s)");
                const pipeApi = yield store_1.PipeApi.create((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token);
                const storePlugins = yield pipeApi.listStorePlugins();
                const downloadData = yield pipeApi.downloadPipe((_b = storePlugins.find((p) => p.name === "search")) === null || _b === void 0 ? void 0 : _b.id);
                yield fetch("http://localhost:3030/pipes/download-private", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pipe_name: "search",
                        pipe_id: "search",
                        url: downloadData.download_url,
                    }),
                });
                // Wait for download to complete
                yield new Promise((resolve) => setTimeout(resolve, 2000));
            }
            // Enable the search pipe
            setStatus("enabling search pipe... (~10s)");
            yield fetch("http://localhost:3030/pipes/enable", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ pipe_id: "search" }),
            });
            // Wait for pipe to initialize
            setStatus("initializing search pipe... (~10s)");
            yield new Promise((resolve) => setTimeout(resolve, 2000));
            // Get updated pipe info to find the port
            const response = yield fetch("http://localhost:3030/pipes/list");
            const data = yield response.json();
            const updatedSearchPipe = data.data.find((p) => { var _a; return ((_a = p.config) === null || _a === void 0 ? void 0 : _a.id) === "search"; });
            if (!((_c = updatedSearchPipe === null || updatedSearchPipe === void 0 ? void 0 : updatedSearchPipe.config) === null || _c === void 0 ? void 0 : _c.port)) {
                throw new Error("search pipe not found or port not configured");
            }
            // Check if pipe is actually running
            try {
                yield fetch(`http://localhost:${updatedSearchPipe.config.port}`, {
                    mode: "no-cors",
                });
            }
            catch (error) {
                throw new Error("search pipe failed to start");
            }
            // Open the pipe window
            yield (0, core_1.invoke)("open_pipe_window", {
                port: updatedSearchPipe.config.port,
                title: "search",
            });
            t.update({
                id: t.id,
                title: "search pipe ready",
                description: "you can now search through your recordings",
                duration: 2000,
            });
        }
        catch (error) {
            console.error("failed to open search pipe:", error);
            (0, use_toast_1.toast)({
                title: "error opening search pipe",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
        finally {
            setIsLoading(false);
            setStatus("");
        }
    });
    return (<div className={`${className} w-full h-screen flex flex-col px-6 overflow-y-auto`}>
      <div className="flex-1 flex flex-col items-center">
        <div className="flex flex-col items-center mb-8">
          <img className="w-24 h-24" src="/128x128.png" alt="screenpipe-logo"/>
          <h1 className="text-2xl font-bold mt-4">welcome to the pipe store</h1>
        </div>

        <div className="space-y-8 max-w-2xl mx-auto w-full">
          {/* Store preview image */}
          <img src="/pipe-store-preview.png" alt="pipe store interface" className="w-full rounded-lg border shadow-sm"/>

          <div className="space-y-4 text-center">
            <p className="text-muted-foreground my-2">
              screenpipe records your screen and audio 24/7 and makes it easy
              for AI to search through your recordings. developers can create
              powerful apps on top of screenpipe. let&apos;s start with
              &quot;search&quot; to explore your recordings. once in the search
              pipe, you can use the &quot;search&quot; button to search through
              your recordings and ask a summary to AI.
            </p>

            <div className="flex flex-col items-center">
              <button_1.Button size="lg" className="gap-2 my-8" onClick={handleOpenSearchPipe} disabled={isLoading}>
                {isLoading ? (<lucide_react_1.Loader2 className="w-4 h-4 animate-spin"/>) : (<lucide_react_1.Search className="w-4 h-4"/>)}
                {isLoading ? "opening search..." : "open search pipe"}
              </button_1.Button>
              {status && (<p className="text-sm text-muted-foreground mt-1">{status}</p>)}
            </div>
          </div>
        </div>
      </div>

      <div className="my-8"/>

      <navigation_1.default className="py-6" handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide} prevBtnText="previous" nextBtnText="end"/>
    </div>);
};
exports.default = OnboardingPipeStore;
