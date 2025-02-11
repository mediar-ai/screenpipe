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
exports.DataImportSection = DataImportSection;
const react_1 = __importStar(require("react"));
const lucide_react_1 = require("lucide-react");
const button_1 = require("../ui/button");
const input_1 = require("../ui/input");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const use_toast_1 = require("../ui/use-toast");
const plugin_dialog_1 = require("@tauri-apps/plugin-dialog");
const lucide_react_2 = require("lucide-react");
const card_1 = require("../ui/card");
const label_1 = require("../ui/label");
const accordion_1 = require("../ui/accordion");
const plugin_fs_1 = require("@tauri-apps/plugin-fs");
const path_1 = require("@tauri-apps/api/path");
const path_2 = require("@tauri-apps/api/path");
const tooltip_1 = require("../ui/tooltip");
const lucide_react_3 = require("lucide-react");
function DataImportSection() {
    const [path, setPath] = (0, react_1.useState)("");
    const [isIndexing, setIsIndexing] = (0, react_1.useState)(false);
    const [detectedVideos, setDetectedVideos] = (0, react_1.useState)([]);
    const [metadataConfig, setMetadataConfig] = (0, react_1.useState)([]);
    const [isScanning, setIsScanning] = (0, react_1.useState)(false);
    const [progress, setProgress] = (0, react_1.useState)(null);
    const [useEmbeddings, setUseEmbeddings] = (0, react_1.useState)(true);
    const [ollamaAvailable, setOllamaAvailable] = (0, react_1.useState)(null);
    // Scan for videos in the selected path
    const scanForVideos = () => __awaiter(this, void 0, void 0, function* () {
        if (!path.trim())
            return;
        try {
            console.log("starting video scan for path:", path);
            setIsScanning(true);
            // recursively read directory
            const entries = yield (0, plugin_fs_1.readDir)(path);
            console.log("found directory entries:", entries);
            if (entries.length > 10) {
                (0, use_toast_1.toast)({
                    title: "too many files",
                    description: "please select a directory with 10 or fewer files",
                    variant: "destructive",
                });
                return;
            }
            const videos = yield Promise.all(entries.map((e) => (0, path_1.join)(path, e.name)));
            console.log("filtered video files:", videos);
            setDetectedVideos(videos);
            // initialize metadata config for each video
            const newMetadataConfig = videos.map((file_path) => ({
                file_path,
                metadata: {
                    name: "",
                    creation_time: new Date().toISOString(),
                    fps: 30,
                    device_name: "",
                },
            }));
            console.log("initialized metadata config:", newMetadataConfig);
            setMetadataConfig(newMetadataConfig);
            if (videos.length === 0) {
                (0, use_toast_1.toast)({
                    title: "no videos found",
                    description: "no supported video files found in the selected directory",
                    variant: "destructive",
                });
            }
            else {
                (0, use_toast_1.toast)({
                    title: "videos detected",
                    description: `found ${videos.length} video files`,
                });
            }
        }
        catch (error) {
            console.error("scan error:", error);
            (0, use_toast_1.toast)({
                title: "scanning failed",
                description: error.toString(),
                variant: "destructive",
            });
        }
        finally {
            setIsScanning(false);
        }
    });
    const handleMetadataChange = (index, field, value) => {
        console.log("metadata change:", { index, field, value });
        setMetadataConfig((prev) => {
            const updated = [...prev];
            updated[index] = Object.assign(Object.assign({}, updated[index]), { metadata: Object.assign(Object.assign({}, updated[index].metadata), { [field]: value }) });
            console.log("updated metadata config:", updated[index]);
            return updated;
        });
    };
    (0, react_1.useEffect)(() => {
        if (path.trim()) {
            scanForVideos();
        }
    }, [path]);
    const handleIndex = () => __awaiter(this, void 0, void 0, function* () {
        if (!path.trim())
            return;
        try {
            console.log("starting indexing process for path:", path);
            setIsIndexing(true);
            setProgress(null);
            const configFileName = `metadata-override-${Date.now()}.json`;
            const configData = { overrides: metadataConfig };
            console.log("writing metadata config:", configData);
            console.log("writing metadata config with paths:", metadataConfig.map((m) => m.file_path));
            yield (0, plugin_fs_1.writeTextFile)(configFileName, JSON.stringify(configData), {
                baseDir: plugin_fs_1.BaseDirectory.AppLocalData,
            });
            const configPath = yield (0, path_1.join)(yield (0, path_2.appLocalDataDir)(), configFileName);
            console.log("config file path:", configPath);
            const command = plugin_shell_1.Command.sidecar("screenpipe", [
                "add",
                path.trim(),
                "--metadata-override",
                configPath,
                "--output",
                "json",
                ...(ollamaAvailable && useEmbeddings ? ["--use-embedding"] : []),
            ]);
            console.log("executing command:", command);
            command.stdout.on("data", (line) => {
                console.log("command output:", line);
                if (line.includes("found")) {
                    const match = line.match(/found (\d+) video files/);
                    if (match) {
                        setProgress({ current: 0, total: parseInt(match[1]) });
                    }
                }
                if (line.includes("processing video:")) {
                    setProgress((prev) => prev ? Object.assign(Object.assign({}, prev), { current: prev.current + 1 }) : null);
                }
            });
            const output = yield command.execute();
            console.log("command execution result:", output);
            if (output.code === 0) {
                (0, use_toast_1.toast)({
                    title: "data imported",
                    description: "your data has been successfully imported",
                });
            }
            else {
                throw new Error(output.stderr);
            }
        }
        catch (error) {
            console.error("import error:", error);
            (0, use_toast_1.toast)({
                title: "import failed",
                description: error.toString(),
                variant: "destructive",
            });
        }
        finally {
            setIsIndexing(false);
            setProgress(null);
        }
    });
    const handleSelectFolder = () => __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("opening folder selector");
            const selected = yield (0, plugin_dialog_1.open)({
                directory: true,
                multiple: false,
            });
            console.log("selected folder:", selected);
            if (selected && typeof selected === "string") {
                setPath(selected);
            }
        }
        catch (error) {
            console.error("folder selection error:", error);
            (0, use_toast_1.toast)({
                title: "folder selection failed",
                description: error.toString(),
                variant: "destructive",
            });
        }
    });
    // Check Ollama availability
    const checkOllama = () => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const response = yield fetch("http://localhost:11434/api/version");
            setOllamaAvailable(response.ok);
            console.log("ollama available:", response.ok);
            if (response.ok) {
                // Check if model is available
                const modelResponse = yield fetch("http://localhost:11434/api/tags");
                const models = yield modelResponse.json();
                console.log("ollama model available:", models);
                const hasModel = (_a = models.models) === null || _a === void 0 ? void 0 : _a.some((m) => m.name.includes("nomic-embed-text"));
                setOllamaAvailable(hasModel);
            }
        }
        catch (e) {
            console.error("ollama check error:", e);
            setOllamaAvailable(false);
            if (useEmbeddings) {
                setUseEmbeddings(false);
            }
        }
    });
    // Check Ollama status periodically
    (0, react_1.useEffect)(() => {
        checkOllama();
        const interval = setInterval(checkOllama, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, []);
    return (<div className="w-full space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold">data import</h1>
        <p className="text-sm text-gray-500">
          add your own video recordings (mp4, mov, avi) into screenpipe
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input_1.Input placeholder="enter path to index (e.g., /path/to/files)" value={path} onChange={(e) => setPath(e.target.value)} className="font-mono"/>
          <button_1.Button onClick={handleSelectFolder} variant="outline" className="whitespace-nowrap">
            <lucide_react_2.FolderOpen className="h-4 w-4 mr-2"/>
            select folder
          </button_1.Button>
        </div>

        {/* Metadata Configuration Section */}
        {detectedVideos.length > 0 && (<card_1.Card className="mt-4">
            <card_1.CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">
                configure video metadata
              </h3>
              <accordion_1.Accordion type="single" collapsible className="w-full">
                {detectedVideos.map((video, index) => {
                var _a, _b, _c, _d, _e;
                return (<accordion_1.AccordionItem key={video} value={`video-${index}`}>
                    <accordion_1.AccordionTrigger className="text-sm">
                      {video.split("/").pop()}
                    </accordion_1.AccordionTrigger>
                    <accordion_1.AccordionContent>
                      <div className="space-y-4 p-4">
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <label_1.Label>custom name</label_1.Label>
                            <input_1.Input placeholder="enter a custom name for this video" value={((_a = metadataConfig[index]) === null || _a === void 0 ? void 0 : _a.metadata.name) || ""} autoCorrect="off" autoComplete="off" autoCapitalize="off" onChange={(e) => handleMetadataChange(index, "name", e.target.value)}/>
                          </div>
                          <div className="space-y-2">
                            <label_1.Label>device name</label_1.Label>
                            <input_1.Input placeholder="enter device name" value={((_b = metadataConfig[index]) === null || _b === void 0 ? void 0 : _b.metadata.device_name) ||
                        ""} autoCorrect="off" autoComplete="off" autoCapitalize="off" onChange={(e) => handleMetadataChange(index, "device_name", e.target.value)}/>
                          </div>
                          <div className="space-y-2">
                            <label_1.Label>fps</label_1.Label>
                            <input_1.Input type="number" placeholder="enter fps (optional)" value={((_c = metadataConfig[index]) === null || _c === void 0 ? void 0 : _c.metadata.fps) || ""} onChange={(e) => handleMetadataChange(index, "fps", parseFloat(e.target.value))}/>
                          </div>
                          <div className="space-y-2">
                            <label_1.Label>creation time</label_1.Label>
                            <input_1.Input type="datetime-local" value={((_e = (_d = metadataConfig[index]) === null || _d === void 0 ? void 0 : _d.metadata.creation_time) === null || _e === void 0 ? void 0 : _e.split("Z")[0]) || ""} onChange={(e) => handleMetadataChange(index, "creation_time", new Date(e.target.value).toISOString())}/>
                          </div>
                        </div>
                      </div>
                    </accordion_1.AccordionContent>
                  </accordion_1.AccordionItem>);
            })}
              </accordion_1.Accordion>
            </card_1.CardContent>
          </card_1.Card>)}

        {detectedVideos.length > 0 && (<div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button_1.Button onClick={handleIndex} disabled={isIndexing}>
                <lucide_react_1.Command className="h-4 w-4 mr-2"/>
                {isIndexing ? "importing..." : "start import"}
              </button_1.Button>

              <div className="flex flex-col gap-1 ml-2">
                <div className="flex items-center gap-2">
                  <tooltip_1.TooltipProvider>
                    <tooltip_1.Tooltip>
                      <tooltip_1.TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="embeddings-toggle" checked={useEmbeddings} onChange={(e) => setUseEmbeddings(e.target.checked)} disabled={!ollamaAvailable} className={`h-4 w-4 ${!ollamaAvailable
                ? "cursor-not-allowed opacity-50"
                : ""}`}/>
                          <label_1.Label htmlFor="embeddings-toggle" className={`text-sm ${!ollamaAvailable
                ? "cursor-not-allowed opacity-50"
                : ""}`}>
                            generate embeddings
                          </label_1.Label>
                          {ollamaAvailable === false && (<lucide_react_3.AlertCircle className="h-4 w-4 text-yellow-500"/>)}
                        </div>
                      </tooltip_1.TooltipTrigger>
                      <tooltip_1.TooltipContent side="top" className="max-w-[300px]">
                        {ollamaAvailable === false ? (<div className="space-y-2">
                            <p>ollama is not running. to enable embeddings:</p>
                            <ol className="list-decimal list-inside space-y-1">
                              <li>
                                install ollama from{" "}
                                <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline">
                                  ollama.ai
                                </a>
                              </li>
                              <li>start ollama</li>
                              <li>
                                run:{" "}
                                <code className="bg-secondary px-1 rounded">
                                  ollama run nomic-embed-text
                                </code>
                              </li>
                            </ol>
                          </div>) : ollamaAvailable === true ? (<p>ollama is running and ready for embeddings</p>) : (<p>checking ollama availability...</p>)}
                      </tooltip_1.TooltipContent>
                    </tooltip_1.Tooltip>
                  </tooltip_1.TooltipProvider>
                </div>
                {useEmbeddings && ollamaAvailable && (<p className="text-xs text-muted-foreground">
                    using ollama with nomic-embed-text model for embeddings
                  </p>)}
              </div>
            </div>

            {/* Progress indicator */}
            {isIndexing && (<div className="flex-1 text-sm text-muted-foreground space-y-2">
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"/>
                  <span>
                    {progress
                    ? `processing ${progress.current}/${progress.total} videos...`
                    : "analyzing files..."}
                  </span>
                </div>
                {progress && (<div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{
                        width: `${(progress.current / progress.total) * 100}%`,
                    }}/>
                  </div>)}
              </div>)}
          </div>)}
      </div>
    </div>);
}
