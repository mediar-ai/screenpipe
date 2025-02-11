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
const react_1 = __importStar(require("react"));
const lucide_react_1 = require("lucide-react");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const button_1 = require("@/components/ui/button");
const use_settings_1 = require("@/lib/hooks/use-settings");
const use_toast_1 = require("@/components/ui/use-toast");
const plugin_deep_link_1 = require("@tauri-apps/plugin-deep-link");
const navigation_1 = __importDefault(require("./navigation"));
const OnboardingLogin = ({ className = "", handlePrevSlide, handleNextSlide, }) => {
    var _a, _b, _c;
    const { settings, updateSettings, loadUser } = (0, use_settings_1.useSettings)();
    (0, react_1.useEffect)(() => {
        const setupDeepLink = () => __awaiter(void 0, void 0, void 0, function* () {
            const unsubscribeDeepLink = yield (0, plugin_deep_link_1.onOpenUrl)((urls) => __awaiter(void 0, void 0, void 0, function* () {
                console.log("urls", urls);
                for (const url of urls) {
                    if (url.includes("api_key=")) {
                        const apiKey = new URL(url).searchParams.get("api_key");
                        if (apiKey) {
                            updateSettings({ user: { token: apiKey } });
                            loadUser(apiKey);
                            (0, use_toast_1.toast)({
                                title: "logged in!",
                                description: "your api key has been set",
                            });
                            // handleNextSlide();
                        }
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
    }, [(_a = settings.user) === null || _a === void 0 ? void 0 : _a.token, updateSettings, handleNextSlide]);
    return (<div className="w-full h-full flex flex-col items-center justify-center space-y-6 py-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold">login to screenpipe</h1>
          <p className="text-sm text-muted-foreground">
            connect your account to unlock all features
          </p>
        </div>

        <div className="p-6 border border-border/50 rounded-lg bg-background/50">
          <div className="space-y-4">
            {((_b = settings.user) === null || _b === void 0 ? void 0 : _b.email) ? (<p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-green-500"/>
                logged in as {settings.user.email}
              </p>) : (<p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500"/>
                not logged in - some features will be limited
              </p>)}

            <div className="flex flex-col gap-2">
              {((_c = settings.user) === null || _c === void 0 ? void 0 : _c.token) ? (<>
                  <button_1.Button variant="outline" size="sm" onClick={() => (0, plugin_shell_1.open)("https://accounts.screenpi.pe/user")} className="w-full hover:bg-secondary/80">
                    manage account <lucide_react_1.UserCog className="w-4 h-4 ml-2"/>
                  </button_1.Button>
                  <button_1.Button variant="outline" size="sm" onClick={() => {
                updateSettings({ user: { token: undefined } });
                (0, use_toast_1.toast)({
                    title: "logged out",
                    description: "you have been logged out",
                });
            }} className="w-full hover:bg-secondary/80">
                    logout <lucide_react_1.ExternalLinkIcon className="w-4 h-4 ml-2"/>
                  </button_1.Button>
                </>) : (<button_1.Button variant="outline" size="sm" onClick={() => (0, plugin_shell_1.open)("https://screenpi.pe/login")} className="w-full hover:bg-secondary/80">
                  login <lucide_react_1.ExternalLinkIcon className="w-4 h-4 ml-2"/>
                </button_1.Button>)}
            </div>
          </div>
        </div>

        <navigation_1.default className="mt-6" handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide} prevBtnText="previous" nextBtnText="next"/>
      </div>
    </div>);
};
exports.default = OnboardingLogin;
