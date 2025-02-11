"use strict";
"use client";
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
exports.DevModeSettings = void 0;
const react_1 = __importStar(require("react"));
const label_1 = require("./ui/label");
const switch_1 = require("./ui/switch");
const use_settings_1 = require("@/lib/hooks/use-settings");
const core_1 = require("@tauri-apps/api/core");
const use_toast_1 = require("./ui/use-toast");
const tooltip_1 = require("./ui/tooltip");
const button_1 = require("./ui/button");
const card_1 = require("./ui/card");
const cli_command_dialog_1 = require("./cli-command-dialog");
const getDebuggingCommands = (os, dataDir) => {
    let cliInstructions = "";
    if (os === "windows") {
        cliInstructions =
            "# 1. Open Command Prompt as admin (search for 'cmd' in the Start menu, right click, 'Run as admin')\n# 2. Navigate to: %LOCALAPPDATA%\\screenpipe\\\n#    Type: cd %LOCALAPPDATA%\\screenpipe\n";
    }
    else if (os === "macos") {
        cliInstructions =
            "# 1. Open Terminal\n# 2. Navigate to: /Applications/screenpipe.app/Contents/MacOS/\n#    Type: cd /Applications/screenpipe.app/Contents/MacOS/\n";
    }
    else if (os === "linux") {
        cliInstructions =
            "# 1. Open Terminal\n# 2. Navigate to: /usr/local/bin/\n#    Type: cd /usr/local/bin/\n";
    }
    else {
        cliInstructions =
            "# OS not recognized. Please check the documentation for your specific operating system.\n";
    }
    const baseInstructions = `# First, view the Screenpipe CLI arguments:
  ${cliInstructions}
  # 3. Run: screenpipe -h
  # 4. Choose your preferred setup and start Screenpipe:
  #    (Replace [YOUR_ARGS] with your chosen arguments)
  #    Example: screenpipe --fps 1 `;
    const logPath = os === "windows"
        ? `${dataDir}\\screenpipe.${new Date().toISOString().split("T")[0]}.log`
        : `${dataDir}/screenpipe.${new Date().toISOString().split("T")[0]}.log`;
    const dbPath = os === "windows" ? `${dataDir}\\db.sqlite` : `${dataDir}/db.sqlite`;
    const baseCommand = baseInstructions +
        dataDir +
        (os === "windows"
            ? `\n\n# We highly recommend adding --ocr-engine windows-native to your command.\n# This will use a very experimental but powerful engine to extract text from your screen instead of the default one.\n# Example: screenpipe --data-dir ${dataDir} --ocr-engine windows-native\n`
            : "") +
        "\n\n# 5. If you've already started Screenpipe, try these debugging commands:\n";
    if (os === "windows") {
        return (baseCommand +
            `# Stream the log:
  type "${logPath}"

  # Scroll the logs:
  more "${logPath}"

  # View last 10 frames:
  sqlite3 "${dbPath}" "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

  # View last 10 audio transcriptions:
  sqlite3 "${dbPath}" "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`);
    }
    else if (os === "macos" || os === "linux") {
        return (baseCommand +
            `# Stream the log:
  tail -f "${logPath}"

  # Scroll the logs:
  less "${logPath}"

  # View last 10 frames:
  sqlite3 "${dbPath}" "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

  # View last 10 audio transcriptions:
  sqlite3 "${dbPath}" "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`);
    }
    else {
        return "OS not recognized. \n\nPlease check the documentation for your specific operating system.";
    }
};
const DevModeSettings = ({ localDataDir }) => {
    const { settings, updateSettings } = (0, use_settings_1.useSettings)();
    const handleDevModeToggle = (checked) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            updateSettings({ devMode: checked });
        }
        catch (error) {
            console.error("failed to update dev mode:", error);
            toast({
                title: "error",
                description: "failed to save dev mode setting",
                variant: "destructive",
            });
        }
    });
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const { toast } = (0, use_toast_1.useToast)();
    const handleStartScreenpipe = () => __awaiter(void 0, void 0, void 0, function* () {
        setIsLoading(true);
        const toastId = toast({
            title: "starting screenpipe",
            description: "please wait...",
            duration: Infinity,
        });
        try {
            yield (0, core_1.invoke)("spawn_screenpipe");
            yield new Promise((resolve) => setTimeout(resolve, 2000));
            toastId.update({
                id: toastId.id,
                title: "screenpipe started",
                description: "screenpipe is now running.",
                duration: 3000,
            });
        }
        catch (error) {
            console.error("failed to start screenpipe:", error);
            toastId.update({
                id: toastId.id,
                title: "error",
                description: "failed to start screenpipe.",
                variant: "destructive",
                duration: 3000,
            });
        }
        finally {
            toastId.dismiss();
            setIsLoading(false);
        }
    });
    const handleStopScreenpipe = () => __awaiter(void 0, void 0, void 0, function* () {
        setIsLoading(true);
        const toastId = toast({
            title: "stopping screenpipe",
            description: "please wait...",
            duration: Infinity,
        });
        try {
            yield (0, core_1.invoke)("stop_screenpipe");
            yield new Promise((resolve) => setTimeout(resolve, 2000));
            toastId.update({
                id: toastId.id,
                title: "screenpipe stopped",
                description: "screenpipe is now stopped.",
                duration: 3000,
            });
        }
        catch (error) {
            console.error("failed to stop screenpipe:", error);
            toastId.update({
                id: toastId.id,
                title: "error",
                description: "failed to stop screenpipe.",
                variant: "destructive",
                duration: 3000,
            });
        }
        finally {
            toastId.dismiss();
            setIsLoading(false);
        }
    });
    return (<>
      <div className="w-full my-4 flex justify-center">
        <div className="flex-col justify-around space-y-4 w-[40vw]">
          <card_1.Card className="p-8 relative">
            <card_1.CardContent>
              <div className="flex flex-col ">
                <div className="flex items-center justify-center">
                  <div className="flex items-center justify-center ">
                    <tooltip_1.TooltipProvider>
                      <tooltip_1.Tooltip>
                        <tooltip_1.TooltipTrigger asChild>
                          <div className="flex items-center space-x-2">
                            <label_1.Label htmlFor="dev-mode">enable dev mode</label_1.Label>
                            <switch_1.Switch id="dev-mode" checked={settings.devMode} onCheckedChange={handleDevModeToggle}/>
                          </div>
                        </tooltip_1.TooltipTrigger>
                        <tooltip_1.TooltipContent>
                          <p>
                            on = use CLI for more control
                            <br />
                            in dev mode, backend won&apos;t
                            <br />
                            auto start when starting the app
                          </p>
                        </tooltip_1.TooltipContent>
                      </tooltip_1.Tooltip>
                    </tooltip_1.TooltipProvider>
                  </div>
                  <div className="absolute top-2 right-2">
                    <cli_command_dialog_1.CliCommandDialog settings={settings}/>
                  </div>
                </div>
              </div>
            </card_1.CardContent>
          </card_1.Card>

          <div className="relative">
            <card_1.Card className="p-8">
              <card_1.CardContent>
                <div className="flex items-center space-x-2">
                  <div className="flex flex-col items-center w-full">
                    <tooltip_1.TooltipProvider>
                      <tooltip_1.Tooltip>
                        <tooltip_1.TooltipTrigger asChild>
                          <button_1.Button variant="outline" onClick={handleStopScreenpipe} disabled={isLoading} className="text-xs w-full">
                            stop
                          </button_1.Button>
                        </tooltip_1.TooltipTrigger>
                        <tooltip_1.TooltipContent>
                          <p>stop screenpipe backend</p>
                        </tooltip_1.TooltipContent>
                      </tooltip_1.Tooltip>
                    </tooltip_1.TooltipProvider>
                  </div>
                  <div className="flex flex-col items-center w-full">
                    <tooltip_1.TooltipProvider>
                      <tooltip_1.Tooltip>
                        <tooltip_1.TooltipTrigger asChild>
                          <button_1.Button variant="outline" onClick={handleStartScreenpipe} disabled={isLoading} className="text-xs w-full">
                            start
                          </button_1.Button>
                        </tooltip_1.TooltipTrigger>
                        <tooltip_1.TooltipContent>
                          <p>start screenpipe recording</p>
                        </tooltip_1.TooltipContent>
                      </tooltip_1.Tooltip>
                    </tooltip_1.TooltipProvider>
                  </div>
                </div>
              </card_1.CardContent>
              <card_1.CardFooter className="flex flex-col items-center">
                <p className="text-sm text-muted-foreground">
                  manually start or stop screenpipe recording
                </p>
                <p className="text-xs text-muted-foreground">
                  (auto started when dev mode is off)
                </p>
              </card_1.CardFooter>
            </card_1.Card>
          </div>
        </div>
      </div>
    </>);
};
exports.DevModeSettings = DevModeSettings;
