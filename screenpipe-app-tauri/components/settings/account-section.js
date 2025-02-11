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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountSection = AccountSection;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const use_settings_1 = require("@/lib/hooks/use-settings");
const separator_1 = require("@/components/ui/separator");
const utils_1 = require("@/lib/utils");
const lucide_react_1 = require("lucide-react");
const use_toast_1 = require("@/components/ui/use-toast");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const card_1 = require("../ui/card");
const plugin_deep_link_1 = require("@tauri-apps/plugin-deep-link");
const pricing_toggle_1 = require("./pricing-toggle");
const label_1 = require("@/components/ui/label");
const textarea_1 = require("@/components/ui/textarea");
const input_1 = require("@/components/ui/input");
const posthog_js_1 = __importDefault(require("posthog-js"));
function PlanCard({ title, price, features, isActive, isSelected, onSelect, }) {
    return (<card_1.Card className={(0, utils_1.cn)("rounded-xl border px-6 py-4 flex items-start gap-6 cursor-pointer transition-all", isActive
            ? "border-gray-500/50 bg-gray-500/5"
            : "border-border/50 bg-secondary/5", isSelected && !isActive && "border-primary ring-1 ring-primary", !isActive && "hover:border-primary/50")} onClick={onSelect}>
      <div className="space-y-2 min-w-[200px]">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-medium opacity-80">{title}</h3>
        </div>
        <p className="text-lg">{price}</p>
      </div>

      <ul className="flex-grow space-y-2">
        {features.map((feature, i) => (<li key={i} className="flex items-center text-sm text-muted-foreground">
            <span className="mr-2">•</span>
            {feature}
          </li>))}
      </ul>
    </card_1.Card>);
}
function AccountSection() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
    const { settings, updateSettings, loadUser } = (0, use_settings_1.useSettings)();
    const [isConnectingStripe, setIsConnectingStripe] = (0, react_1.useState)(false);
    const [showApiKey, setShowApiKey] = (0, react_1.useState)(false);
    const [isAnnual, setIsAnnual] = (0, react_1.useState)(true);
    const [profileForm, setProfileForm] = (0, react_1.useState)({
        bio: ((_a = settings.user) === null || _a === void 0 ? void 0 : _a.bio) || "",
        github_username: ((_b = settings.user) === null || _b === void 0 ? void 0 : _b.github_username) || "",
        website: ((_c = settings.user) === null || _c === void 0 ? void 0 : _c.website) || "",
        contact: ((_d = settings.user) === null || _d === void 0 ? void 0 : _d.contact) || "",
    });
    (0, react_1.useEffect)(() => {
        var _a, _b;
        if (!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.email)) {
            posthog_js_1.default.capture("app_login", {
                email: (_b = settings.user) === null || _b === void 0 ? void 0 : _b.email,
            });
        }
        const setupDeepLink = () => __awaiter(this, void 0, void 0, function* () {
            const unsubscribeDeepLink = yield (0, plugin_deep_link_1.onOpenUrl)((urls) => __awaiter(this, void 0, void 0, function* () {
                console.log("received deep link urls:", urls);
                for (const url of urls) {
                    // eg. user flow
                    if (url.includes("api_key=")) {
                        const apiKey = new URL(url).searchParams.get("api_key");
                        if (apiKey) {
                            updateSettings({ user: { token: apiKey } });
                            yield loadUser(apiKey);
                            (0, use_toast_1.toast)({
                                title: "logged in!",
                                description: "your api key has been set",
                            });
                        }
                    }
                    // eg stripe / dev flow
                    if (url.includes("stripe-connect")) {
                        console.log("stripe connect url:", url);
                        if (url.includes("/return")) {
                            if (settings.user) {
                                updateSettings({
                                    user: Object.assign(Object.assign({}, settings.user), { stripe_connected: true }),
                                });
                                loadUser(settings.user.token);
                            }
                            (0, use_toast_1.toast)({
                                title: "stripe connected!",
                                description: "your account is now set up for payments",
                            });
                        }
                        else if (url.includes("/refresh")) {
                            (0, use_toast_1.toast)({
                                title: "stripe setup incomplete",
                                description: "please complete the stripe onboarding process",
                            });
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
    }, [(_e = settings.user) === null || _e === void 0 ? void 0 : _e.token, updateSettings]);
    const clientRefId = `${(_f = settings.user) === null || _f === void 0 ? void 0 : _f.id}&customer_email=${encodeURIComponent((_h = (_g = settings.user) === null || _g === void 0 ? void 0 : _g.email) !== null && _h !== void 0 ? _h : "")}`;
    const plans = [
        {
            title: ((_j = settings.user) === null || _j === void 0 ? void 0 : _j.cloud_subscribed)
                ? "your subscription"
                : "subscription",
            price: ((_k = settings.user) === null || _k === void 0 ? void 0 : _k.cloud_subscribed)
                ? "active"
                : isAnnual
                    ? "$200/year"
                    : "$20/mo",
            features: ((_l = settings.user) === null || _l === void 0 ? void 0 : _l.cloud_subscribed)
                ? [
                    "unlimited screenpipe cloud",
                    "priority support",
                    <a key="portal" href={`https://billing.stripe.com/p/login/3cs6pT8Qbd846yc9AA?email=${encodeURIComponent(((_m = settings.user) === null || _m === void 0 ? void 0 : _m.email) || "")}`} className="text-primary hover:underline cursor-pointer" onClick={(e) => {
                            var _a;
                            e.preventDefault();
                            (0, plugin_shell_1.open)(`https://billing.stripe.com/p/login/3cs6pT8Qbd846yc9AA?email=${encodeURIComponent(((_a = settings.user) === null || _a === void 0 ? void 0 : _a.email) || "")}`);
                        }}>
              manage subscription
            </a>,
                ]
                : [
                    "unlimited screenpipe cloud",
                    "priority support",
                    isAnnual ? "17% discount applied" : "switch to annual for 17% off",
                ],
            url: isAnnual
                ? "https://buy.stripe.com/eVadRzfOCgAi5W0fZu" +
                    `?client_reference_id=${clientRefId}`
                : "https://buy.stripe.com/7sIdRzbym4RA98c7sX" +
                    `?client_reference_id=${clientRefId}`,
        },
        {
            title: "enterprise",
            price: "book a call",
            features: [
                "enterprise screen search engine",
                "dedicated support",
                "consulting",
                "custom features",
            ],
            url: "https://cal.com/louis030195/screenpipe-for-businesses",
        },
    ];
    const handleConnectStripe = () => __awaiter(this, void 0, void 0, function* () {
        var _a;
        setIsConnectingStripe(true);
        try {
            // const host = `${BASE_URL}/api/dev-stripe`;
            const host = `https://screenpi.pe/api/dev/stripe-connect`;
            const response = yield fetch(host, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${(_a = settings.user) === null || _a === void 0 ? void 0 : _a.token}`,
                },
            });
            const { url } = yield response.json();
            yield (0, plugin_shell_1.open)(url);
        }
        catch (error) {
            console.warn("failed to connect stripe", error);
            (0, use_toast_1.toast)({
                title: "failed to connect stripe",
                description: "please try again later",
                variant: "destructive",
            });
        }
        finally {
            setIsConnectingStripe(false);
        }
    });
    const updateProfile = (updates) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token))
            return;
        try {
            const response = yield fetch("https://screenpi.pe/api/plugins/dev-profile", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${settings.user.api_key}`,
                },
                body: JSON.stringify(updates),
            });
            if (!response.ok)
                throw new Error("failed to update profile");
        }
        catch (error) {
            console.error("failed to update profile:", error);
            (0, use_toast_1.toast)({
                title: "update failed",
                description: "couldn't save your profile changes",
                variant: "destructive",
            });
        }
    });
    // Initialize form only once when user data first loads
    (0, react_1.useEffect)(() => {
        if (settings.user &&
            !profileForm.bio &&
            !profileForm.github_username &&
            !profileForm.website &&
            !profileForm.contact) {
            setProfileForm({
                bio: settings.user.bio || "",
                github_username: settings.user.github_username || "",
                website: settings.user.website || "",
                contact: settings.user.contact || "",
            });
        }
    }, [settings.user]); // Only run when settings.user changes
    return (<div className="w-full space-y-6 py-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">account settings</h1>
          {((_o = settings.user) === null || _o === void 0 ? void 0 : _o.email) ? (<p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500"/>
              logged in as {settings.user.email}
            </p>) : (<p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500"/>
              not logged in - some features will be limited
            </p>)}
        </div>
        <div className="flex gap-2">
          {((_p = settings.user) === null || _p === void 0 ? void 0 : _p.token) ? (<>
              <button_1.Button variant="outline" size="sm" onClick={() => (0, plugin_shell_1.open)("https://accounts.screenpi.pe/user")} className="hover:bg-secondary/80">
                manage account <lucide_react_1.UserCog className="w-4 h-4 ml-2"/>
              </button_1.Button>
              <button_1.Button variant="outline" size="sm" onClick={() => {
                updateSettings({ user: { token: undefined } });
                (0, use_toast_1.toast)({
                    title: "logged out",
                    description: "you have been logged out",
                });
            }} className="hover:bg-secondary/80">
                logout <lucide_react_1.ExternalLinkIcon className="w-4 h-4 ml-2"/>
              </button_1.Button>
            </>) : (<button_1.Button variant="outline" size="sm" onClick={() => (0, plugin_shell_1.open)("https://screenpi.pe/login")} className="hover:bg-secondary/80">
              login <lucide_react_1.ExternalLinkIcon className="w-4 h-4 ml-2"/>
            </button_1.Button>)}
        </div>
      </div>

      <div className="space-y-8">
        <div className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-6">
              <h4 className="text-lg font-medium">plans</h4>

              <pricing_toggle_1.PricingToggle isAnnual={isAnnual} onToggle={setIsAnnual}/>

              <div className="flex flex-col gap-4">
                {plans.map((plan) => (<PlanCard key={plan.title} title={plan.title} price={plan.price} features={plan.features} onSelect={() => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                if (plan.title.toLowerCase() === "enterprise") {
                    posthog_js_1.default.capture("enterprise_plan_selected");
                    (0, plugin_shell_1.open)(plan.url);
                    return;
                }
                if (!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.id)) {
                    (0, use_toast_1.toast)({
                        title: "not logged in",
                        description: "please login first to subscribe",
                        variant: "destructive",
                    });
                    return;
                }
                if (!((_b = settings.user) === null || _b === void 0 ? void 0 : _b.cloud_subscribed)) {
                    posthog_js_1.default.capture("cloud_plan_selected");
                    (0, plugin_shell_1.open)(plan.url);
                }
            })}/>))}
              </div>
            </div>
          </div>
        </div>

        {((_q = settings.user) === null || _q === void 0 ? void 0 : _q.token) && (<>
            <separator_1.Separator className="my-6"/>

            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <h4 className="text-lg font-medium">developer access</h4>
                <p className="text-sm text-muted-foreground">
                  get api key to start building pipes
                </p>
              </div>
            </div>

            <div className="p-5 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-gray-900/10 rounded-md">
                    <lucide_react_1.Key className="w-4 h-4 text-gray-900/60"/>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">api key</div>
                      {((_r = settings.user) === null || _r === void 0 ? void 0 : _r.api_key) && (<button_1.Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setShowApiKey(!showApiKey)}>
                          {showApiKey ? (<lucide_react_1.EyeOff className="h-3 w-3"/>) : (<lucide_react_1.Eye className="h-3 w-3"/>)}
                        </button_1.Button>)}
                    </div>
                    {((_s = settings.user) === null || _s === void 0 ? void 0 : _s.api_key) ? (<p className="text-xs font-mono text-muted-foreground">
                        {showApiKey
                    ? settings.user.api_key
                    : settings.user.api_key.replace(/./g, "*")}
                      </p>) : (<p className="text-xs text-muted-foreground">
                        no api key yet - generate one to start building
                      </p>)}
                  </div>
                </div>
                {((_t = settings.user) === null || _t === void 0 ? void 0 : _t.api_key) ? (<button_1.Button variant="secondary" size="sm" className="h-9" onClick={() => {
                    navigator.clipboard.writeText(settings.user.api_key);
                    (0, use_toast_1.toast)({
                        title: "copied to clipboard",
                        description: "your api key has been copied to your clipboard",
                    });
                }}>
                    copy
                  </button_1.Button>) : (<button_1.Button variant="secondary" size="sm" className="h-9" onClick={() => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    try {
                        const response = yield fetch("https://screenpi.pe/api/dev/create", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${(_a = settings.user) === null || _a === void 0 ? void 0 : _a.token}`,
                            },
                        });
                        if (!response.ok)
                            throw new Error("failed to generate api key");
                        const { api_key } = yield response.json();
                        if (settings.user) {
                            const updatedUser = Object.assign(Object.assign({}, settings.user), { api_key });
                            updateSettings({ user: updatedUser });
                            (0, use_toast_1.toast)({
                                title: "api key generated",
                                description: "you can now start building pipes",
                            });
                        }
                    }
                    catch (error) {
                        console.error("failed to generate api key:", error);
                        (0, use_toast_1.toast)({
                            title: "generation failed",
                            description: "couldn't generate api key",
                            variant: "destructive",
                        });
                    }
                })}>
                    generate
                  </button_1.Button>)}
              </div>
            </div>
            <div className="p-5 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-gray-900/10 rounded-md">
                    <lucide_react_1.BookOpen className="w-4 h-4 text-gray-900/60"/>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">documentation</div>
                    <p className="text-xs text-muted-foreground">
                      learn how to build and publish custom pipes
                    </p>
                  </div>
                </div>
                <a href="https://docs.screenpi.pe/docs/plugins" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors rounded-md bg-secondary hover:bg-secondary/80">
                  read docs
                  <lucide_react_1.ArrowUpRight className="w-3 h-3"/>
                </a>
              </div>
            </div>
            <div className="p-5 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-[#635BFF]/10 rounded-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="rounded-md" src="https://images.stripeassets.com/fzn2n1nzq965/HTTOloNPhisV9P4hlMPNA/cacf1bb88b9fc492dfad34378d844280/Stripe_icon_-_square.svg?q=80&w=1082" alt=""/>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      stripe connect
                      {((_u = settings.user) === null || _u === void 0 ? void 0 : _u.stripe_connected) &&
                ((_v = settings.user) === null || _v === void 0 ? void 0 : _v.stripe_account_status) && (<div className={(0, utils_1.cn)("px-2 py-0.5 text-xs rounded-full", settings.user.stripe_account_status === "pending"
                    ? "bg-yellow-500/10 text-yellow-500"
                    : "bg-green-500/10 text-green-500")} title={settings.user.stripe_account_status === "pending"
                    ? "go to stripe and complete your account verification (bank account, id verification...)"
                    : "your stripe account is fully verified and you can start receiving earnings from your pipes"}>
                            {settings.user.stripe_account_status}
                          </div>)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      receive earnings from your pipes (
                      <a href="https://discord.gg/dU9EBuw7Uq" className="underline hover:text-primary" target="_blank">
                        dm @louis030195
                      </a>{" "}
                      for any questions)
                    </p>
                  </div>
                </div>
                {((_w = settings.user) === null || _w === void 0 ? void 0 : _w.stripe_connected) ? (<div className="flex gap-2">
                    <button_1.Button variant="secondary" size="sm" className="h-9" onClick={() => (0, plugin_shell_1.open)("https://dashboard.stripe.com/")}>
                      manage
                    </button_1.Button>
                    <button_1.Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => {
                    if (settings.user) {
                        const updatedUser = Object.assign(Object.assign({}, settings.user), { stripe_connected: false });
                        updateSettings({ user: updatedUser });
                        (0, use_toast_1.toast)({
                            title: "stripe disconnected",
                            description: "your stripe account has been disconnected",
                        });
                    }
                }}>
                      <lucide_react_1.X className="h-4 w-4"/>
                    </button_1.Button>
                  </div>) : (<button_1.Button variant="secondary" size="sm" onClick={handleConnectStripe} className="h-9" disabled={isConnectingStripe || !((_x = settings.user) === null || _x === void 0 ? void 0 : _x.id)}>
                    {isConnectingStripe ? (<lucide_react_1.RefreshCw className="w-4 h-4 animate-spin"/>) : ("connect")}
                  </button_1.Button>)}
              </div>
            </div>
          </>)}

        {((_y = settings.user) === null || _y === void 0 ? void 0 : _y.api_key) && (<>
            <separator_1.Separator className="my-6"/>

            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <h4 className="text-lg font-medium">developer profile</h4>
                <p className="text-sm text-muted-foreground">
                  customize your public developer profile, this will help us
                  approve your pipe faster and help you get more users
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label_1.Label htmlFor="bio">bio</label_1.Label>
                  <textarea_1.Textarea id="bio" placeholder="tell us about yourself..." className="resize-none" rows={3} value={profileForm.bio} disabled={!((_z = settings.user) === null || _z === void 0 ? void 0 : _z.api_key)} onChange={(e) => setProfileForm((prev) => (Object.assign(Object.assign({}, prev), { bio: e.target.value })))} autoCorrect="off" autoComplete="off" autoCapitalize="off"/>
                </div>

                <div className="grid gap-2">
                  <label_1.Label htmlFor="github">github username</label_1.Label>
                  <input_1.Input id="github" placeholder="username" disabled={!((_0 = settings.user) === null || _0 === void 0 ? void 0 : _0.api_key)} value={profileForm.github_username} onChange={(e) => setProfileForm((prev) => (Object.assign(Object.assign({}, prev), { github_username: e.target.value })))} autoCorrect="off" autoComplete="off" autoCapitalize="off"/>
                </div>

                <div className="grid gap-2">
                  <label_1.Label htmlFor="website">website</label_1.Label>
                  <input_1.Input id="website" type="url" placeholder="https://..." value={profileForm.website} disabled={!((_1 = settings.user) === null || _1 === void 0 ? void 0 : _1.api_key)} onChange={(e) => setProfileForm((prev) => (Object.assign(Object.assign({}, prev), { website: e.target.value })))} autoCorrect="off" autoComplete="off" autoCapitalize="off"/>
                </div>

                <div className="grid gap-2">
                  <label_1.Label htmlFor="contact">additional contact</label_1.Label>
                  <input_1.Input id="contact" placeholder="discord, twitter, etc..." value={profileForm.contact} disabled={!((_2 = settings.user) === null || _2 === void 0 ? void 0 : _2.api_key)} onChange={(e) => setProfileForm((prev) => (Object.assign(Object.assign({}, prev), { contact: e.target.value })))} autoCorrect="off" autoComplete="off" autoCapitalize="off"/>
                </div>

                <div className="flex justify-end">
                  <button_1.Button className="w-full" disabled={!((_3 = settings.user) === null || _3 === void 0 ? void 0 : _3.api_key)} onClick={() => __awaiter(this, void 0, void 0, function* () {
                if (!settings.user)
                    return;
                yield updateProfile(profileForm);
                // Update the main settings after successful profile update
                if (settings.user) {
                    const updatedUser = Object.assign(Object.assign({}, settings.user), profileForm);
                    updateSettings({ user: updatedUser });
                }
                (0, use_toast_1.toast)({
                    title: "profile updated",
                    description: "your developer profile has been saved",
                });
            })}>
                    save changes
                  </button_1.Button>
                </div>
              </div>
            </div>
          </>)}
      </div>
    </div>);
}
