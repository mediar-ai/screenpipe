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
const use_settings_1 = require("@/lib/hooks/use-settings");
const use_profiles_1 = require("@/lib/hooks/use-profiles");
const api_1 = require("@/lib/api");
const shortcut_row_1 = __importDefault(require("./shortcut-row"));
const ShortcutSection = () => {
    const [pipes, setPipes] = (0, react_1.useState)([]);
    const { settings } = (0, use_settings_1.useSettings)();
    const { profiles, profileShortcuts } = (0, use_profiles_1.useProfiles)();
    (0, react_1.useEffect)(() => {
        const loadPipes = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const pipeApi = new api_1.PipeApi();
                const pipeList = yield pipeApi.listPipes();
                setPipes(pipeList.map((p) => ({
                    id: p.id,
                    source: p.source,
                    enabled: p.enabled,
                })));
            }
            catch (error) {
                console.error("failed to load pipes:", error);
            }
        });
        loadPipes();
    }, []);
    return (<div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">shortcuts</h1>

      <div className="space-y-6">
        <shortcut_row_1.default type="global" shortcut="showScreenpipeShortcut" title="toggle screenpipe overlay" description="global shortcut to show/hide the main interface" value={settings.showScreenpipeShortcut}/>

        <shortcut_row_1.default type="global" shortcut="startRecordingShortcut" title="start recording" description="global shortcut to start screen recording" value={settings.startRecordingShortcut}/>

        <shortcut_row_1.default type="global" shortcut="stopRecordingShortcut" title="stop recording" description="global shortcut to stop screen recording" value={settings.stopRecordingShortcut}/>

        <shortcut_row_1.default type="global" shortcut="startAudioShortcut" title="start audio recording" description="global shortcut to start audio recording" value={settings.startAudioShortcut}/>

        <shortcut_row_1.default type="global" shortcut="stopAudioShortcut" title="stop audio recording" description="global shortcut to stop audio recording" value={settings.stopAudioShortcut}/>

        {profiles.length > 1 && (<>
            <div className="mt-8 mb-4">
              <h2 className="text-lg font-semibold">profile shortcuts</h2>
              <p className="text-sm text-muted-foreground">
                assign shortcuts to quickly switch between profiles
              </p>
            </div>

            {profiles.map((profile) => (<shortcut_row_1.default key={profile} type="profile" shortcut={`profile_${profile}`} title={`switch to ${profile}`} description={`activate ${profile} profile`} value={profileShortcuts[profile]}/>))}
          </>)}

        {pipes.filter((p) => p.enabled).length > 0 && (<>
            <div className="mt-8 mb-4">
              <h2 className="text-lg font-semibold">pipe shortcuts</h2>
              <p className="text-sm text-muted-foreground">
                assign shortcuts to quickly trigger installed pipes
              </p>
            </div>

            {pipes
                .filter((p) => p.enabled)
                .map((pipe) => (<shortcut_row_1.default key={pipe.id} type="pipe" shortcut={`pipe_${pipe.id}`} title={`trigger ${pipe.id} pipe`} description={`run pipe ${pipe.id}`} value={settings.pipeShortcuts[pipe.id]}/>))}
          </>)}
      </div>
    </div>);
};
exports.default = ShortcutSection;
