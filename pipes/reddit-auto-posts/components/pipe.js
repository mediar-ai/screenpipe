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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const use_settings_1 = require("@/lib/hooks/use-settings");
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const label_1 = require("@/components/ui/label");
const lucide_react_1 = require("lucide-react");
const use_toast_1 = require("@/lib/use-toast");
const update_pipe_config_1 = __importDefault(require("@/lib/actions/update-pipe-config"));
const use_health_1 = require("@/lib/hooks/use-health");
const markdown_1 = require("./markdown");
const sql_autocomplete_input_1 = require("./sql-autocomplete-input");
const lucide_react_2 = require("lucide-react");
const use_ai_provider_1 = require("@/lib/hooks/use-ai-provider");
const remark_gfm_1 = __importDefault(require("remark-gfm"));
const remark_math_1 = __importDefault(require("remark-math"));
const tooltip_1 = require("@/components/ui/tooltip");
const select_1 = require("./ui/select");
const Pipe = () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const { settings, updateSettings } = (0, use_settings_1.useSettings)();
    const { isAvailable, error } = (0, use_ai_provider_1.useAiProvider)(settings);
    const { isServerDown } = (0, use_health_1.useHealthCheck)();
    const { toast } = (0, use_toast_1.useToast)();
    const [showKey, setShowKey] = (0, react_1.useState)(false);
    const [loading, setLoading] = (0, react_1.useState)();
    const [lastLog, setLastLog] = (0, react_1.useState)(null);
    const [windowName, setWindowName] = (0, react_1.useState)("");
    const [contentType, setContentType] = (0, react_1.useState)("");
    const [frequency, setFrequency] = (0, react_1.useState)("");
    const [emailTime, setEmailTime] = (0, react_1.useState)("");
    const [hourlyRepetance, setHourlyRepetance] = (0, react_1.useState)("1");
    const aiDisabled = settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;
    const defaultDailylogPrompt = `- Analyze user activities and summarize them into a structured daily log.
- Focus on identifying the purpose and context of each activity, categorizing them into clear categories like 'work', 'email', 'slack', etc.
- Assign appropriate tags that provide context and detail about the activity.
- Ensure the summary is concise, relevant, and uses simple language.
`;
    const defaultCustomPrompt = `- Craft engaging and community-friendly posts based on given screen data. 
- Focus on generating specific and thoughtful questions that encourage discussion or helpful responses from the Reddit community. 
- Use casual and approachable language, keeping the posts concise and easy to read. 
- Include context when it adds value to the question but avoid overly personal details.
- Ensure posts are well-structured, starting with a clear title, followed by a detailed body, and end with relevant subreddit recommendations.
`;
    // little hack :D
    (0, react_1.useEffect)(() => {
        if (!contentType || !frequency) {
            const timer = setTimeout(() => {
                var _a, _b, _c, _d, _e, _f;
                setContentType(((_b = (_a = settings.customSettings) === null || _a === void 0 ? void 0 : _a["reddit-auto-posts"]) === null || _b === void 0 ? void 0 : _b.contentType) || "all");
                setFrequency(((_d = (_c = settings.customSettings) === null || _c === void 0 ? void 0 : _c["reddit-auto-posts"]) === null || _d === void 0 ? void 0 : _d.summaryFrequency) ||
                    "daily");
                setEmailTime(((_f = (_e = settings.customSettings) === null || _e === void 0 ? void 0 : _e["reddit-auto-posts"]) === null || _f === void 0 ? void 0 : _f.emailTime) || "11:00");
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [settings, contentType, frequency]);
    const testPipe = () => __awaiter(void 0, void 0, void 0, function* () {
        setLoading(true);
        try {
            const res = yield fetch("/api/pipeline?fromButton=true");
            if (res.status === 500 || res.status === 400) {
                toast({
                    title: "failed to intialize daily log",
                    description: "please check your credentials",
                    variant: "destructive",
                });
            }
            else if (res.status === 200) {
                toast({
                    title: "pipe initalized sucessfully",
                    variant: "default",
                });
            }
            const data = yield res.json();
            if (data.suggestedQuestions) {
                setLastLog(data.suggestedQuestions);
            }
            else {
                setLastLog(JSON.stringify(data, null, 2));
            }
        }
        catch (err) {
            console.error("error testing log:", err);
        }
        finally {
            setLoading(false);
        }
    });
    const isMacOS = () => {
        if (typeof navigator === "undefined")
            return false;
        return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    };
    const handleSave = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        const formData = new FormData(e.target);
        let finalFrequency = frequency;
        if (frequency.startsWith("hourly")) {
            finalFrequency = `hourly:${hourlyRepetance}`;
        }
        const newRedditSettings = {
            interval: parseInt(formData.get("interval")),
            pageSize: parseInt(formData.get("pageSize")),
            summaryFrequency: finalFrequency || formData.get("summaryFrequency"),
            emailAddress: formData.get("emailAddress"),
            emailPassword: formData.get("emailPassword"),
            emailTime: emailTime || formData.get("emailTime"),
            customPrompt: formData.get("customPrompt"),
            dailylogPrompt: formData.get("dailylogPrompt"),
            windowName: formData.get("windowName") || windowName,
            contentType: contentType,
        };
        try {
            yield updateSettings(newRedditSettings, "reddit-auto-posts");
            yield (0, update_pipe_config_1.default)(newRedditSettings);
            toast({
                title: "settings saved",
                description: "your reddit pipe settings have been updated",
            });
        }
        catch (err) {
            toast({
                variant: "destructive",
                title: "error",
                description: "failed to save settings",
            });
        }
    });
    return (<div className="w-full max-w-2xl mx-auto space-y-8 mt-2">
      <form onSubmit={handleSave} className="space-y-4 w-full">
        <div className="space-y-2">
          <label_1.Label htmlFor="path">time interval </label_1.Label>
          <span className="text-[13px] text-muted-foreground">
            &nbsp;&nbsp;we will extract information chunks at this interval to
            create posts
          </span>
          <div className="flex gap-2">
            <input_1.Input id="interval" name="interval" type="number" defaultValue={((_b = (_a = settings.customSettings) === null || _a === void 0 ? void 0 : _a["reddit-auto-posts"]) === null || _b === void 0 ? void 0 : _b.interval) || 60} placeholder="value in seconds" className="flex-1"/>
          </div>
        </div>
        <div className="space-y-3">
          <label_1.Label htmlFor="pageSize">page size </label_1.Label>
          <span className="text-[13px] text-muted-foreground">
            &nbsp;&nbsp;number of records to retrieve per page for extraction,
            considering LLM context limits
          </span>
          <input_1.Input id="pageSize" name="pageSize" type="number" defaultValue={((_d = (_c = settings.customSettings) === null || _c === void 0 ? void 0 : _c["reddit-auto-posts"]) === null || _d === void 0 ? void 0 : _d.pageSize) || 100} placeholder="size of page"/>
        </div>
        <div className="space-y-3">
          <label_1.Label htmlFor="summaryFrequency">summary frequency </label_1.Label>
          <span className="text-[13px] text-muted-foreground">
            &nbsp;&nbsp;email frequency: &apos;daily&apos; at email time or
            &apos;hourly:X&apos;(e.g. &apos;hourly:4&apos; for every 4 hrs).
          </span>
          <select_1.Select name="summaryFrequency" value={frequency} onValueChange={(v) => {
            setFrequency(v);
        }}>
            <select_1.SelectTrigger>
              <select_1.SelectValue placeholder="select the summary frequency type"/>
            </select_1.SelectTrigger>
            <select_1.SelectContent>
              <select_1.SelectItem value="daily">daily</select_1.SelectItem>
              <select_1.SelectItem value="hourly">hourly</select_1.SelectItem>
            </select_1.SelectContent>
          </select_1.Select>
        </div>
        {frequency === "daily" && (<div className="space-y-2">
            <label_1.Label htmlFor="emailTime">email time</label_1.Label>
            <span className="text-[13px] text-muted-foreground">
              &nbsp;&nbsp;time to send daily summary email (used only if summary
              frequency is &apos;daily&apos;)
            </span>
            <input_1.Input id="emailTime" name="emailTime" type="time" value={emailTime} onChange={(e) => {
                setEmailTime(e.target.value);
            }} placeholder="time to send daily summary email (used only if summaryFrequency is 'daily')"/>
          </div>)}
        {frequency.startsWith("hourly") && (<div className="space-y-2">
            <label_1.Label htmlFor="hourlyRepetance">hourly repetance</label_1.Label>
            <span className="text-[13px] text-muted-foreground">
              &nbsp;&nbsp;specify the number of hours for hourly repetition
              (e.g., &apos;4&apos; for every 4 hours)
            </span>
            <input_1.Input id="hourlyRepetance" name="hourlyRepetance" type="number" min="1" max="24" value={hourlyRepetance} placeholder="specify the number of hours for hourly repetition" onChange={(e) => setHourlyRepetance(e.target.value)}/>
          </div>)}
        <div className="space-y-2">
          <label_1.Label htmlFor="emailAddress">email address </label_1.Label>
          <span className="text-[13px] text-muted-foreground">
            &nbsp;&nbsp;email address to send the daily summary to: (eg.
            me@mail.com)
          </span>
          <input_1.Input id="emailAddress" name="emailAddress" type="email" defaultValue={((_f = (_e = settings.customSettings) === null || _e === void 0 ? void 0 : _e["reddit-auto-posts"]) === null || _f === void 0 ? void 0 : _f.emailAddress) || ""} placeholder="email address"/>
        </div>
        <div className="space-y-3 relative items-center">
          <label_1.Label htmlFor="emailPassword">email app specific password </label_1.Label>
          <span className="text-[13px] text-muted-foreground">
            &nbsp;&nbsp;app specific password for your gmail account, you can
            find it
            <a href="https://support.google.com/accounts/answer/185833?hl=en" target="_blank" className="hover:underline text-sky-700">
              {" "}
              here
            </a>
          </span>
          <input_1.Input id="emailPassword" name="emailPassword" type={showKey ? "text" : "password"} autoCorrect="off" autoComplete="off" defaultValue={((_h = (_g = settings.customSettings) === null || _g === void 0 ? void 0 : _g["reddit-auto-posts"]) === null || _h === void 0 ? void 0 : _h.emailPassword) ||
            ""} placeholder="password"/>
          <button_1.Button type="button" variant="ghost" size="icon" className="absolute right-0 top-[25px]" onClick={() => setShowKey(!showKey)}>
            {showKey ? (<lucide_react_2.EyeOff className="h-4 w-4"/>) : (<lucide_react_2.Eye className="h-4 w-4"/>)}
          </button_1.Button>
        </div>
        <div className="space-y-3">
          <label_1.Label htmlFor="contentType">
            <span>content type </span>
            <span className="text-[13px] text-muted-foreground !font-normal">
              &nbsp;&nbsp;type of content to analyze &apos;ocr&apos;,
              &apos;audio&apos;, or &apos;all&apos;. &apos;ocr&apos; is
              recommended due to more content
            </span>
          </label_1.Label>
          <select_1.Select value={contentType} onValueChange={(value) => {
            setContentType(value);
        }}>
            <select_1.SelectTrigger>
              <select_1.SelectValue placeholder="select content type"/>
            </select_1.SelectTrigger>
            <select_1.SelectContent>
              <select_1.SelectItem textValue="all" value="all">
                all
              </select_1.SelectItem>
              <select_1.SelectItem textValue="ocr" value="ocr">
                ocr
              </select_1.SelectItem>
              <select_1.SelectItem textValue="audio" value="audio">
                audio
              </select_1.SelectItem>
              {isMacOS() && <select_1.SelectItem value="ui">ui</select_1.SelectItem>}
            </select_1.SelectContent>
          </select_1.Select>
        </div>
        <div className="space-y-3">
          <label_1.Label htmlFor="windowName">window name</label_1.Label>
          <span className="text-[13px] text-muted-foreground">
            &nbsp;&nbsp;specific window name to filter the screen data, for
            example &apos;gmail&apos;, &apos;john&apos;, &apos;slack&apos; etc.
          </span>
          <sql_autocomplete_input_1.SqlAutocompleteInput id="windowName" name="windowName" type="window" icon={<lucide_react_1.Laptop className="h-4 w-4"/>} defaultValue={(_k = (_j = settings.customSettings) === null || _j === void 0 ? void 0 : _j["reddit-auto-posts"]) === null || _k === void 0 ? void 0 : _k.windowName} onChange={(v) => setWindowName(v)} placeholder="window name to filter the screen data" className="flex-grow"/>
        </div>
        <div className="space-y-3">
          <label_1.Label htmlFor="dailylogPrompt">daily prompt</label_1.Label>
          <textarea id="dailylogPrompt" name="dailylogPrompt" className="w-full text-sm min-h-[30px] p-2 rounded-md border bg-background" defaultValue={((_m = (_l = settings.customSettings) === null || _l === void 0 ? void 0 : _l["reddit-auto-posts"]) === null || _m === void 0 ? void 0 : _m.dailylogPrompt) ||
            `${defaultDailylogPrompt}`} placeholder="additional prompt for the AI assistant that will be used to extract information from the screen data every specified amount of minutes"/>
        </div>
        <div className="space-y-3">
          <label_1.Label htmlFor="customPrompt">custom prompt</label_1.Label>
          <textarea id="customPrompt" name="customPrompt" className="w-full text-sm min-h-[30px] p-2 rounded-md border bg-background" defaultValue={((_p = (_o = settings.customSettings) === null || _o === void 0 ? void 0 : _o["reddit-auto-posts"]) === null || _p === void 0 ? void 0 : _p.customPrompt) ||
            `${defaultCustomPrompt}`} placeholder="additional prompt for the AI assistant that will be used to generate a list of questions to post on reddit based on the logs previously extracted"/>
        </div>
        <button_1.Button type="submit">
          <lucide_react_1.FileCheck className="mr-2 h-4 w-4"/>
          save settings
        </button_1.Button>
      </form>
      <div className="space-y-4 pb-[30px] w-full flex flex-col">
        <tooltip_1.TooltipProvider>
          <tooltip_1.Tooltip>
            <tooltip_1.TooltipTrigger asChild>
              <span>
                <button_1.Button onClick={testPipe} className="w-full border-[1.4px] shadow-sm" variant={"outline"} disabled={loading || aiDisabled || isServerDown || !isAvailable}>
                  {loading ? "generating..." : "generate reddit questions"}
                </button_1.Button>
              </span>
            </tooltip_1.TooltipTrigger>
            {(aiDisabled || isServerDown || !isAvailable) && (<tooltip_1.TooltipContent>
                <p>{`${(aiDisabled && isServerDown) || !isAvailable
                ? "you don't have access of screenpipe-cloud and screenpipe is down!"
                : isServerDown
                    ? "screenpipe is not running..."
                    : aiDisabled
                        ? "you don't have access to screenpipe-cloud :( please consider login"
                        : !isAvailable
                            ? { error }
                            : ""}
                `}</p>
              </tooltip_1.TooltipContent>)}
          </tooltip_1.Tooltip>
        </tooltip_1.TooltipProvider>
        {lastLog && (<div className="p-4 border rounded-lg space-y-2 font-mono text-sm">
            <markdown_1.MemoizedReactMarkdown className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-[35vw] text-sm" remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
                p: ({ children }) => (<p className="mb-2 last:mb-0">{children}</p>),
                a: (_a) => {
                    var { href, children } = _a, props = __rest(_a, ["href", "children"]);
                    const isExternal = (href === null || href === void 0 ? void 0 : href.startsWith("http")) || (href === null || href === void 0 ? void 0 : href.startsWith("https"));
                    return (<a href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} className="break-all text-blue-500 hover:underline" {...props}>
                      {children}
                    </a>);
                },
            }}>
              {lastLog}
            </markdown_1.MemoizedReactMarkdown>
          </div>)}
      </div>
    </div>);
};
exports.default = Pipe;
