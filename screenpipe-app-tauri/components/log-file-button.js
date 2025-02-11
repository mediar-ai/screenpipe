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
exports.LogFileButton = void 0;
const use_toast_1 = require("./ui/use-toast");
const tooltip_1 = require("./ui/tooltip");
const button_1 = require("./ui/button");
const lucide_react_1 = require("lucide-react");
const plugin_fs_1 = require("@tauri-apps/plugin-fs");
const use_copy_to_clipboard_1 = require("@/lib/hooks/use-copy-to-clipboard");
const utils_1 = require("@/lib/utils");
const use_settings_1 = require("@/lib/hooks/use-settings");
const dialog_1 = require("./ui/dialog");
const react_1 = require("react");
const scroll_area_1 = require("./ui/scroll-area");
const core_1 = require("@tauri-apps/api/core");
const react_2 = __importDefault(require("react"));
const react_log_viewer_1 = require("@patternfly/react-log-viewer");
const react_core_1 = require("@patternfly/react-core");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const share_logs_button_1 = require("./share-logs-button");
const popover_1 = require("./ui/popover");
const LogContent = ({ content, filePath, }) => {
    const handleOpenInDefaultApp = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield (0, plugin_shell_1.open)(filePath);
        }
        catch (error) {
            console.error("failed to open log file:", error);
            (0, use_toast_1.toast)({
                title: "error",
                description: "failed to open log file",
                variant: "destructive",
            });
        }
    });
    return (<div className="relative">
      <react_log_viewer_1.LogViewer theme="dark" isTextWrapped={false} hasLineNumbers={true} data={content} height="58vh" toolbar={<react_core_1.Toolbar>
            <react_core_1.ToolbarContent className="p-2 relative w-full">
              <react_core_1.ToolbarItem>
                <react_log_viewer_1.LogViewerSearch placeholder="Search value" minSearchChars={3}/>
              </react_core_1.ToolbarItem>
              <react_core_1.ToolbarItem className="p-2 absolute right-0 top-0">
                <button_1.Button variant="outline" size="sm" onClick={handleOpenInDefaultApp}>
                  open in default app
                </button_1.Button>
              </react_core_1.ToolbarItem>
            </react_core_1.ToolbarContent>
          </react_core_1.Toolbar>}/>
    </div>);
};
LogContent.displayName = "LogContent";
const LogFileButton = ({ className, isAppLog = false, size = "8", }) => {
    const { toast } = (0, use_toast_1.useToast)();
    const { copyToClipboard } = (0, use_copy_to_clipboard_1.useCopyToClipboard)({ timeout: 3000 });
    const { settings } = (0, use_settings_1.useSettings)();
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const [logPath, setLogPath] = (0, react_1.useState)("");
    const [logContent, setLogContent] = (0, react_1.useState)("");
    const [logFiles, setLogFiles] = (0, react_1.useState)([]);
    const getLogFiles = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const logFiles = yield (0, core_1.invoke)("get_log_files");
            return logFiles;
        }
        catch (error) {
            console.error("failed to get log files:", error);
            return [];
        }
    });
    const loadLogContent = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            console.log("loadLogContent", filePath);
            const content = yield (0, plugin_fs_1.readTextFile)(filePath);
            setLogPath(filePath);
            setLogContent(content);
        }
        catch (error) {
            console.error("failed to read log file:", error);
            toast({
                title: "error",
                description: "failed to read log file",
                variant: "destructive",
            });
        }
    });
    const handleShowLog = () => __awaiter(void 0, void 0, void 0, function* () {
        const files = yield getLogFiles();
        setLogFiles(files);
        // Find most recent non-app log or fall back to first file
        const appLog = files
            .filter((f) => !f.name.toLowerCase().includes("app"))
            .sort((a, b) => b.modified_at - a.modified_at)[0];
        if (files.length > 0) {
            yield loadLogContent((appLog === null || appLog === void 0 ? void 0 : appLog.path) || files[0].path);
        }
        setIsOpen(true);
    });
    return (<>
      <tooltip_1.TooltipProvider>
        <tooltip_1.Tooltip>
          <tooltip_1.TooltipTrigger asChild>
            <button_1.Button variant="outline" size="icon" className={(0, utils_1.cn)("h-8 w-8", size === "8" && "h-8 w-8", size === "10" && "h-10 w-10", size === "12" && "h-12 w-12")} onClick={handleShowLog}>
              <lucide_react_1.FileText className={(0, utils_1.cn)("h-4 w-4", size === "8" && "h-4 w-4", size === "10" && "h-6 w-6", size === "12" && "h-8 w-8")}/>
            </button_1.Button>
          </tooltip_1.TooltipTrigger>
          <tooltip_1.TooltipContent>
            <p>view {isAppLog ? "app " : ""}log files</p>
          </tooltip_1.TooltipContent>
        </tooltip_1.Tooltip>
      </tooltip_1.TooltipProvider>

      <dialog_1.Dialog open={isOpen} onOpenChange={setIsOpen}>
        <dialog_1.DialogContent className="sm:max-w-[90vw] h-[80vh] overflow-hidden flex flex-col">
          <dialog_1.DialogHeader>
            <div className="flex flex-row justify-between items-start w-full">
              <div>
                <dialog_1.DialogTitle>log files</dialog_1.DialogTitle>
                <dialog_1.DialogDescription>
                  <span>select a log file from the list</span>
                </dialog_1.DialogDescription>
              </div>
              <div className="flex mr-8">
                <popover_1.Popover>
                  <popover_1.PopoverTrigger asChild>
                    <button_1.Button>
                      <lucide_react_1.Upload className="h-3.5 w-3.5 mr-2"/>
                      send logs
                    </button_1.Button>
                  </popover_1.PopoverTrigger>
                  <popover_1.PopoverContent className="w-100 rounded-2xl">
                    <share_logs_button_1.ShareLogsButton />
                  </popover_1.PopoverContent>
                </popover_1.Popover>
              </div>
            </div>
          </dialog_1.DialogHeader>

          {logFiles.length === 0 ? (<div className="flex-1 flex flex-col items-center justify-center">
              <lucide_react_1.FileText className="h-12 w-12 mb-4 text-muted-foreground opacity-50"/>
              <p className="text-sm text-muted-foreground">
                no log files found yet, come back later
              </p>
            </div>) : (<div className="grid grid-cols-[250px,1fr] gap-4 h-[calc(100%-80px)]">
              {/* Sidebar with log files list */}
              <div className="border rounded-md overflow-hidden">
                <scroll_area_1.ScrollArea className="h-full">
                  <div className="p-2 space-y-1">
                    {logFiles.map((file, i) => (<button_1.Button key={i} variant={logPath === file.modified_at.toString()
                    ? "secondary"
                    : "ghost"} className="w-full justify-start text-xs" onClick={() => loadLogContent(file.path)}>
                        {file.name.includes("app") ? (<lucide_react_1.AppWindow className="h-3 w-3 mr-2"/>) : (<lucide_react_1.FileText className="h-3 w-3 mr-2"/>)}
                        <span className="truncate">{file.name}</span>
                      </button_1.Button>))}
                  </div>
                </scroll_area_1.ScrollArea>
              </div>

              {/* Content area */}
              <div className="flex flex-col space-y-2 h-full">
                {logPath && (<>
                    <div className="relative flex-1 border rounded-md">
                      <LogContent content={logContent} filePath={logPath}/>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 bg-secondary/50 rounded-md">
                      <code className="text-sm font-mono truncate max-w-[70%]" title={logPath}>
                        {logPath}
                      </code>
                      <button_1.Button variant="ghost" size="sm" onClick={() => copyToClipboard(logContent)} className="text-muted-foreground hover:text-primary">
                        <lucide_react_1.Copy className="h-3 w-3"/>
                      </button_1.Button>
                    </div>
                  </>)}
              </div>
            </div>)}
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </>);
};
exports.LogFileButton = LogFileButton;
