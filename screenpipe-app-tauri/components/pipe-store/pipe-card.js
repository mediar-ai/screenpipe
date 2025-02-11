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
exports.PipeCard = void 0;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const pipe_store_markdown_1 = require("@/components/pipe-store-markdown");
const core_1 = require("@tauri-apps/api/core");
const use_toast_1 = require("@/components/ui/use-toast");
const framer_motion_1 = require("framer-motion");
const posthog_js_1 = __importDefault(require("posthog-js"));
const use_settings_1 = require("@/lib/hooks/use-settings");
const PipeCard = ({ pipe, onInstall, onClick, onPurchase, isLoadingPurchase, isLoadingInstall, onToggle, }) => {
    var _a, _b, _c;
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const { settings } = (0, use_settings_1.useSettings)();
    const handleOpenWindow = (e) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        e.stopPropagation();
        try {
            if ((_a = pipe.installed_config) === null || _a === void 0 ? void 0 : _a.port) {
                yield (0, core_1.invoke)("open_pipe_window", {
                    port: pipe.installed_config.port,
                    title: pipe.name, // atm we don't support pipes with same name
                });
            }
        }
        catch (err) {
            console.error("failed to open pipe window:", err);
            (0, use_toast_1.toast)({
                title: "error opening pipe window",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
    });
    return (<framer_motion_1.motion.div className="group border rounded-xl p-5 hover:bg-muted/40 has-[.no-card-hover:hover]:hover:bg-transparent transition-all duration-200 cursor-pointer backdrop-blur-sm" onClick={() => onClick(pipe)} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{
            boxShadow: "0 0 10px rgba(255,255,255,0.1)",
            transition: { duration: 0.2 },
        }} layout>
      <div className="flex flex-col h-full justify-between space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg tracking-tight">
                {pipe.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                <pipe_store_markdown_1.PipeStoreMarkdown content={((_a = pipe.description) === null || _a === void 0 ? void 0 : _a.substring(0, 90)) || "" + "..."} variant="compact"/>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 isolate">
            {pipe.is_installed ? (<>
                {!pipe.is_enabled ? (<button_1.Button size="sm" variant="outline" onClick={(e) => {
                    e.stopPropagation();
                    setIsLoading(true);
                    onToggle(pipe, () => setIsLoading(false));
                }} className="hover:bg-muted font-medium relative hover:!bg-muted no-card-hover" disabled={isLoading}>
                    <lucide_react_1.Power className="h-3.5 w-3.5 mr-2"/>
                    enable
                  </button_1.Button>) : (<button_1.Button size="sm" variant="outline" onClick={handleOpenWindow} className="hover:bg-muted font-medium relative no-card-hover">
                    <lucide_react_1.Puzzle className="h-3.5 w-3.5 mr-2"/>
                    open
                  </button_1.Button>)}
              </>) : (<button_1.Button size="sm" variant={pipe.is_paid ? "default" : "outline"} onClick={(e) => {
                var _a, _b;
                e.stopPropagation();
                if (pipe.is_paid && !pipe.has_purchased) {
                    setIsLoading(true);
                    onPurchase(pipe, () => setIsLoading(false));
                    posthog_js_1.default.capture("pipe_purchase", {
                        pipe_id: pipe.id,
                        email: (_a = settings.user) === null || _a === void 0 ? void 0 : _a.email,
                    });
                }
                else {
                    setIsLoading(true);
                    onInstall(pipe, () => setIsLoading(false));
                    posthog_js_1.default.capture("pipe_install", {
                        pipe_id: pipe.id,
                        email: (_b = settings.user) === null || _b === void 0 ? void 0 : _b.email,
                    });
                }
            }} className="font-medium no-card-hover" disabled={isLoadingPurchase}>
                {isLoadingPurchase ? (<>
                    <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  </>) : pipe.is_paid && !pipe.has_purchased ? (`$${pipe.price}`) : (<>
                    <lucide_react_1.Download className="h-3.5 w-3.5 mr-2"/>
                    get
                  </>)}
              </button_1.Button>)}
          </div>
        </div>
        {pipe.developer_accounts.developer_name && (<div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
            <div className="flex items-center gap-1">
              <div className="size-6 rounded-full bg-muted flex items-center justify-center">
                <lucide_react_1.UserIcon className="size-3"/>
              </div>
              {pipe.developer_accounts.developer_name}
            </div>
            {pipe.plugin_analytics.downloads_count != null && (<span className="flex items-center gap-1">
                <lucide_react_1.Download className="h-3 w-3"/>
                {pipe.plugin_analytics.downloads_count}
              </span>)}
            {pipe.source_code && (<framer_motion_1.motion.a href={pipe.source_code} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted hover:bg-accent hover:text-accent-foreground transition-all duration-200 no-card-hover relative overflow-hidden" whileHover={{
                    scale: 1.05,
                    transition: {
                        type: "spring",
                        stiffness: 400,
                        damping: 10,
                    },
                }} whileTap={{ scale: 0.95 }}>
                <framer_motion_1.motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" initial={{ x: "-100%" }} whileHover={{
                    x: "100%",
                    transition: {
                        duration: 0.6,
                        ease: "easeInOut",
                    },
                }}/>
                <lucide_react_1.Download className="h-3 w-3"/>
                <span className="relative z-10 font-mono">source</span>
              </framer_motion_1.motion.a>)}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 font-mono text-xs">
              {((_b = pipe.installed_config) === null || _b === void 0 ? void 0 : _b.version) && "v"}
              {(_c = pipe.installed_config) === null || _c === void 0 ? void 0 : _c.version}
            </span>
            {pipe.has_update && (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 font-mono text-xs animate-pulse">
                <lucide_react_1.ArrowUpCircle className="h-3 w-3"/>
                update
              </span>)}
          </div>)}
      </div>
    </framer_motion_1.motion.div>);
};
exports.PipeCard = PipeCard;
