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
exports.CreditPurchaseDialog = CreditPurchaseDialog;
const react_1 = __importStar(require("react"));
const dialog_1 = require("@/components/ui/dialog");
const button_1 = require("@/components/ui/button");
const badge_1 = require("@/components/ui/badge");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const lucide_react_1 = require("lucide-react");
const use_settings_1 = require("@/lib/hooks/use-settings");
function CreditPurchaseDialog({ open, onOpenChange, requiredCredits, currentCredits, onCreditsUpdated, }) {
    const { settings, loadUser } = (0, use_settings_1.useSettings)();
    const [showRefreshHint, setShowRefreshHint] = (0, react_1.useState)(false);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const handlePurchase = (url) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        setIsLoading(true);
        yield (0, plugin_shell_1.open)(`${url}?client_reference_id=${(_a = settings.user) === null || _a === void 0 ? void 0 : _a.id}&metadata[user_id]=${(_b = settings.user) === null || _b === void 0 ? void 0 : _b.id}`);
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield loadUser((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token);
            onCreditsUpdated === null || onCreditsUpdated === void 0 ? void 0 : onCreditsUpdated();
            setShowRefreshHint(true);
            setIsLoading(false);
        }), 2000);
    });
    return (<dialog_1.Dialog open={open} onOpenChange={onOpenChange}>
      <dialog_1.DialogContent className="w-full max-w-[650px]">
        <dialog_1.DialogHeader>
          <dialog_1.DialogTitle>insufficient credits</dialog_1.DialogTitle>
        </dialog_1.DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            you need {requiredCredits} credits but only have {currentCredits}
          </p>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
              <div className="flex flex-col space-y-1.5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <badge_1.Badge variant="secondary" className="px-1.5 text-xs">
                      monthly
                    </badge_1.Badge>
                    <span className="text-sm font-mono">
                      15 credits/m, unlimited screenpipe cloud, priority support
                    </span>
                  </div>
                  <button_1.Button size="sm" variant="outline" onClick={() => {
            var _a, _b, _c;
            return handlePurchase(`https://buy.stripe.com/5kA6p79qefweacg5kJ?client_reference_id=${(_a = settings.user) === null || _a === void 0 ? void 0 : _a.id}&customer_email=${encodeURIComponent((_c = (_b = settings.user) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '')}`);
        }} disabled={isLoading}>
                    {isLoading ? (<lucide_react_1.Loader2 className="h-4 w-4 animate-spin mr-2"/>) : null}
                    $30/mo
                  </button_1.Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
              <div className="flex flex-col space-y-1.5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <badge_1.Badge variant="secondary" className="px-1.5 text-xs">
                      one-time
                    </badge_1.Badge>
                    <span className="text-sm font-mono">50 credits</span>
                  </div>
                  <button_1.Button size="sm" variant="outline" onClick={() => {
            var _a, _b, _c;
            return handlePurchase(`https://buy.stripe.com/eVaeVD45UbfYeswcNd?client_reference_id=${(_a = settings.user) === null || _a === void 0 ? void 0 : _a.id}&customer_email=${encodeURIComponent((_c = (_b = settings.user) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '')}`);
        }} disabled={isLoading}>
                    {isLoading ? (<lucide_react_1.Loader2 className="h-4 w-4 animate-spin mr-2"/>) : null}
                    $50
                  </button_1.Button>
                </div>
              </div>
            </div>
          </div>

          {showRefreshHint && (<p className="text-xs text-muted-foreground">
              if credits not updating, please refresh page
            </p>)}
        </div>
      </dialog_1.DialogContent>
    </dialog_1.Dialog>);
}
