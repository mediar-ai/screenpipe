"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipeSettings = usePipeSettings;
const react_1 = require("react");
const get_screenpipe_app_settings_1 = require("../actions/get-screenpipe-app-settings");
const DEFAULT_SETTINGS = {
    prompt: `yo, you're my personal data detective! 🕵️‍♂️

rules for the investigation:
- extract names of people i interact with and what we discussed, when i encounter a person, make sure to extract their name like this [[John Doe]] so it's linked in my notes
- identify recurring topics/themes in my convos, use tags or [[Link them]] to my notes
- spot any promises or commitments made (by me or others)
- catch interesting ideas or insights dropped in casual chat
- note emotional vibes and energy levels in conversations
- highlight potential opportunities or connections
- track project progress and blockers mentioned

style rules:
- always put people's names in double square brackets, eg: [[John Doe]] to link to their notes, same for companies, eg: [[Google]], or projects, eg: [[Project X]]
- keep it real and conversational
- use bullet points for clarity
- include relevant timestamps
- group related info together
- max 4 lines per insight
- no corporate speak, keep it human
- for tags use hyphen between words, no spaces, eg: #my-tag not #my tag nor #myTag nor #my_tag

remember: you're analyzing screen ocr text & audio, etc. from my computer, so focus on actual interactions and content!
you'll get chunks of 5 mins roughly of data screen & audio recordings and have to write logs.
this data will be used later for analysis, it must contains valuable insights on what i am doing.
if you do your job well, i'll give you a 🍺 and $1m`,
};
const STORAGE_KEY = "obsidian-settings";
function usePipeSettings() {
    const [settings, setSettings] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    console.log("settings", settings);
    (0, react_1.useEffect)(() => {
        loadSettings();
    }, []);
    const loadSettings = () => __awaiter(this, void 0, void 0, function* () {
        try {
            // Load notion settings from localStorage
            const storedSettings = localStorage.getItem(STORAGE_KEY);
            const notionSettings = storedSettings ? JSON.parse(storedSettings) : {};
            // Load screenpipe app settings
            const screenpipeSettings = yield (0, get_screenpipe_app_settings_1.getScreenpipeAppSettings)();
            // Merge everything together
            setSettings(Object.assign(Object.assign(Object.assign({}, DEFAULT_SETTINGS), notionSettings), { screenpipeAppSettings: screenpipeSettings }));
        }
        catch (error) {
            console.error("failed to load settings:", error);
        }
        finally {
            setLoading(false);
        }
    });
    const updateSettings = (newSettings) => __awaiter(this, void 0, void 0, function* () {
        try {
            // Split settings
            const { screenpipeAppSettings } = newSettings, obsidianSettings = __rest(newSettings, ["screenpipeAppSettings"]);
            const mergedObsidianSettings = Object.assign(Object.assign({}, DEFAULT_SETTINGS), obsidianSettings);
            // Update screenpipe settings if provided
            if (screenpipeAppSettings) {
                yield (0, get_screenpipe_app_settings_1.updateScreenpipeAppSettings)(Object.assign(Object.assign({}, screenpipeAppSettings), { customSettings: Object.assign(Object.assign({}, screenpipeAppSettings.customSettings), { obsidian: mergedObsidianSettings }) }));
            }
            // Update notion settings in localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedObsidianSettings));
            // Update state with everything
            setSettings(Object.assign(Object.assign({}, mergedObsidianSettings), { screenpipeAppSettings: screenpipeAppSettings || (settings === null || settings === void 0 ? void 0 : settings.screenpipeAppSettings) }));
            return true;
        }
        catch (error) {
            console.error("failed to update settings:", error);
            return false;
        }
    });
    return { settings, updateSettings, loading };
}
