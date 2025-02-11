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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExampleSearchCards = ExampleSearchCards;
const react_1 = __importStar(require("react"));
const card_1 = require("@/components/ui/card");
const lucide_react_1 = require("lucide-react");
const badge_1 = require("./ui/badge");
const tooltip_1 = require("./ui/tooltip");
const use_health_check_1 = require("@/lib/hooks/use-health-check");
const use_settings_1 = require("@/lib/hooks/use-settings");
function ExampleSearchCards({ onSelect }) {
    var _a;
    const [exampleSearches, setExampleSearches] = (0, react_1.useState)([]);
    const { health } = (0, use_health_check_1.useHealthCheck)();
    const { settings } = (0, use_settings_1.useSettings)();
    (0, react_1.useEffect)(() => {
        setExampleSearches([
            {
                title: "summarize last hour meeting",
                contentType: "audio",
                limit: 120,
                minLength: 10,
                startDate: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
            },
            {
                title: "summarize my mails",
                contentType: "ocr",
                windowName: "gmail",
                limit: 25,
                minLength: 50,
                startDate: new Date(new Date().setHours(0, 0, 0, 0)), // since midnight local time
            },
            {
                title: "time spent last hour",
                contentType: "ocr",
                limit: 25,
                minLength: 50,
                startDate: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
            },
        ]);
    }, []);
    const getIcon = (title) => {
        switch (title) {
            case "summarize last hour meeting":
                return <lucide_react_1.Search className="mr-2 h-4 w-4"/>;
            case "summarize my mails":
                return <lucide_react_1.Mail className="mr-2 h-4 w-4"/>;
            case "time spent last hour":
                return <lucide_react_1.Clock className="mr-2 h-4 w-4"/>;
            default:
                return <lucide_react_1.Search className="mr-2 h-4 w-4"/>; // default icon
        }
    };
    const isHealthError = !health || (health === null || health === void 0 ? void 0 : health.status) === "error";
    const isAiDisabled = !((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token) && settings.aiProviderType === "screenpipe-cloud";
    return (<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
      {exampleSearches.map((example, index) => (<tooltip_1.TooltipProvider key={index}>
          <tooltip_1.Tooltip>
            <tooltip_1.TooltipTrigger asChild>
              <div className={`relative group h-[150px] ${(isHealthError || isAiDisabled) ? "opacity-50 cursor-not-allowed" : ""}`}>
                <div className="absolute inset-0 rounded-lg transition-all duration-300 ease-out group-hover:before:opacity-100 group-hover:before:scale-100 before:absolute before:inset-0 before:rounded-lg before:border-2 before:border-black dark:before:border-white before:opacity-0 before:scale-95 group-hover:before:opacity-100 group-hover:before:scale-100 before:transition-all before:duration-300 before:ease-out"/>
                <card_1.Card className={`cursor-pointer relative bg-white dark:bg-gray-800 z-10 h-full transition-transform duration-300 ease-out ${isHealthError ? "" : "group-hover:scale-[0.98]"}`} onClick={() => !isHealthError && onSelect(example)}>
                  <card_1.CardContent className="p-3 flex flex-col h-full">
                    <div className="flex items-center mb-1">
                      {getIcon(example.title)}
                      <h3 className="text-sm font-semibold">{example.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {example.contentType && (<badge_1.Badge>{example.contentType}</badge_1.Badge>)}
                      {example.windowName && (<badge_1.Badge>window: {example.windowName}</badge_1.Badge>)}
                      {example.appName && <badge_1.Badge>app: {example.appName}</badge_1.Badge>}
                      {example.limit && <badge_1.Badge>limit: {example.limit}</badge_1.Badge>}
                      {example.minLength && (<badge_1.Badge>min: {example.minLength}</badge_1.Badge>)}
                      {example.startDate && (<badge_1.Badge>
                          start: {example.startDate.toLocaleString()}
                        </badge_1.Badge>)}
                    </div>
                  </card_1.CardContent>
                </card_1.Card>
              </div>
            </tooltip_1.TooltipTrigger>
            {(isHealthError || isAiDisabled) && (<tooltip_1.TooltipContent>
                <p>
                  {(isAiDisabled && isHealthError) ? (<>
                      <lucide_react_1.AlertCircle className="mr-1 h-4 w-4 text-red-500 inline"/>
                      you don't have access to screenpipe-cloud, <br /> and screenpipe backend is not running!
                    </>) : isHealthError ? (<>
                      <lucide_react_1.AlertCircle className="mr-1 h-4 w-4 text-red-500 inline"/>
                      screenpipe is not running. examples are disabled!
                    </>) : isAiDisabled ? (<>
                      <lucide_react_1.AlertCircle className="mr-1 h-4 w-4 text-red-500 inline"/>
                      you don't have access to screenpipe-cloud :( <br /> please consider login!
                    </>) : ("")}
                </p>
              </tooltip_1.TooltipContent>)}
          </tooltip_1.Tooltip>
        </tooltip_1.TooltipProvider>))}
    </div>);
}
