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
exports.default = DiskUsage;
const react_1 = __importStar(require("react"));
const badge_1 = require("@/components/ui/badge");
const use_toast_1 = require("@/components/ui/use-toast");
const core_1 = require("@tauri-apps/api/core");
const localforage_1 = __importDefault(require("localforage"));
const skeleton_1 = require("@/components/ui/skeleton");
const accordion_1 = require("@/components/ui/accordion");
const BadgeItem = ({ label, value, description, }) => (<div className="flex flex-row items-center justify-between">
    <div className="flex flex-col !float-left items-start">
      <span className="font-semibold">{label}</span>
      <span className="text-[14px] !font-normal text-muted-foreground">
        {description}
      </span>
    </div>
    <badge_1.Badge variant={"outline"} className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center">
      {value}
    </badge_1.Badge>
  </div>);
const Divider = () => (<div className="flex my-2 justify-center">
    <div className="h-[1px] w-[250px] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
    <div className="h-[1px] w-[250px] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
  </div>);
function DiskUsage() {
    const [diskUsage, setDiskUsage] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const getDisk = () => __awaiter(this, void 0, void 0, function* () {
        setLoading(true);
        try {
            const cachedData = yield localforage_1.default.getItem("diskUsage");
            const now = Date.now();
            const twoDaysInMillis = 2 * 24 * 60 * 60 * 1000;
            if (cachedData && now - cachedData.lastUpdated < twoDaysInMillis) {
                setDiskUsage(cachedData.diskData);
                setLoading(false);
            }
            else {
                const result = yield (0, core_1.invoke)("get_disk_usage");
                yield new Promise((resolve) => {
                    setTimeout(() => resolve(result), 3000);
                });
                yield localforage_1.default.setItem("diskUsage", {
                    diskData: result,
                    lastUpdated: now,
                });
                setDiskUsage(result);
                setLoading(false);
            }
        }
        catch (error) {
            console.error("Failed to fetch disk usage:", error);
            (0, use_toast_1.toast)({
                title: "error",
                description: "failed to fetch disk usage, please try again!",
                variant: "destructive",
            });
        }
    });
    (0, react_1.useEffect)(() => {
        getDisk();
    }, []);
    return (<div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">
        disk usage
        {loading && !diskUsage ? (<span className="text-sm ml-2 !font-normal text-muted-foreground">
            loading...
          </span>) : ("")}
      </h1>
      <div className="flex flex-col items-center justify-center space-y-4">
        {loading && !diskUsage ? (<div className="w-full space-y-4">
            <skeleton_1.Skeleton className="h-[80px] w-[90%] mx-auto"/>
            <skeleton_1.Skeleton className="h-[80px] w-[90%] mx-auto"/>
            <skeleton_1.Skeleton className="h-[200px] w-[90%] mx-auto"/>
          </div>) : ("")}
        {diskUsage && diskUsage.pipes && (<accordion_1.Accordion type="single" collapsible className="w-[90%] border rounded-lg">
            <accordion_1.AccordionItem value="total-pipes-size">
              <accordion_1.AccordionTrigger className="mx-4 h-[80px] hover:no-underline">
                <div className="w-full flex items-center justify-between">
                  <div className="flex flex-col !float-left items-start">
                    <span className="font-semibold">disk used by pipes</span>
                    <span className="text-[14px] !font-normal text-muted-foreground">
                      total space used by installed pipes
                    </span>
                  </div>
                  <badge_1.Badge variant={"outline"} className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.pipes.total_pipes_size}
                  </badge_1.Badge>
                </div>
              </accordion_1.AccordionTrigger>
              <accordion_1.AccordionContent className="w-full">
                {diskUsage.pipes.pipes.map(([name, size], index) => (<div key={index} className="flex items-center justify-between px-1 py-1">
                    <span className="text-base ml-8">{name}</span>
                    <badge_1.Badge variant={"outline"} className="mr-10 min-w-[5.5rem] flex flex-row justify-center">
                      {size}
                    </badge_1.Badge>
                  </div>))}
              </accordion_1.AccordionContent>
            </accordion_1.AccordionItem>
          </accordion_1.Accordion>)}
        {diskUsage && diskUsage.media && (<accordion_1.Accordion type="single" collapsible className="w-[90%] border rounded-lg">
            <accordion_1.AccordionItem value="total-pipes-size">
              <accordion_1.AccordionTrigger className="mx-4 h-[80px] hover:no-underline">
                <div className="w-full flex items-center justify-between">
                  <div className="flex flex-col !float-left items-start">
                    <span className="font-semibold">total data captured</span>
                    <span className="text-[14px] !font-normal text-muted-foreground">
                      amount of data captured by screenpipe over the time
                    </span>
                  </div>
                  <badge_1.Badge variant={"outline"} className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.media.total_media_size}
                  </badge_1.Badge>
                </div>
              </accordion_1.AccordionTrigger>
              <accordion_1.AccordionContent className="w-full">
                <div key={"video"} className="flex items-center justify-between px-1 py-1">
                  <span className="text-base ml-8">video data</span>
                  <badge_1.Badge variant={"outline"} className="mr-10 min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.media.videos_size}
                  </badge_1.Badge>
                </div>
                <div key={"audio"} className="flex items-center justify-between px-1 py-1">
                  <span className="text-base ml-8">audio data</span>
                  <badge_1.Badge variant={"outline"} className="mr-10 min-w-[5.5rem] flex flex-row justify-center ">
                    {diskUsage.media.audios_size}
                  </badge_1.Badge>
                </div>
              </accordion_1.AccordionContent>
            </accordion_1.AccordionItem>
          </accordion_1.Accordion>)}
        {diskUsage && diskUsage.total_data_size && diskUsage.avaiable_space && (<div className="w-[90%] border rounded-lg p-8">
            <div className="w-full space-y-6">
              <BadgeItem label="screenpipe cache size" description="disk space used for models, frames..." value={diskUsage.total_cache_size}/>
              <Divider />
              <BadgeItem label="disk space used by screenpipe" description="total disk space utilized by the screenpipe application" value={diskUsage.total_data_size}/>
              <Divider />
              <BadgeItem label="available disk space" description="remaining free disk space on your device" value={diskUsage.avaiable_space}/>
            </div>
          </div>)}
      </div>
    </div>);
}
