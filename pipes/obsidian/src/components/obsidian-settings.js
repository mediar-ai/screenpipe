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
exports.ObsidianSettings = ObsidianSettings;
const react_1 = require("react");
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const label_1 = require("@/components/ui/label");
const lucide_react_1 = require("lucide-react");
const use_toast_1 = require("@/hooks/use-toast");
const ollama_models_list_1 = require("./ollama-models-list");
const tabs_1 = require("@/components/ui/tabs");
const card_1 = require("@/components/ui/card");
const badge_1 = require("@/components/ui/badge");
const path_1 = __importDefault(require("path"));
const file_suggest_textarea_1 = require("./file-suggest-textarea");
const skeleton_1 = require("@/components/ui/skeleton");
const lodash_1 = require("lodash");
const update_pipe_config_1 = require("@/lib/actions/update-pipe-config");
const use_pipe_settings_1 = require("@/lib/hooks/use-pipe-settings");
function ObsidianSettings() {
    var _a;
    const { settings, updateSettings, loading } = (0, use_pipe_settings_1.usePipeSettings)();
    const [lastLog, setLastLog] = (0, react_1.useState)(null);
    const { toast } = (0, use_toast_1.useToast)();
    const [intelligence, setIntelligence] = (0, react_1.useState)(null);
    const [intelligenceLoading, setIntelligenceLoading] = (0, react_1.useState)(false);
    const [logDeepLink, setLogDeepLink] = (0, react_1.useState)(null);
    const [intelligenceDeepLink, setIntelligenceDeepLink] = (0, react_1.useState)(null);
    const [customPrompt, setCustomPrompt] = (0, react_1.useState)(null);
    const [testLogLoading, setTestLogLoading] = (0, react_1.useState)(false);
    const [pathValidation, setPathValidation] = (0, react_1.useState)({
        isValid: false,
        message: "",
        validatedPath: null,
        isChecking: false,
    });
    const [suggestedPaths, setSuggestedPaths] = (0, react_1.useState)([]);
    (0, react_1.useEffect)(() => {
        if (settings) {
            setCustomPrompt(settings.prompt || "");
        }
    }, [settings]);
    (0, react_1.useEffect)(() => {
        const fetchPaths = () => __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield fetch("/api/obsidian-paths");
                const data = yield res.json();
                setSuggestedPaths(data.paths);
            }
            catch (err) {
                console.warn("failed to fetch obsidian paths:", err);
            }
        });
        fetchPaths();
    }, []);
    const handleSave = (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const formData = new FormData(e.target);
        const path = formData.get("path");
        if (!(path === null || path === void 0 ? void 0 : path.trim())) {
            toast({
                variant: "destructive",
                title: "error",
                description: "please set an obsidian vault path",
            });
            return;
        }
        const loadingToast = toast({
            title: "saving settings...",
            description: (<div>
          <p>please wait while we update your configuration</p>
          <p>this may take a few minutes</p>
          <lucide_react_1.Loader2 className="h-4 w-4 animate-spin"/>
        </div>),
        });
        try {
            const interval = parseInt(formData.get("interval")) * 60000;
            const obsidianSettings = {
                vaultPath: formData.get("path"),
                interval,
                pageSize: parseInt(formData.get("pageSize")),
                aiModel: formData.get("aiModel"),
                prompt: customPrompt || "",
            };
            yield updateSettings(obsidianSettings);
            yield (0, update_pipe_config_1.updatePipeConfig)(interval / 60000);
            loadingToast.update({
                id: loadingToast.id,
                title: "settings saved",
                description: "your obsidian settings have been updated",
            });
        }
        catch (err) {
            loadingToast.update({
                id: loadingToast.id,
                title: "error",
                description: "failed to save settings",
            });
        }
    });
    const testLog = () => __awaiter(this, void 0, void 0, function* () {
        setTestLogLoading(true);
        try {
            const formData = new FormData(document.querySelector("form"));
            const interval = parseInt(formData.get("interval")) * 60000;
            const obsidianSettings = {
                vaultPath: formData.get("path"),
                interval,
                pageSize: parseInt(formData.get("pageSize")),
                aiModel: formData.get("aiModel"),
                prompt: customPrompt || "",
            };
            yield updateSettings(obsidianSettings);
            yield (0, update_pipe_config_1.updatePipeConfig)(interval / 60000);
            // Then test log generation
            const res = yield fetch("/api/log");
            const data = yield res.json();
            setLastLog(data);
            setLogDeepLink(data.deepLink);
        }
        catch (err) {
            console.error("error testing log:", err);
            toast({
                variant: "destructive",
                title: "error",
                description: "failed to test log generation",
            });
        }
        finally {
            setTestLogLoading(false);
        }
    });
    const openPath = () => __awaiter(this, void 0, void 0, function* () {
        try {
            // Check if File System Access API is supported
            if (!("showDirectoryPicker" in window)) {
                toast({
                    variant: "destructive",
                    title: "error",
                    description: "your browser doesn't support directory selection. please enter the path manually or try a different browser.",
                });
                return;
            }
            // Open directory picker dialog
            const dirHandle = yield window.showDirectoryPicker();
            const path = dirHandle.name;
            // Update the input value and settings
            const input = document.getElementById("path");
            if (input) {
                input.value = path;
            }
            yield updateSettings({
                vaultPath: path,
            });
            toast({
                title: "path updated",
                description: "obsidian vault path has been set",
            });
        }
        catch (err) {
            console.warn("failed to open directory picker:", err);
            toast({
                variant: "destructive",
                title: "error",
                description: "failed to select directory",
            });
        }
    });
    const testIntelligence = () => __awaiter(this, void 0, void 0, function* () {
        setIntelligenceLoading(true);
        try {
            const res = yield fetch("/api/intelligence");
            const data = yield res.json();
            console.log("data", data);
            setIntelligence(data.intelligence);
            setIntelligenceDeepLink(data.deepLink);
            if (!data.summary.logsAnalyzed) {
                toast({
                    variant: "destructive",
                    title: "error",
                    description: "no logs found for analysis",
                });
                return;
            }
            toast({
                title: "intelligence generated",
                description: `analyzed ${data.summary.logsAnalyzed} logs, found ${data.summary.contacts} contacts`,
            });
        }
        catch (err) {
            console.warn("error testing intelligence:", err);
            toast({
                variant: "destructive",
                title: "error",
                description: "failed to generate intelligence",
            });
        }
        finally {
            setIntelligenceLoading(false);
        }
    });
    const openObsidianVault = () => __awaiter(this, void 0, void 0, function* () {
        if (!(settings === null || settings === void 0 ? void 0 : settings.vaultPath))
            return;
        try {
            // Start from the current path and walk up until we find .obsidian folder
            let currentPath = settings.vaultPath;
            let vaultPath = null;
            while (currentPath !== "/") {
                const parentDir = path_1.default.dirname(currentPath);
                const hasObsidianFolder = yield fetch("/api/check-folder", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: path_1.default.join(parentDir, ".obsidian") }),
                })
                    .then((r) => r.json())
                    .then((r) => r.exists);
                if (hasObsidianFolder) {
                    vaultPath = parentDir;
                    break;
                }
                currentPath = parentDir;
            }
            if (!vaultPath) {
                toast({
                    variant: "destructive",
                    title: "error",
                    description: "couldn't find obsidian vault root (.obsidian folder)",
                });
                return;
            }
            const vaultName = path_1.default.basename(vaultPath);
            // Get relative path from vault root to AI folder
            const relativePath = settings.vaultPath
                .replace(vaultPath, "")
                .replace(/^\//, "");
            const searchQuery = `path:"${relativePath}"`;
            const deepLink = `obsidian://search?vault=${encodeURIComponent(vaultName)}&query=${encodeURIComponent(searchQuery)}`;
            window.open(deepLink, "_blank");
        }
        catch (err) {
            console.error("failed to open vault:", err);
            toast({
                variant: "destructive",
                title: "error",
                description: "failed to open vault in obsidian",
            });
        }
    });
    const validatePath = (0, react_1.useCallback)((0, lodash_1.debounce)((inputPath) => __awaiter(this, void 0, void 0, function* () {
        if (!(inputPath === null || inputPath === void 0 ? void 0 : inputPath.trim())) {
            setPathValidation({
                isValid: false,
                message: "please enter a path",
                validatedPath: null,
                isChecking: false,
            });
            return;
        }
        setPathValidation((prev) => (Object.assign(Object.assign({}, prev), { isChecking: true })));
        try {
            // Remove quotes and normalize path separators to forward slashes
            let currentPath = inputPath.replace(/['"]/g, "").replace(/\\/g, "/");
            let foundPath = null;
            // Handle Windows root paths (e.g., C:/)
            const isWindowsPath = /^[a-zA-Z]:\//i.test(currentPath);
            const rootPath = isWindowsPath ? currentPath.slice(0, 3) : "/";
            // First check the input path itself
            const hasObsidianFolder = yield fetch("/api/check-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: `${currentPath}/.obsidian` }),
            })
                .then((r) => r.json())
                .then((r) => r.exists);
            if (hasObsidianFolder) {
                foundPath = currentPath;
            }
            else {
                // If not found, walk up the directory tree
                while (currentPath !== rootPath) {
                    const parentDir = currentPath.split("/").slice(0, -1).join("/") || rootPath;
                    const obsidianPath = `${parentDir}/.obsidian`;
                    const hasParentObsidianFolder = yield fetch("/api/check-folder", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: obsidianPath }),
                    })
                        .then((r) => r.json())
                        .then((r) => r.exists);
                    if (hasParentObsidianFolder) {
                        foundPath = parentDir;
                        break;
                    }
                    currentPath = parentDir;
                }
            }
            if (foundPath) {
                setPathValidation({
                    isValid: true,
                    message: `found obsidian vault at "${foundPath}"`,
                    // Store the cleaned path without quotes
                    validatedPath: currentPath,
                    isChecking: false,
                });
            }
            else {
                setPathValidation({
                    isValid: false,
                    message: "no obsidian vault found in path or parent directories",
                    validatedPath: null,
                    isChecking: false,
                });
            }
        }
        catch (err) {
            setPathValidation({
                isValid: false,
                message: "error validating path",
                validatedPath: null,
                isChecking: false,
            });
        }
    }), 500), []);
    // Add this new useEffect for initial path validation
    (0, react_1.useEffect)(() => {
        if (settings === null || settings === void 0 ? void 0 : settings.vaultPath) {
            validatePath(settings.vaultPath);
        }
    }, [settings === null || settings === void 0 ? void 0 : settings.vaultPath, validatePath]);
    if (loading) {
        return (<div className="w-full max-w-4xl mx-auto space-y-8">
        <tabs_1.Tabs defaultValue="logs">
          <tabs_1.TabsList className="grid w-full grid-cols-2">
            <tabs_1.TabsTrigger value="logs">logs</tabs_1.TabsTrigger>
            <tabs_1.TabsTrigger value="intelligence">intelligence (beta)</tabs_1.TabsTrigger>
          </tabs_1.TabsList>

          <tabs_1.TabsContent value="logs" className="space-y-4 w-full my-2">
            <div className="space-y-2">
              <skeleton_1.Skeleton className="h-4 w-24"/>
              <div className="flex gap-2">
                <skeleton_1.Skeleton className="h-10 flex-1"/>
                <skeleton_1.Skeleton className="h-10 w-10"/>
                <skeleton_1.Skeleton className="h-10 w-10"/>
              </div>
            </div>

            <div className="space-y-2">
              <skeleton_1.Skeleton className="h-4 w-32"/>
              <skeleton_1.Skeleton className="h-10 w-full"/>
            </div>

            <div className="space-y-2">
              <skeleton_1.Skeleton className="h-4 w-20"/>
              <skeleton_1.Skeleton className="h-10 w-full"/>
            </div>

            <div className="space-y-2">
              <skeleton_1.Skeleton className="h-4 w-36"/>
              <skeleton_1.Skeleton className="h-10 w-full"/>
            </div>

            <div className="space-y-2">
              <skeleton_1.Skeleton className="h-4 w-24"/>
              <skeleton_1.Skeleton className="h-32 w-full"/>
            </div>

            <skeleton_1.Skeleton className="h-10 w-full"/>
          </tabs_1.TabsContent>
        </tabs_1.Tabs>
      </div>);
    }
    return (<div className="w-full max-w-4xl mx-auto space-y-8">
      <tabs_1.Tabs defaultValue="logs">
        <tabs_1.TabsList className="grid w-full grid-cols-2">
          <tabs_1.TabsTrigger value="logs">logs</tabs_1.TabsTrigger>
          <tabs_1.TabsTrigger value="intelligence">intelligence (beta)</tabs_1.TabsTrigger>
        </tabs_1.TabsList>

        <tabs_1.TabsContent value="logs">
          <form onSubmit={handleSave} className="space-y-4 w-full my-2">
            <div className="space-y-2">
              <label_1.Label htmlFor="path">obsidian vault path</label_1.Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input_1.Input id="path" name="path" defaultValue={settings === null || settings === void 0 ? void 0 : settings.vaultPath} placeholder="/path/to/vault" className={`${pathValidation.isValid
            ? "border-green-500"
            : pathValidation.message
                ? "border-red-500"
                : ""}`} onChange={(e) => validatePath(e.target.value)}/>
                  {pathValidation.isChecking && (<lucide_react_1.Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground"/>)}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedPaths.map((path) => (<badge_1.Badge key={path} variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => {
                const input = document.getElementById("path");
                if (input) {
                    input.value = path;
                    validatePath(path);
                }
            }} title={path}>
                        {path.split(/(\/|\\)/).pop()}
                      </badge_1.Badge>))}
                  </div>
                </div>
                <button_1.Button type="button" variant="outline" onClick={openPath} className="px-3" title="open in file explorer">
                  <lucide_react_1.FolderOpen className="h-4 w-4"/>
                </button_1.Button>
                <button_1.Button type="button" variant="outline" onClick={openObsidianVault} className="px-3" title="open in obsidian" disabled={!pathValidation.isValid}>
                  <lucide_react_1.ExternalLink className="h-4 w-4"/>
                </button_1.Button>
              </div>
              {pathValidation.message && (<p className={`text-sm ${pathValidation.isValid ? "text-green-500" : "text-red-500"}`}>
                  {pathValidation.message}
                </p>)}
            </div>

            <div className="space-y-2">
              <label_1.Label htmlFor="interval">sync interval (minutes)</label_1.Label>
              <input_1.Input disabled={!pathValidation.isValid} id="interval" name="interval" type="number" min="1" step="1" max="60" defaultValue={(settings === null || settings === void 0 ? void 0 : settings.interval) ? (settings === null || settings === void 0 ? void 0 : settings.interval) / 60000 : 5}/>
            </div>

            <div className="space-y-2">
              <label_1.Label htmlFor="pageSize">page size</label_1.Label>
              <input_1.Input disabled={!pathValidation.isValid} id="pageSize" name="pageSize" type="number" defaultValue={(settings === null || settings === void 0 ? void 0 : settings.pageSize) || 100}/>
            </div>

            <div className="space-y-2">
              <label_1.Label htmlFor="aiModel">
                ollama/local openai-compatible model
              </label_1.Label>
              <ollama_models_list_1.OllamaModelsList disabled={!pathValidation.isValid} defaultValue={(settings === null || settings === void 0 ? void 0 : settings.aiModel) || "llama3.2:3b-instruct-q4_K_M"} onChange={(value) => {
            updateSettings({
                aiModel: value,
            });
        }}/>
            </div>

            <div className="space-y-2">
              <label_1.Label htmlFor="prompt">custom prompt</label_1.Label>
              <file_suggest_textarea_1.FileSuggestTextarea value={customPrompt || ""} setValue={setCustomPrompt} disabled={!pathValidation.isValid}/>
              <p className="text-xs text-muted-foreground">
                make sure to keep the prompt within llm context window size.
                <br />
                protip: use the @mention feature to link to files in your vault
                as context.
              </p>
            </div>

            <button_1.Button className="w-full" type="submit" disabled={!pathValidation.isValid}>
              <lucide_react_1.FileCheck className="mr-2 h-4 w-4"/>
              save settings
            </button_1.Button>
          </form>

          <div className="space-y-4 w-full flex flex-col">
            <button_1.Button onClick={testLog} variant="outline" disabled={testLogLoading || !pathValidation.isValid} className="w-full">
              {testLogLoading ? (<>
                  <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  testing...
                </>) : ("test log generation")}
            </button_1.Button>

            {lastLog && (<div className="p-4 border rounded-lg space-y-2 font-mono text-sm">
                <h4>last generated log:</h4>
                <pre className="bg-muted p-2 rounded overflow-auto">
                  {JSON.stringify(lastLog, null, 2)}
                </pre>
              </div>)}

            {lastLog && logDeepLink && (<button_1.Button variant="outline" size="sm" onClick={() => window.open(logDeepLink, "_blank")} className="ml-2 my-2">
                <lucide_react_1.ExternalLink className="h-4 w-4 mr-2"/>
                open in obsidian
              </button_1.Button>)}
          </div>
        </tabs_1.TabsContent>

        <tabs_1.TabsContent value="intelligence" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">relationship intelligence</h3>
            <button_1.Button onClick={testIntelligence} variant="outline" disabled={intelligenceLoading || !pathValidation.isValid}>
              <lucide_react_1.Brain className="mr-2 h-4 w-4"/>
              {intelligenceLoading ? "analyzing..." : "analyze relationships"}
            </button_1.Button>
          </div>

          {intelligence && (<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* contacts summary */}
              <card_1.Card>
                <card_1.CardHeader>
                  <card_1.CardTitle className="flex items-center gap-2">
                    <lucide_react_1.Users className="h-4 w-4"/>
                    contacts
                  </card_1.CardTitle>
                </card_1.CardHeader>
                <card_1.CardContent>
                  <div className="space-y-4">
                    {((_a = intelligence === null || intelligence === void 0 ? void 0 : intelligence.contacts) === null || _a === void 0 ? void 0 : _a.length) > 0 ? (intelligence.contacts.map((contact) => (<div key={contact.name} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{contact.name}</span>
                            <badge_1.Badge variant={contact.sentiment > 0 ? "default" : "secondary"}>
                              {contact.company || "unknown"}
                            </badge_1.Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            last: {contact.lastInteraction}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {contact.topics.map((topic) => (<badge_1.Badge key={topic} variant="outline">
                                {topic}
                              </badge_1.Badge>))}
                          </div>
                          {contact.nextSteps.length > 0 && (<div className="text-sm text-muted-foreground">
                              next steps: {contact.nextSteps.join(", ")}
                            </div>)}
                        </div>))) : (<div className="text-muted-foreground">
                        no contacts found
                      </div>)}
                  </div>
                </card_1.CardContent>
              </card_1.Card>

              {/* insights */}
              <card_1.Card>
                <card_1.CardHeader>
                  <card_1.CardTitle className="flex items-center gap-2">
                    <lucide_react_1.LineChart className="h-4 w-4"/>
                    insights
                  </card_1.CardTitle>
                </card_1.CardHeader>
                <card_1.CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">follow-ups needed</h4>
                      {intelligence.insights.followUps.map((item) => (<div key={item} className="text-sm text-muted-foreground">
                          • {item}
                        </div>))}
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">opportunities</h4>
                      {intelligence.insights.opportunities.map((item) => (<div key={item} className="text-sm text-muted-foreground">
                            • {item}
                          </div>))}
                    </div>
                  </div>
                </card_1.CardContent>
              </card_1.Card>
            </div>)}

          {/* debug view */}
          <card_1.Card>
            <card_1.CardHeader>
              <card_1.CardTitle className="flex items-center gap-2">
                <lucide_react_1.Clock className="h-4 w-4"/>
                raw data
              </card_1.CardTitle>
            </card_1.CardHeader>
            <card_1.CardContent>
              <pre className="text-xs overflow-auto max-h-96">
                {JSON.stringify(intelligence, null, 2)}
              </pre>
            </card_1.CardContent>
          </card_1.Card>

          {intelligence && intelligenceDeepLink && (<button_1.Button variant="outline" size="sm" onClick={() => window.open(intelligenceDeepLink, "_blank")} className="ml-2">
              <lucide_react_1.ExternalLink className="h-4 w-4 mr-2"/>
              open in obsidian
            </button_1.Button>)}
          <div className="my-4 h-16"/>
        </tabs_1.TabsContent>
      </tabs_1.Tabs>
    </div>);
}
