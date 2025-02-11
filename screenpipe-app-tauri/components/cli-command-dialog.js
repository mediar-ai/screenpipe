"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliCommandDialog = CliCommandDialog;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const dialog_1 = require("./ui/dialog");
const codeblock_1 = require("./ui/codeblock");
const use_copy_to_clipboard_1 = require("@/lib/hooks/use-copy-to-clipboard");
const use_toast_1 = require("@/components/ui/use-toast");
const icons_1 = require("./ui/icons");
const utils_1 = require("@/lib/utils");
const tabs_1 = require("./ui/tabs");
const plugin_os_1 = require("@tauri-apps/plugin-os");
function CliCommandDialog({ settings }) {
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const { copyToClipboard } = (0, use_copy_to_clipboard_1.useCopyToClipboard)({ timeout: 2000 });
    const { toast } = (0, use_toast_1.useToast)();
    const [isWindows, setIsWindows] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const p = (0, plugin_os_1.platform)();
        setIsWindows(p === "windows");
    }, []);
    const generateCliCommand = () => {
        const cliPath = (0, utils_1.getCliPath)();
        let envVars = [];
        let args = [];
        if (settings.useChineseMirror) {
            envVars.push('HF_ENDPOINT="https://hf-mirror.com"');
        }
        if (settings.audioTranscriptionEngine !== "default") {
            // TBD hard coded for now
            // if someone wants to use deepgram / screenpipe cloud in CLI mode they'll ask us
            args.push(`--audio-transcription-engine whisper-large-v3-turbo`);
        }
        if (settings.ocrEngine !== "default") {
            args.push(`--ocr-engine ${settings.ocrEngine}`);
        }
        if (settings.monitorIds.length > 0 &&
            settings.monitorIds[0] !== "default") {
            settings.monitorIds.forEach((id) => args.push(`--monitor-id ${id}`));
        }
        if (settings.languages.length > 0) {
            settings.languages.forEach((id) => args.push(`--language ${id}`));
        }
        if (settings.audioDevices.length > 0 &&
            settings.audioDevices[0] !== "default") {
            settings.audioDevices.forEach((device) => args.push(`--audio-device "${device}"`));
        }
        if (settings.usePiiRemoval) {
            args.push("--use-pii-removal");
        }
        if (settings.restartInterval > 0) {
            args.push(`--restart-interval ${settings.restartInterval}`);
        }
        if (settings.disableAudio) {
            args.push("--disable-audio");
        }
        settings.ignoredWindows.forEach((window) => args.push(`--ignored-windows "${window}"`));
        settings.includedWindows.forEach((window) => args.push(`--included-windows "${window}"`));
        if (settings.deepgramApiKey && settings.deepgramApiKey !== "default") {
            args.push(`--deepgram-api-key "${settings.deepgramApiKey}"`);
        }
        if (settings.fps !== 0.2) {
            args.push(`--fps ${settings.fps}`);
        }
        if (settings.vadSensitivity !== "high") {
            args.push(`--vad-sensitivity ${settings.vadSensitivity}`);
        }
        if (!settings.analyticsEnabled) {
            args.push("--disable-telemetry");
        }
        if (settings.audioChunkDuration !== 30) {
            args.push(`--audio-chunk-duration ${settings.audioChunkDuration}`);
        }
        if (settings.languages.length > 0) {
            settings.languages.forEach((id) => args.push(`--language ${id}`));
        }
        if (settings.enableFrameCache) {
            args.push("--enable-frame-cache");
        }
        if (settings.enableUiMonitoring) {
            args.push("--enable-ui-monitoring");
        }
        if (settings.enableRealtimeAudioTranscription) {
            args.push("--enable-realtime-audio-transcription");
        }
        const envVarsStr = envVars.length > 0 ? `${envVars.join(" ")} ` : "";
        return `${envVarsStr}${cliPath} ${args.join(" ")}`;
    };
    const handleCopyCliCommand = () => {
        const command = generateCliCommand();
        copyToClipboard(command);
        toast({
            title: "CLI command copied",
            description: "The CLI command has been copied to your clipboard.",
        });
    };
    return (<>
      <button_1.Button variant="outline" size="icon" onClick={() => setIsOpen(true)}>
        <icons_1.IconCode className="h-4 w-4"/>
      </button_1.Button>
      <dialog_1.Dialog open={isOpen} onOpenChange={setIsOpen}>
        <dialog_1.DialogContent className="max-w-2xl">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>CLI command</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              you can use this CLI command to start screenpipe with the current
              settings.
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="overflow-x-auto">
            {isWindows ? (<tabs_1.Tabs defaultValue="cmd">
                <tabs_1.TabsList>
                  <tabs_1.TabsTrigger value="cmd">cmd</tabs_1.TabsTrigger>
                  <tabs_1.TabsTrigger value="powershell">powershell</tabs_1.TabsTrigger>
                </tabs_1.TabsList>
                <tabs_1.TabsContent value="cmd">
                  <codeblock_1.CodeBlock language="bash" value={generateCliCommand()}/>
                </tabs_1.TabsContent>
                <tabs_1.TabsContent value="powershell">
                  <codeblock_1.CodeBlock language="powershell" value={generateCliCommand()}/>
                </tabs_1.TabsContent>
              </tabs_1.Tabs>) : (<codeblock_1.CodeBlock language="bash" value={generateCliCommand()}/>)}
          </div>
          <dialog_1.DialogFooter>
            <button_1.Button onClick={handleCopyCliCommand}>Copy to Clipboard</button_1.Button>
          </dialog_1.DialogFooter>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </>);
}
