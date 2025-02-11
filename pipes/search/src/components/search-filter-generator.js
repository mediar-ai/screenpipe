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
exports.SearchFilterGenerator = SearchFilterGenerator;
const React = __importStar(require("react"));
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const button_1 = require("@/components/ui/button");
const command_1 = require("@/components/ui/command");
const openai_1 = __importDefault(require("openai"));
const use_settings_1 = require("@/lib/hooks/use-settings");
const tooltip_1 = require("@/components/ui/tooltip");
const use_toast_1 = require("@/lib/use-toast");
const sheet_1 = require("./ui/sheet");
const framer_motion_1 = require("framer-motion");
const card_1 = require("@/components/ui/card");
const badge_1 = require("@/components/ui/badge");
const use_sql_autocomplete_1 = require("@/lib/hooks/use-sql-autocomplete");
function SearchFilterGenerator({ onApplyFilters, }) {
    const [open, setOpen] = (0, react_1.useState)(false);
    const [prompt, setPrompt] = (0, react_1.useState)("");
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [isMac, setIsMac] = (0, react_1.useState)(false);
    const [filterVariants, setFilterVariants] = (0, react_1.useState)([]);
    const { settings } = (0, use_settings_1.useSettings)();
    const { items: appStats } = (0, use_sql_autocomplete_1.useSqlAutocomplete)("app");
    const { items: windowStats } = (0, use_sql_autocomplete_1.useSqlAutocomplete)("window");
    React.useEffect(() => {
        setIsMac(navigator.userAgent.includes("Mac"));
    }, []);
    React.useEffect(() => {
        const down = (e) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);
    const handleGenerateFilters = React.useCallback(() => __awaiter(this, void 0, void 0, function* () {
        if (!prompt.trim())
            return;
        setIsLoading(true);
        setFilterVariants([]);
        try {
            // Format top apps and windows for the prompt
            const topApps = appStats
                .slice(0, 5)
                .map((app) => `${app.name} (${app.count} occurrences)`)
                .join(", ");
            const topWindows = windowStats
                .slice(0, 5)
                .map((win) => `${win.name} (${win.count} occurrences)`)
                .join(", ");
            const openai = new openai_1.default({
                apiKey: settings.aiProviderType === "screenpipe-cloud"
                    ? settings.user.token
                    : settings.openaiApiKey,
                baseURL: settings.aiUrl,
                dangerouslyAllowBrowser: true,
            });
            const currentDate = new Date().toISOString();
            const completion = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages: [
                    {
                        role: "system",
                        content: `you are a search filter generator for screenpipe's 24/7 recording context database. your task is to generate exactly 3 search filter variations in json format.

common apps in user's database:
${topApps}

common window titles:
${topWindows}

required output format:
{
  "variants": [
    {
      "title": string,
      "filters": {
        "query": string | undefined,
        "contentType": "all" | "ocr" | "audio",
        "appName": string | undefined,
        "windowName": string | undefined,
        "startDate": ISO date string | undefined,
        "endDate": ISO date string | undefined,
        "limit": number | undefined
      }
    },
    // exactly 2 more variations required
  ]
}

database content types:
1. screen recording (ocr)
   - all visible text from screens (may contain OCR errors)
   - includes app_name, window_name
   - best for: names, emails, urls, code, docs, chat messages
   - IMPORTANT: names/people are found in OCR (chat windows, emails, docs)
   - prefer empty query + app filters (e.g., Slack, Gmail, Chrome)

2. audio recording
   - transcribed speech from mic
   - best for: spoken discussions, meeting topics, action items
   - use query for single keywords only (no spaces!)
   - example: "roadmap" (good), "project timeline" (bad)
   - example: "sprint" (good), "daily standup" (bad)

key guidelines:
- CRITICAL: query must be single word without spaces
- current time is ${currentDate} - use for relative dates
- names/identifiers → use OCR content type (no query, just app filters)
- spoken topics → use audio content type with single-word query
- app/window names must be exact (e.g., "Chrome", "Gmail", "Slack")
- no wildcards or partial matches
- limit should be reasonable (10-200)
- dates must be valid ISO strings

search patterns:
- finding person "john" → use OCR type + apps like Slack/Gmail/Chrome (no query)
- meeting about roadmap → use audio type + query="roadmap"
- code review → use OCR type + app filter for IDE (no query)
- email from sarah → use OCR type + Gmail app filter (no query)
- slack chat → use OCR type + Slack app filter (no query)

generate these 3 variations:
1. broad: 
   - wider time range
   - multiple content types
   - minimal filtering
   - empty query for OCR content
   
2. focused:
   - specific content type
   - exact app/window names
   - narrower time range
   - single-word query only if audio
   
3. balanced:
   - medium scope
   - optimal filter combination
   - most likely to match user intent
   - remember: single-word queries only

validation:
- must return exactly 3 variations
- query must be single word without spaces
- all dates must be valid ISO strings
- content types must match allowed values
- app/window names should be realistic
- limits should be reasonable numbers

do not include any explanation or additional text in the response - only the json object.`,
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                response_format: { type: "json_object" },
            });
            console.log(completion.choices[0].message.content);
            const { variants } = JSON.parse(completion.choices[0].message.content || "[]");
            if (variants) {
                const now = new Date();
                const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                setFilterVariants(variants.map((filters, i) => ({
                    filters: {
                        query: filters.filters.query || "",
                        contentType: filters.filters.contentType || "all",
                        appName: filters.filters.appName || "",
                        windowName: filters.filters.windowName || "",
                        startDate: filters.filters.startDate
                            ? new Date(filters.filters.startDate).toString() ===
                                "Invalid Date"
                                ? yesterday
                                : new Date(filters.filters.startDate)
                            : undefined,
                        endDate: filters.filters.endDate
                            ? new Date(filters.filters.endDate).toString() ===
                                "Invalid Date"
                                ? now
                                : new Date(filters.filters.endDate)
                            : undefined,
                        limit: filters.filters.limit || 100,
                    },
                    description: `variant ${i + 1}`,
                    title: filters.title || `variant ${i + 1}`,
                })));
            }
        }
        catch (error) {
            console.warn("error generating filters:", error);
            (0, use_toast_1.toast)({
                title: "error",
                description: "failed to generate search filters",
                variant: "destructive",
            });
        }
        finally {
            setIsLoading(false);
        }
    }), [prompt, settings]);
    React.useEffect(() => {
        if (!open)
            return;
        const handleKeyDown = (e) => {
            if (e.key === "Enter" && !isLoading) {
                e.preventDefault();
                handleGenerateFilters();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, isLoading, handleGenerateFilters]);
    return (<>
      <tooltip_1.TooltipProvider>
        <tooltip_1.Tooltip>
          <tooltip_1.TooltipTrigger asChild>
            <button_1.Button variant="outline" size="icon" className="h-8 w-8 relative group" onClick={() => setOpen(true)} disabled={isLoading}>
              <lucide_react_1.Wand2 className={`h-4 w-4 ${isLoading ? "opacity-0" : ""}`}/>
              {isLoading && (<framer_motion_1.motion.div className="absolute inset-0 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <framer_motion_1.motion.div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
            }}/>
                </framer_motion_1.motion.div>)}
              <span className="sr-only">generate filters with ai</span>
              <kbd className="pointer-events-none absolute hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-0 group-hover:opacity-100 right-full mr-2 sm:flex">
                <span className="text-xs">{isMac ? "⌘" : "ctrl"}</span>K
              </kbd>
            </button_1.Button>
          </tooltip_1.TooltipTrigger>
          <tooltip_1.TooltipContent>
            <p>generate filters with ai</p>
          </tooltip_1.TooltipContent>
        </tooltip_1.Tooltip>
      </tooltip_1.TooltipProvider>

      <command_1.CommandDialog open={open} onOpenChange={setOpen}>
        <sheet_1.SheetTitle></sheet_1.SheetTitle>
        <framer_motion_1.motion.div className="flex flex-col items-center justify-center gap-2 p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <div className="flex items-center justify-center gap-2 w-full">
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger>
                  <lucide_react_1.Bot className="h-4 w-4 text-muted-foreground"/>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent side="left">
                  <p className="text-xs">using {settings.aiModel}</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
            <command_1.CommandInput className="w-full max-w-xl" placeholder="describe what you want to search for..." value={prompt} onValueChange={setPrompt} disabled={isLoading}/>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              enter
            </kbd>
            <span>to generate filters</span>
          </div>
        </framer_motion_1.motion.div>

        {!isLoading && filterVariants.length === 0 && (<div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <lucide_react_1.Search className="h-12 w-12 text-muted-foreground/50"/>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                try examples like:
              </h4>
              <div className="flex flex-wrap gap-2 justify-center">
                <badge_1.Badge variant="secondary" className="cursor-pointer hover:bg-muted" onClick={() => setPrompt("find my zoom meetings from last week")}>
                  zoom meetings from last week
                </badge_1.Badge>
                <badge_1.Badge variant="secondary" className="cursor-pointer hover:bg-muted" onClick={() => setPrompt("what did i discuss with john recently?")}>
                  what did i discuss with john recently?
                </badge_1.Badge>
                <badge_1.Badge variant="secondary" className="cursor-pointer hover:bg-muted" onClick={() => setPrompt("stuff i did on twitter this week")}>
                  stuff i did on twitter this week
                </badge_1.Badge>
              </div>
            </div>
          </div>)}

        {isLoading && (<div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 max-h-[60vh] overflow-y-auto">
            {[1, 2, 3].map((i) => (<card_1.Card key={i} className="relative bg-background border h-32 animate-pulse">
                <card_1.CardContent className="p-3 flex flex-col h-full space-y-3">
                  <div className="flex items-center">
                    <div className="h-4 w-4 rounded bg-muted mr-2"/>
                    <div className="h-4 w-24 bg-muted rounded"/>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map((j) => (<div key={j} className="h-5 w-20 bg-muted rounded-full"/>))}
                  </div>
                </card_1.CardContent>
              </card_1.Card>))}
          </div>)}

        {filterVariants.length > 0 && (<div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 max-h-[60vh] overflow-y-auto">
            {filterVariants.map((variant, index) => (<tooltip_1.TooltipProvider key={index}>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <div className="relative group h-full">
                      <card_1.Card className="cursor-pointer relative bg-background border h-full transition-all duration-300 ease-out hover:scale-[0.98] hover:border-primary" onClick={() => {
                    onApplyFilters(variant.filters);
                    setOpen(false);
                }}>
                        <card_1.CardContent className="p-3 flex flex-col h-full">
                          <div className="flex items-center mb-1">
                            <h3 className="text-sm font-semibold">
                              {variant.title}
                            </h3>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {variant.filters.query && (<badge_1.Badge>query: {variant.filters.query}</badge_1.Badge>)}
                            {variant.filters.contentType && (<badge_1.Badge>{variant.filters.contentType}</badge_1.Badge>)}
                            {variant.filters.appName && (<badge_1.Badge>app: {variant.filters.appName}</badge_1.Badge>)}
                            {variant.filters.windowName && (<badge_1.Badge>
                                window: {variant.filters.windowName}
                              </badge_1.Badge>)}
                            {variant.filters.startDate && (<badge_1.Badge>
                                from:{" "}
                                {variant.filters.startDate.toLocaleDateString()}
                              </badge_1.Badge>)}
                            {variant.filters.limit && (<badge_1.Badge>limit: {variant.filters.limit}</badge_1.Badge>)}
                          </div>
                        </card_1.CardContent>
                      </card_1.Card>
                    </div>
                  </tooltip_1.TooltipTrigger>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>))}
          </div>)}

        <div className="p-4 text-xs text-center text-muted-foreground mt-auto">
          usually only works with openai model - check your ai settings
        </div>
      </command_1.CommandDialog>
    </>);
}
