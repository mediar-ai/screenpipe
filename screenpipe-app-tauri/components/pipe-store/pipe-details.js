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
exports.PipeDetails = void 0;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const pipe_store_markdown_1 = require("@/components/pipe-store-markdown");
const tooltip_1 = require("../ui/tooltip");
const log_file_button_1 = require("../log-file-button");
const use_toast_1 = require("../ui/use-toast");
const core_1 = require("@tauri-apps/api/core");
const pipe_config_form_1 = require("../pipe-config-form");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const badge_1 = require("../ui/badge");
const isValidSource = (source) => {
    if (!source)
        return false;
    // github url pattern
    const githubPattern = /^https?:\/\/(?:www\.)?github\.com\/.+\/.+/i;
    // filesystem path patterns (unix and windows)
    const unixPattern = /^(?:\/|~\/)/;
    const windowsPattern = /^[a-zA-Z]:\\|^\\\\/;
    return (githubPattern.test(source) ||
        unixPattern.test(source) ||
        windowsPattern.test(source));
};
const PipeDetails = ({ pipe, onClose, onToggle, onConfigSave, onUpdate, onDelete, onRefreshFromDisk, }) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    return (<div className="fixed inset-0 bg-background transform transition-transform duration-200 ease-in-out flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button_1.Button variant="ghost" size="sm" onClick={onClose} className="hover:bg-muted">
            <lucide_react_1.X className="h-4 w-4"/>
          </button_1.Button>
          <h2 className="text-lg font-medium">{pipe.name}</h2>
          <badge_1.Badge variant={"outline"} className="font-mono text-xs">
            by {pipe.developer_accounts.developer_name}
          </badge_1.Badge>
          {pipe.has_update && (<badge_1.Badge variant="default" className="bg-gray-800 text-xs animate-pulse">
              update available
            </badge_1.Badge>)}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {pipe.is_installed && (<div className="w-[320px] border-r bg-muted/10 flex-shrink-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <tooltip_1.TooltipProvider>
                      <tooltip_1.Tooltip>
                        <tooltip_1.TooltipTrigger asChild>
                          <button_1.Button onClick={() => {
                setIsLoading(true);
                onToggle(pipe, () => setIsLoading(false));
            }} variant={((_a = pipe.installed_config) === null || _a === void 0 ? void 0 : _a.enabled)
                ? "default"
                : "outline"} size="icon" className="h-8 w-8">
                            <lucide_react_1.Power className="h-4 w-4"/>
                          </button_1.Button>
                        </tooltip_1.TooltipTrigger>
                        <tooltip_1.TooltipContent>
                          <p>
                            {((_b = pipe.installed_config) === null || _b === void 0 ? void 0 : _b.enabled)
                ? "disable"
                : "enable"}{" "}
                            pipe
                          </p>
                        </tooltip_1.TooltipContent>
                      </tooltip_1.Tooltip>
                    </tooltip_1.TooltipProvider>

                    <log_file_button_1.LogFileButton className="text-xs"/>

                    {((_c = pipe.installed_config) === null || _c === void 0 ? void 0 : _c.source) &&
                isValidSource(pipe.installed_config.source) ? (<tooltip_1.TooltipProvider>
                        <tooltip_1.Tooltip>
                          <tooltip_1.TooltipTrigger asChild>
                            <button_1.Button onClick={() => onRefreshFromDisk(pipe, () => setIsLoading(false))} variant="outline" size="icon" className="h-8 w-8">
                              <lucide_react_1.RefreshCw className="h-4 w-4"/>
                            </button_1.Button>
                          </tooltip_1.TooltipTrigger>
                          <tooltip_1.TooltipContent>
                            <p>refresh the code from your local disk</p>
                          </tooltip_1.TooltipContent>
                        </tooltip_1.Tooltip>
                      </tooltip_1.TooltipProvider>) : (<tooltip_1.TooltipProvider>
                        <tooltip_1.Tooltip>
                          <tooltip_1.TooltipTrigger asChild>
                            <button_1.Button onClick={() => {
                    onUpdate(pipe, () => setIsLoading(false));
                }} variant="outline" size="icon" className="h-8 w-8">
                              <lucide_react_1.RefreshCw className="h-4 w-4"/>
                            </button_1.Button>
                          </tooltip_1.TooltipTrigger>
                          <tooltip_1.TooltipContent>
                            {pipe.has_update ? (<p>update available! click to update pipe</p>) : (<p>check for updates</p>)}
                          </tooltip_1.TooltipContent>
                        </tooltip_1.Tooltip>
                      </tooltip_1.TooltipProvider>)}

                    <div className="flex items-center gap-2">
                      {/* Only show delete button for non-core pipes */}
                      {!pipe.is_core_pipe && (<tooltip_1.TooltipProvider>
                          <tooltip_1.Tooltip>
                            <tooltip_1.TooltipTrigger asChild>
                              <button_1.Button onClick={() => {
                    onDelete(pipe, () => setIsLoading(false));
                }} variant="outline" size="icon" className="h-8 w-8">
                                <lucide_react_1.Trash2 className="h-4 w-4"/>
                              </button_1.Button>
                            </tooltip_1.TooltipTrigger>
                            <tooltip_1.TooltipContent>
                              <p>delete pipe</p>
                            </tooltip_1.TooltipContent>
                          </tooltip_1.Tooltip>
                        </tooltip_1.TooltipProvider>)}
                    </div>
                  </div>
                </div>
              </div>

              {((_d = pipe.installed_config) === null || _d === void 0 ? void 0 : _d.enabled) && (<div className="space-y-3 pt-4 border-t">
                  <pipe_config_form_1.PipeConfigForm pipe={pipe} onConfigSave={(config) => {
                    onConfigSave(config, () => setIsLoading(false));
                }}/>
                </div>)}
            </div>
          </div>)}

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-8 ">
            {((_e = pipe.installed_config) === null || _e === void 0 ? void 0 : _e.enabled) && ((_f = pipe.installed_config) === null || _f === void 0 ? void 0 : _f.port) && (<div>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex gap-2">
                    <button_1.Button variant="outline" onClick={() => {
                var _a;
                return (0, plugin_shell_1.open)(`http://localhost:${(_a = pipe.installed_config) === null || _a === void 0 ? void 0 : _a.port}`);
            }} disabled={!((_g = pipe.installed_config) === null || _g === void 0 ? void 0 : _g.enabled)}>
                      <lucide_react_1.ExternalLink className="mr-2 h-3.5 w-3.5"/>
                      open in browser
                    </button_1.Button>
                    <button_1.Button variant="default" onClick={() => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    yield (0, core_1.invoke)("open_pipe_window", {
                        port: pipe.installed_config.port,
                        title: pipe.name,
                    });
                }
                catch (err) {
                    console.error("failed to open pipe window:", err);
                    (0, use_toast_1.toast)({
                        title: "error opening pipe window",
                        description: "please try again or check the logs",
                        variant: "destructive",
                    });
                }
            })} disabled={!pipe.installed_config.enabled}>
                      <lucide_react_1.Puzzle className="mr-2 h-3.5 w-3.5"/>
                      open as app
                    </button_1.Button>
                  </div>
                </div>
              </div>)}

            {pipe.description && (<div>
                <h3 className="text-lg font-medium mb-4">about this pipe</h3>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pipe_store_markdown_1.PipeStoreMarkdown content={pipe.description}/>
                </div>
              </div>)}
          </div>
        </main>
      </div>
    </div>);
};
exports.PipeDetails = PipeDetails;
