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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeStore = void 0;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const switch_1 = require("@/components/ui/switch");
const lucide_react_1 = require("lucide-react");
const use_toast_1 = require("@/components/ui/use-toast");
const use_health_check_1 = require("@/lib/hooks/use-health-check");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const store_1 = require("@/lib/api/store");
const plugin_shell_2 = require("@tauri-apps/plugin-shell");
const event_1 = require("@tauri-apps/api/event");
const pipe_details_1 = require("./pipe-store/pipe-details");
const pipe_card_1 = require("./pipe-store/pipe-card");
const add_pipe_form_1 = require("./pipe-store/add-pipe-form");
const use_settings_1 = require("@/lib/hooks/use-settings");
const posthog_js_1 = __importDefault(require("posthog-js"));
const progress_1 = require("./ui/progress");
const plugin_dialog_1 = require("@tauri-apps/plugin-dialog");
const login_dialog_1 = require("./login-dialog");
const plugin_deep_link_1 = require("@tauri-apps/plugin-deep-link");
const use_status_dialog_1 = require("@/lib/hooks/use-status-dialog");
const tooltip_1 = require("@/components/ui/tooltip");
const corePipes = ["data-table", "search"];
const PipeStore = () => {
    const { health } = (0, use_health_check_1.useHealthCheck)();
    const [selectedPipe, setSelectedPipe] = (0, react_1.useState)(null);
    const { settings, loadUser } = (0, use_settings_1.useSettings)();
    const [pipes, setPipes] = (0, react_1.useState)([]);
    const [installedPipes, setInstalledPipes] = (0, react_1.useState)([]);
    const [searchQuery, setSearchQuery] = (0, react_1.useState)("");
    const [showInstalledOnly, setShowInstalledOnly] = (0, react_1.useState)(false);
    const [purchaseHistory, setPurchaseHistory] = (0, react_1.useState)([]);
    const { showLoginDialog, setShowLoginDialog, checkLogin } = (0, login_dialog_1.useLoginCheck)();
    const { open: openStatusDialog } = (0, use_status_dialog_1.useStatusDialog)();
    const [loadingPurchases, setLoadingPurchases] = (0, react_1.useState)(new Set());
    const [loadingInstalls, setLoadingInstalls] = (0, react_1.useState)(new Set());
    const filteredPipes = pipes
        .filter((pipe) => pipe.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (!showInstalledOnly || pipe.is_installed) &&
        !pipe.is_installing)
        .sort((a, b) => Number(b.is_paid) - Number(a.is_paid));
    // Add debounced search tracking
    (0, react_1.useEffect)(() => {
        const timeoutId = setTimeout(() => {
            if (searchQuery) {
                posthog_js_1.default.capture("search_pipes", {
                    query: searchQuery,
                    results_count: filteredPipes.length,
                });
            }
        }, 1000); // Debounce for 1 second
        return () => clearTimeout(timeoutId);
    }, [searchQuery, filteredPipes.length]);
    (0, react_1.useEffect)(() => {
        const unsubscribePromise = (0, event_1.listen)("update-all-pipes", () => __awaiter(void 0, void 0, void 0, function* () {
            // not sure this is a good idea ... basically pipes will break in the hand of users when update will happen
            if (!checkLogin(settings.user, false))
                return;
            for (const pipe of pipes) {
                // Then download the new version
                yield handleUpdatePipe(pipe);
            }
            // Refresh the pipe list
            yield fetchInstalledPipes();
        }));
        return () => {
            unsubscribePromise.then((unsubscribe) => unsubscribe());
        };
    }, []);
    const fetchStorePlugins = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const pipeApi = yield store_1.PipeApi.create((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token);
            const plugins = yield pipeApi.listStorePlugins();
            // Create PipeWithStatus objects for store plugins
            const storePluginsWithStatus = yield Promise.all(plugins.map((plugin) => __awaiter(void 0, void 0, void 0, function* () {
                var _a, _b, _c;
                const installedPipe = installedPipes.find((p) => { var _a; return ((_a = p.config) === null || _a === void 0 ? void 0 : _a.id) === plugin.id; });
                const currentVersion = (_a = installedPipe === null || installedPipe === void 0 ? void 0 : installedPipe.config) === null || _a === void 0 ? void 0 : _a.version;
                let has_update = false;
                if (currentVersion) {
                    try {
                        const updateCheck = yield pipeApi.checkUpdate(plugin.id, currentVersion);
                        has_update = updateCheck.has_update;
                    }
                    catch (error) {
                        console.error(`Failed to check updates for ${plugin.id}:`, error);
                    }
                }
                return Object.assign(Object.assign({}, plugin), { is_installed: !!installedPipe, installed_config: installedPipe === null || installedPipe === void 0 ? void 0 : installedPipe.config, has_purchased: purchaseHistory.some((p) => p.plugin_id === plugin.id), is_core_pipe: corePipes.includes(plugin.name), is_enabled: (_c = (_b = installedPipe === null || installedPipe === void 0 ? void 0 : installedPipe.config) === null || _b === void 0 ? void 0 : _b.enabled) !== null && _c !== void 0 ? _c : false, has_update });
            })));
            const customPipes = installedPipes
                .filter((p) => !plugins.some((plugin) => { var _a; return plugin.id === ((_a = p.config) === null || _a === void 0 ? void 0 : _a.id); }))
                .map((p) => {
                var _a, _b, _c, _d, _e, _f;
                console.log(p.config);
                const pluginName = (_b = (_a = p.config) === null || _a === void 0 ? void 0 : _a.source) === null || _b === void 0 ? void 0 : _b.split("/").pop();
                return {
                    id: ((_c = p.config) === null || _c === void 0 ? void 0 : _c.id) || "",
                    name: pluginName || "",
                    description: "",
                    version: ((_d = p.config) === null || _d === void 0 ? void 0 : _d.version) || "0.0.0",
                    is_paid: false,
                    price: 0,
                    status: "active",
                    created_at: new Date().toISOString(),
                    developer_accounts: { developer_name: "You" },
                    plugin_analytics: { downloads_count: 0 },
                    is_installed: true,
                    installed_config: p.config,
                    has_purchased: true,
                    is_core_pipe: false,
                    is_enabled: ((_e = p.config) === null || _e === void 0 ? void 0 : _e.enabled) || false,
                    source_code: ((_f = p.config) === null || _f === void 0 ? void 0 : _f.source) || "",
                };
            });
            setPipes([...storePluginsWithStatus, ...customPipes]);
        }
        catch (error) {
            console.warn("Failed to fetch store plugins:", error);
        }
    });
    const fetchPurchaseHistory = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        if (!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token))
            return;
        const pipeApi = yield store_1.PipeApi.create(settings.user.token);
        const purchaseHistory = yield pipeApi.getUserPurchaseHistory();
        setPurchaseHistory(purchaseHistory);
    });
    const handlePurchasePipe = (pipe, onComplete) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (!checkLogin(settings.user))
                return;
            setLoadingPurchases((prev) => new Set(prev).add(pipe.id));
            const pipeApi = yield store_1.PipeApi.create(settings.user.token);
            const response = yield pipeApi.purchasePipe(pipe.id);
            if (response.data.payment_successful) {
                yield handleInstallPipe(pipe);
                (0, use_toast_1.toast)({
                    title: "purchase & install successful",
                    description: "payment processed with saved card",
                });
            }
            else if (response.data.already_purchased) {
                yield handleInstallPipe(pipe);
                (0, use_toast_1.toast)({
                    title: "pipe already purchased",
                    description: "installing pipe...",
                });
            }
            else if (response.data.used_credits) {
                yield handleInstallPipe(pipe);
                (0, use_toast_1.toast)({
                    title: "purchase & install successful",
                    description: "your pipe has been purchased and installed",
                });
            }
            else if (response.data.checkout_url) {
                (0, plugin_shell_2.open)(response.data.checkout_url);
                (0, use_toast_1.toast)({
                    title: "redirecting to checkout",
                    description: "you'll be able to install the pipe after purchase",
                });
            }
            onComplete === null || onComplete === void 0 ? void 0 : onComplete();
        }
        catch (error) {
            console.error("error purchasing pipe:", error);
            (0, use_toast_1.toast)({
                title: "error purchasing pipe",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
        finally {
            setLoadingPurchases((prev) => {
                const next = new Set(prev);
                next.delete(pipe.id);
                return next;
            });
        }
    });
    const handleInstallSideload = (url) => __awaiter(void 0, void 0, void 0, function* () {
        posthog_js_1.default.capture("add_own_pipe", {
            newRepoUrl: url,
        });
        try {
            const t = (0, use_toast_1.toast)({
                title: "adding custom pipe",
                description: (<div className="space-y-2">
            <progress_1.Progress value={0} className="h-1"/>
            <p className="text-xs">starting installation...</p>
          </div>),
                duration: 100000,
            });
            let value = 0;
            const progressInterval = setInterval(() => {
                value += 3;
                t.update({
                    id: t.id,
                    title: "adding custom pipe",
                    description: (<div className="space-y-2">
              <progress_1.Progress value={value} className="h-1"/>
              <p className="text-xs">installing dependencies...</p>
            </div>),
                    duration: 100000,
                });
            }, 500);
            const response = yield fetch("http://localhost:3030/pipes/download", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ url: url }),
            });
            const data = yield response.json();
            clearInterval(progressInterval);
            if (!data.success) {
                throw new Error(data.error || "Failed to download pipe");
            }
            t.update({
                id: t.id,
                title: "pipe added",
                description: (<div className="space-y-2">
            <progress_1.Progress value={100} className="h-1"/>
            <p className="text-xs">completed successfully</p>
          </div>),
                duration: 2000,
            });
            yield fetchInstalledPipes();
            t.dismiss();
        }
        catch (error) {
            console.error("failed to add custom pipe:", error);
            (0, use_toast_1.toast)({
                title: "error adding custom pipe",
                description: "please check the url and try again.",
                variant: "destructive",
            });
        }
    });
    const handleInstallPipe = (pipe, onComplete) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (!checkLogin(settings.user))
                return;
            // Keep the pipe in its current position by updating its status
            setPipes((prevPipes) => prevPipes.map((p) => p.id === pipe.id ? Object.assign(Object.assign({}, p), { is_installing: true }) : p));
            setLoadingInstalls((prev) => new Set(prev).add(pipe.id));
            const t = (0, use_toast_1.toast)({
                title: "downloading pipe",
                description: (<div className="space-y-2">
            <progress_1.Progress value={0} className="h-1"/>
            <p className="text-xs">downloading from server...</p>
          </div>),
                duration: 100000,
            });
            const pipeApi = yield store_1.PipeApi.create(settings.user.token);
            const response = yield pipeApi.downloadPipe(pipe.id);
            t.update({
                id: t.id,
                title: "installing pipe",
                description: (<div className="space-y-2">
            <progress_1.Progress value={50} className="h-1"/>
            <p className="text-xs">installing dependencies...</p>
          </div>),
                duration: 100000,
            });
            const downloadResponse = yield fetch("http://localhost:3030/pipes/download-private", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    pipe_name: pipe.name,
                    pipe_id: pipe.id,
                    url: response.download_url,
                }),
            });
            const data = yield downloadResponse.json();
            if (!data.success) {
                throw new Error(data.error || "Failed to download pipe");
            }
            yield fetchInstalledPipes();
            t.update({
                id: t.id,
                title: "pipe installed",
                description: (<div className="space-y-2">
            <progress_1.Progress value={100} className="h-1"/>
            <p className="text-xs">completed successfully</p>
          </div>),
                duration: 2000,
            });
            // Update the pipe's status after successful installation
            setPipes((prevPipes) => prevPipes.map((p) => p.id === pipe.id
                ? Object.assign(Object.assign({}, p), { is_installed: true, is_installing: false }) : p));
            onComplete === null || onComplete === void 0 ? void 0 : onComplete();
            t.dismiss();
        }
        catch (error) {
            // Reset the pipe's status on error
            setPipes((prevPipes) => prevPipes.map((p) => p.id === pipe.id ? Object.assign(Object.assign({}, p), { is_installing: false }) : p));
            if (error.cause === store_1.PipeDownloadError.PURCHASE_REQUIRED) {
                return (0, use_toast_1.toast)({
                    title: "paid pipe",
                    description: "this pipe requires purchase. please visit screenpi.pe to buy credits.",
                    variant: "destructive",
                });
            }
            (0, use_toast_1.toast)({
                title: "error installing pipe",
                description: error.message,
                variant: "destructive",
            });
        }
        finally {
            setLoadingInstalls((prev) => {
                const next = new Set(prev);
                next.delete(pipe.id);
                return next;
            });
        }
    });
    const fetchInstalledPipes = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!health || (health === null || health === void 0 ? void 0 : health.status) === "error")
            return;
        try {
            const response = yield fetch("http://localhost:3030/pipes/list");
            const data = (yield response.json());
            if (!data.success)
                throw new Error("Failed to fetch installed pipes");
            setInstalledPipes(data.data);
            return data.data;
        }
        catch (error) {
            console.error("Error fetching installed pipes:", error);
            (0, use_toast_1.toast)({
                title: "error fetching installed pipes",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
    });
    const handleResetAllPipes = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const t = (0, use_toast_1.toast)({
                title: "resetting pipes",
                description: (<div className="space-y-2">
            <progress_1.Progress value={0} className="h-1"/>
            <p className="text-xs">deleting all pipes...</p>
          </div>),
                duration: 100000,
            });
            const cmd = plugin_shell_1.Command.sidecar("screenpipe", ["pipe", "purge", "-y"]);
            yield cmd.execute();
            yield fetchInstalledPipes();
            t.update({
                id: t.id,
                title: "pipes reset",
                description: (<div className="space-y-2">
            <progress_1.Progress value={100} className="h-1"/>
            <p className="text-xs">all pipes have been deleted</p>
          </div>),
                duration: 2000,
            });
        }
        catch (error) {
            console.error("failed to reset pipes:", error);
            (0, use_toast_1.toast)({
                title: "error resetting pipes",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
    });
    const handleUpdateAllPipes = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (delayToast = false) {
        try {
            if (!checkLogin(settings.user))
                return;
            let t;
            if (!delayToast) {
                t = (0, use_toast_1.toast)({
                    title: "checking for updates",
                    description: (<div className="space-y-2">
              <progress_1.Progress value={0} className="h-1"/>
              <p className="text-xs">checking installed pipes...</p>
            </div>),
                    duration: 100000,
                });
            }
            // Filter installed pipes that have updates available
            const pipesToUpdate = pipes.filter((pipe) => pipe.is_installed && pipe.has_update);
            if (pipesToUpdate.length === 0) {
                if (t) {
                    t.update({
                        id: t.id,
                        title: "no updates available",
                        description: "all pipes are up to date",
                        duration: 2000,
                    });
                }
                return;
            }
            // Update progress message
            if (t) {
                t.update({
                    id: t.id,
                    title: `updating ${pipesToUpdate.length} pipes`,
                    description: (<div className="space-y-2">
              <progress_1.Progress value={0} className="h-1"/>
              <p className="text-xs">starting updates...</p>
            </div>),
                    duration: 100000,
                });
            }
            else {
                t = (0, use_toast_1.toast)({
                    title: `updating ${pipesToUpdate.length} pipes`,
                    description: (<div className="space-y-2">
              <progress_1.Progress value={0} className="h-1"/>
              <p className="text-xs">starting updates...</p>
            </div>),
                    duration: 100000,
                });
            }
            // Update each pipe sequentially
            for (let i = 0; i < pipesToUpdate.length; i++) {
                const pipe = pipesToUpdate[i];
                const progress = Math.round((i / pipesToUpdate.length) * 100);
                t.update({
                    id: t.id,
                    title: `updating pipes (${i + 1}/${pipesToUpdate.length})`,
                    description: (<div className="space-y-2">
              <progress_1.Progress value={progress} className="h-1"/>
              <p className="text-xs">updating {pipe.name}...</p>
            </div>),
                    duration: 100000,
                });
                yield handleUpdatePipe(pipe);
            }
            t.update({
                id: t.id,
                title: "all pipes updated",
                description: (<div className="space-y-2">
            <progress_1.Progress value={100} className="h-1"/>
            <p className="text-xs">completed successfully</p>
          </div>),
                duration: 2000,
            });
        }
        catch (error) {
            console.error("failed to update all pipes:", error);
            (0, use_toast_1.toast)({
                title: "error updating pipes",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
    });
    const handleTogglePipe = (pipe, onComplete) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        try {
            const t = (0, use_toast_1.toast)({
                title: "loading pipe",
                description: "please wait...",
                action: (<div className="flex items-center">
            <lucide_react_1.Loader2 className="h-4 w-4 animate-spin"/>
          </div>),
                duration: 4000,
            });
            const endpoint = ((_a = pipe.installed_config) === null || _a === void 0 ? void 0 : _a.enabled) ? "disable" : "enable";
            const response = yield fetch(`http://localhost:3030/pipes/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ pipe_id: pipe.name }),
            });
            const data = yield response.json();
            if (!data.success) {
                throw new Error(data.error);
            }
            (0, use_toast_1.toast)({
                title: `pipe ${endpoint}d`,
            });
            const installedPipes = yield fetchInstalledPipes();
            const pp = installedPipes === null || installedPipes === void 0 ? void 0 : installedPipes.find((p) => p.config.id === pipe.id);
            const port = pp === null || pp === void 0 ? void 0 : pp.config.port;
            setSelectedPipe((prev) => {
                var _a;
                if (!prev)
                    return prev;
                return Object.assign(Object.assign({}, prev), { installed_config: Object.assign(Object.assign({ port }, prev.installed_config), { enabled: !((_a = pipe.installed_config) === null || _a === void 0 ? void 0 : _a.enabled) }) });
            });
            onComplete();
        }
        catch (error) {
            console.error(`Failed to ${((_b = pipe.installed_config) === null || _b === void 0 ? void 0 : _b.enabled) ? "disable" : "enable"} pipe:`, error);
            (0, use_toast_1.toast)({
                title: "error toggling pipe",
                description: "please try again or check the logs for more information.",
                variant: "destructive",
            });
        }
    });
    const handleLoadFromLocalFolder = (setNewRepoUrl) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const selectedFolder = yield (0, plugin_dialog_1.open)({
                directory: true,
                multiple: false,
            });
            if (selectedFolder) {
                console.log("loading from local folder", selectedFolder);
                // set in the bar
                setNewRepoUrl(selectedFolder);
            }
        }
        catch (error) {
            console.error("failed to load pipe from local folder:", error);
            (0, use_toast_1.toast)({
                title: "error loading pipe",
                description: "please try again or check the logs for more information.",
                variant: "destructive",
            });
        }
    });
    const handleConfigSave = (config) => __awaiter(void 0, void 0, void 0, function* () {
        if (selectedPipe) {
            try {
                const response = yield fetch("http://localhost:3030/pipes/update", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pipe_id: selectedPipe.name,
                        config: config,
                    }),
                });
                const data = yield response.json();
                if (!data.success) {
                    throw new Error(data.error || "Failed to update pipe configuration");
                }
                (0, use_toast_1.toast)({
                    title: "Configuration saved",
                    description: "The pipe configuration has been updated.",
                });
                setSelectedPipe(Object.assign(Object.assign({}, selectedPipe), { installed_config: Object.assign(Object.assign({}, selectedPipe.installed_config), config) }));
            }
            catch (error) {
                console.error("Failed to save config:", error);
                (0, use_toast_1.toast)({
                    title: "error saving configuration",
                    description: "please try again or check the logs for more information.",
                    variant: "destructive",
                });
            }
        }
    });
    const handleDeletePipe = (pipe) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            (0, use_toast_1.toast)({
                title: "deleting pipe",
                description: "please wait...",
            });
            setSelectedPipe(null);
            const response = yield fetch("http://localhost:3030/pipes/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ pipe_id: pipe.name }),
            });
            const data = yield response.json();
            if (!data.success) {
                throw new Error(data.error);
            }
            // First unselect the pipe, then fetch the updated list
            yield fetchInstalledPipes();
            (0, use_toast_1.toast)({
                title: "pipe deleted",
                description: "the pipe has been successfully removed",
            });
            setSelectedPipe(null);
        }
        catch (error) {
            console.error("failed to delete pipe:", error);
            (0, use_toast_1.toast)({
                title: "error deleting pipe",
                description: "please try again or check the logs for more information.",
                variant: "destructive",
            });
        }
    });
    const handleRefreshFromDisk = (pipe) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            (0, use_toast_1.toast)({
                title: "refreshing pipe",
                description: "please wait...",
            });
            const response = yield fetch(`http://localhost:3030/pipes/download`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ url: (_a = pipe.installed_config) === null || _a === void 0 ? void 0 : _a.source }),
            });
            if (!response.ok) {
                throw new Error("failed to refresh pipe");
            }
            yield fetchInstalledPipes();
            (0, use_toast_1.toast)({
                title: "pipe refreshed",
                description: "the pipe has been successfully refreshed from disk.",
            });
        }
        catch (error) {
            console.error("failed to refresh pipe from disk:", error);
            (0, use_toast_1.toast)({
                title: "error refreshing pipe",
                description: "please try again or check the logs for more information.",
                variant: "destructive",
            });
        }
        finally {
            setSelectedPipe(null);
        }
    });
    const handleUpdatePipe = (pipe) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            if (!checkLogin(settings.user))
                return;
            const currentVersion = (_a = pipe.installed_config) === null || _a === void 0 ? void 0 : _a.version;
            const storeApi = yield store_1.PipeApi.create(settings.user.token);
            const update = yield storeApi.checkUpdate(pipe.id, currentVersion);
            if (!update.has_update) {
                (0, use_toast_1.toast)({
                    title: "no update available",
                    description: "the pipe is already up to date",
                });
                return;
            }
            const t = (0, use_toast_1.toast)({
                title: "updating pipe",
                description: (<div className="space-y-2">
            <progress_1.Progress value={25} className="h-1"/>
            <p className="text-xs">checking for updates...</p>
          </div>),
                duration: 100000,
            });
            // Update progress for download start
            t.update({
                id: t.id,
                description: (<div className="space-y-2">
            <progress_1.Progress value={50} className="h-1"/>
            <p className="text-xs">downloading update...</p>
          </div>),
            });
            const responseDownload = yield storeApi.downloadPipe(pipe.id);
            // Update progress for installation
            t.update({
                id: t.id,
                description: (<div className="space-y-2">
            <progress_1.Progress value={75} className="h-1"/>
            <p className="text-xs">installing update...</p>
          </div>),
            });
            const response = yield fetch(`http://localhost:3030/pipes/update-version`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    pipe_id: pipe.name,
                    source: responseDownload.download_url,
                }),
            });
            const data = yield response.json();
            if (!data.success) {
                throw new Error(data.error);
            }
            // Update progress for completion
            t.update({
                id: t.id,
                title: "pipe updated",
                description: (<div className="space-y-2">
            <progress_1.Progress value={100} className="h-1"/>
            <p className="text-xs">completed successfully</p>
          </div>),
                duration: 2000,
            });
            yield fetchInstalledPipes();
            t.dismiss();
        }
        catch (error) {
            console.error("failed to update pipe:", error);
            (0, use_toast_1.toast)({
                title: "error updating pipe",
                description: "please try again or check the logs for more information.",
                variant: "destructive",
            });
        }
    });
    (0, react_1.useEffect)(() => {
        fetchStorePlugins();
    }, [installedPipes, purchaseHistory]);
    (0, react_1.useEffect)(() => {
        fetchPurchaseHistory();
    }, [settings.user]);
    (0, react_1.useEffect)(() => {
        fetchInstalledPipes();
    }, [health]);
    (0, react_1.useEffect)(() => {
        const interval = setInterval(() => {
            fetchInstalledPipes();
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    (0, react_1.useEffect)(() => {
        const setupDeepLink = () => __awaiter(void 0, void 0, void 0, function* () {
            const unsubscribeDeepLink = yield (0, plugin_deep_link_1.onOpenUrl)((urls) => __awaiter(void 0, void 0, void 0, function* () {
                console.log("received deep link urls:", urls);
                for (const url of urls) {
                    if (url.includes("purchase-successful")) {
                        const urlObj = new URL(url);
                        const pipeId = urlObj.searchParams.get("pipe_id");
                        if (!pipeId) {
                            (0, use_toast_1.toast)({
                                title: "purchase successful",
                                description: "your purchase was successful",
                            });
                            return;
                        }
                        yield new Promise((resolve) => setTimeout(resolve, 1000));
                        // First update purchase history to reflect the new purchase
                        yield fetchPurchaseHistory();
                        // Find the pipe in the store
                        const purchasedPipe = pipes.find((pipe) => pipe.id === pipeId);
                        if (!purchasedPipe) {
                            (0, use_toast_1.toast)({
                                title: "error installing pipe",
                                description: "could not find the purchased pipe",
                                variant: "destructive",
                            });
                            return;
                        }
                        // Install the pipe
                        yield handleInstallPipe(purchasedPipe);
                    }
                }
            }));
            return unsubscribeDeepLink;
        });
        let deepLinkUnsubscribe;
        setupDeepLink().then((unsubscribe) => {
            deepLinkUnsubscribe = unsubscribe;
        });
        return () => {
            if (deepLinkUnsubscribe)
                deepLinkUnsubscribe();
        };
    }, [pipes]);
    if ((health === null || health === void 0 ? void 0 : health.status) === "error") {
        return (<div className="flex flex-col items-center justify-center h-screen p-4 space-y-4">
        <div className="text-center space-y-4">
          <h3 className="text-lg font-medium">screenpipe is not recording</h3>
          <p className="text-sm text-muted-foreground">
            please start the screenpipe service to browse and manage pipes
          </p>
          <button_1.Button variant="outline" onClick={openStatusDialog} className="gap-2">
            <lucide_react_1.Power className="h-4 w-4"/>
            check service status
          </button_1.Button>
        </div>
      </div>);
    }
    if (selectedPipe) {
        return (<pipe_details_1.PipeDetails pipe={selectedPipe} onClose={() => setSelectedPipe(null)} onToggle={handleTogglePipe} onConfigSave={handleConfigSave} onDelete={handleDeletePipe} onRefreshFromDisk={handleRefreshFromDisk} onUpdate={handleUpdatePipe}/>);
    }
    return (<div className="overflow-hidden flex flex-col space-y-4 min-w-[800px]">
      <div className="flex flex-col flex-1 overflow-hidden space-y-4 p-4 min-w-[800px]">
        <div className="space-y-4 min-w-[800px]">
          <div className="flex flex-col gap-4 w-[50%]">
            <div className="flex-1 relative">
              <lucide_react_1.Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
              <input_1.Input placeholder="search community pipes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" autoCorrect="off" autoComplete="off"/>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">show installed only</span>
              <switch_1.Switch checked={showInstalledOnly} onCheckedChange={setShowInstalledOnly}/>
              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <button_1.Button variant="outline" size="icon" onClick={handleResetAllPipes} className="flex items-center gap-2">
                      <lucide_react_1.Trash2 className="h-4 w-4"/>
                    </button_1.Button>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>reset all pipes</p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <button_1.Button variant="outline" size="icon" onClick={() => handleUpdateAllPipes()} className="flex items-center gap-2" disabled={!pipes.some((pipe) => pipe.is_installed && pipe.has_update)}>
                      <lucide_react_1.RefreshCw className="h-4 w-4"/>
                    </button_1.Button>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>update all pipes</p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            {filteredPipes.map((pipe) => (<pipe_card_1.PipeCard key={pipe.id} pipe={pipe} onInstall={handleInstallPipe} onClick={setSelectedPipe} onPurchase={handlePurchasePipe} isLoadingPurchase={loadingPurchases.has(pipe.id)} isLoadingInstall={loadingInstalls.has(pipe.id)} onToggle={handleTogglePipe}/>))}
          </div>
        </div>

        <add_pipe_form_1.AddPipeForm onAddPipe={handleInstallSideload} isHealthy={(health === null || health === void 0 ? void 0 : health.status) !== "error"} onLoadFromLocalFolder={handleLoadFromLocalFolder}/>
      </div>
      <login_dialog_1.LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog}/>
    </div>);
};
exports.PipeStore = PipeStore;
