"use strict";
"use client";
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
exports.NotionSettings = NotionSettings;
const react_1 = require("react");
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const label_1 = require("@/components/ui/label");
const card_1 = require("@/components/ui/card");
const ollama_models_list_1 = require("./ollama-models-list");
const notion_1 = require("@/lib/notion/notion");
const use_toast_1 = require("@/hooks/use-toast");
const use_pipe_settings_1 = require("@/lib/hooks/use-pipe-settings");
const lucide_react_1 = require("lucide-react");
const update_pipe_config_1 = require("@/lib/actions/update-pipe-config");
const file_suggest_textarea_1 = require("./file-suggest-textarea");
const dropdown_menu_1 = require("@/components/ui/dropdown-menu");
const tooltip_1 = require("./ui/tooltip");
const notion_url_to_input_1 = require("./notion-url-to-input");
const utils_1 = require("@/lib/utils");
function NotionSettings() {
    var _a, _b, _c, _d, _e, _f;
    const { settings, updateSettings, loading } = (0, use_pipe_settings_1.useNotionSettings)();
    const [isSettingUp, setIsSettingUp] = (0, react_1.useState)(false);
    const [testingLog, setTestingLog] = (0, react_1.useState)(false);
    const [testingIntelligence, setTestingIntelligence] = (0, react_1.useState)(false);
    const [localSettings, setLocalSettings] = (0, react_1.useState)({});
    (0, react_1.useEffect)(() => {
        setLocalSettings(Object.assign({}, settings));
    }, [settings]);
    const handleValidate = () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        setIsSettingUp(true);
        try {
            const isValid = yield (0, notion_1.validateCredentials)({
                accessToken: ((_a = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _a === void 0 ? void 0 : _a.accessToken) || "",
                databaseId: ((_b = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _b === void 0 ? void 0 : _b.databaseId) || "",
                intelligenceDbId: ((_c = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _c === void 0 ? void 0 : _c.intelligenceDbId) || "",
            });
            if (!isValid) {
                throw new Error("Invalid credentials");
            }
            yield updateSettings(Object.assign(Object.assign({}, settings), { notion: {
                    accessToken: ((_d = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _d === void 0 ? void 0 : _d.accessToken) || "",
                    databaseId: ((_e = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _e === void 0 ? void 0 : _e.databaseId) || "",
                    intelligenceDbId: ((_f = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _f === void 0 ? void 0 : _f.intelligenceDbId) || "",
                } }));
            (0, use_toast_1.toast)({
                title: "Success",
                description: "Notion connected successfully",
            });
        }
        catch (_error) {
            (0, use_toast_1.toast)({
                title: "Error",
                description: "Failed to connect to Notion, make sure your integration have to databases",
                variant: "destructive",
            });
        }
        finally {
            setIsSettingUp(false);
        }
    });
    const handleSetup = () => __awaiter(this, void 0, void 0, function* () {
        setIsSettingUp(true);
        try {
            const response = yield fetch("/api/setup");
            const credentials = yield response.json();
            if (!response.ok)
                throw new Error(credentials.error);
            const notionCreds = {
                accessToken: credentials.accessToken,
                databaseId: credentials.databaseId,
                intelligenceDbId: credentials.intelligenceDbId,
            };
            const isValid = yield (0, notion_1.validateCredentials)(notionCreds);
            if (!isValid) {
                throw new Error("Invalid credentials");
            }
            console.log(isValid, "done");
            yield updateSettings(Object.assign(Object.assign({}, settings), { notion: notionCreds }));
            (0, use_toast_1.toast)({
                title: "Success",
                description: "Notion connected successfully",
            });
        }
        catch (_error) {
            (0, use_toast_1.toast)({
                title: "Error",
                description: "Failed to connect to Notion",
                variant: "destructive",
            });
        }
        finally {
            setIsSettingUp(false);
        }
    });
    const handleTestLog = () => __awaiter(this, void 0, void 0, function* () {
        setTestingLog(true);
        try {
            const response = yield fetch("/api/log");
            const data = yield response.json();
            console.log(data);
            if (!response.ok)
                throw new Error(data.message);
            (0, use_toast_1.toast)({
                title: "Success",
                description: `Log created successfully. View at: ${data.deepLink}`,
            });
        }
        catch (error) {
            (0, use_toast_1.toast)({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create log",
                variant: "destructive",
            });
        }
        finally {
            setTestingLog(false);
        }
    });
    const handleTestIntelligence = () => __awaiter(this, void 0, void 0, function* () {
        setTestingIntelligence(true);
        try {
            const response = yield fetch("/api/intelligence");
            const data = yield response.json();
            if (!response.ok)
                throw new Error(data.error);
            (0, use_toast_1.toast)({
                title: "Success",
                description: `Intelligence generated with ${data.summary.contacts} contacts`,
            });
        }
        catch (error) {
            (0, use_toast_1.toast)({
                title: "Error",
                description: error instanceof Error
                    ? error.message
                    : "Failed to generate intelligence",
                variant: "destructive",
            });
        }
        finally {
            setTestingIntelligence(false);
        }
    });
    const handleSaveSettings = () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        try {
            yield updateSettings(Object.assign(Object.assign({}, settings), { aiModel: (localSettings === null || localSettings === void 0 ? void 0 : localSettings.aiModel) || (settings === null || settings === void 0 ? void 0 : settings.aiModel), prompt: (localSettings === null || localSettings === void 0 ? void 0 : localSettings.prompt) || (settings === null || settings === void 0 ? void 0 : settings.prompt), interval: (localSettings === null || localSettings === void 0 ? void 0 : localSettings.interval) || (settings === null || settings === void 0 ? void 0 : settings.interval), pageSize: (localSettings === null || localSettings === void 0 ? void 0 : localSettings.pageSize) || (settings === null || settings === void 0 ? void 0 : settings.pageSize), workspace: (localSettings === null || localSettings === void 0 ? void 0 : localSettings.workspace) || (settings === null || settings === void 0 ? void 0 : settings.workspace), notion: {
                    accessToken: ((_a = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _a === void 0 ? void 0 : _a.accessToken) ||
                        ((_b = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _b === void 0 ? void 0 : _b.accessToken) ||
                        "",
                    databaseId: ((_c = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _c === void 0 ? void 0 : _c.databaseId) ||
                        ((_d = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _d === void 0 ? void 0 : _d.databaseId) ||
                        "",
                    intelligenceDbId: ((_e = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _e === void 0 ? void 0 : _e.intelligenceDbId) ||
                        ((_f = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _f === void 0 ? void 0 : _f.intelligenceDbId) ||
                        "",
                } }));
            if ((localSettings === null || localSettings === void 0 ? void 0 : localSettings.interval) !== (settings === null || settings === void 0 ? void 0 : settings.interval)) {
                yield (0, update_pipe_config_1.updatePipeConfig)((localSettings === null || localSettings === void 0 ? void 0 : localSettings.interval) || 5);
            }
            (0, use_toast_1.toast)({
                title: "Success",
                description: "Settings saved successfully",
            });
        }
        catch (error) {
            (0, use_toast_1.toast)({
                title: "Error",
                description: "Failed to save settings",
                variant: "destructive",
            });
        }
    });
    return (<card_1.Card className="w-full max-w-4xl ">
      <card_1.CardHeader>
        <card_1.CardTitle>Notion Settings</card_1.CardTitle>
        <card_1.CardDescription>
          please have chrome install for connecting with notion automatically{" "}
          <br />
          otherwise you can set it up manually, then click on manual button in
          Connect Notion Dropdown menu if you have setup automatically then the
          integration will be {utils_1.INTEGRATION_NAME}
        </card_1.CardDescription>
      </card_1.CardHeader>
      <card_1.CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <label_1.Label>AI Model</label_1.Label>
              <ollama_models_list_1.OllamaModelsList defaultValue={(settings === null || settings === void 0 ? void 0 : settings.aiModel) || ""} onChange={(model) => {
            setLocalSettings(Object.assign(Object.assign({}, localSettings), { aiModel: model }));
        }} disabled={loading}/>
            </div>

            <div className="space-y-2">
              <label_1.Label>Custom Prompt</label_1.Label>
              <file_suggest_textarea_1.FileSuggestTextarea value={(localSettings === null || localSettings === void 0 ? void 0 : localSettings.prompt) || (settings === null || settings === void 0 ? void 0 : settings.prompt) || ""} setValue={(value) => {
            setLocalSettings(Object.assign(Object.assign({}, localSettings), { prompt: value }));
        }} disabled={loading}/>
              <p className="text-xs text-muted-foreground">
                make sure to keep the prompt within llm context window size.
                <br />
                protip: use the @mention feature to link to other pages in your
                notion as context.
                <br />
                <br />
                <strong>
                  (make sure these pages are shared with the integration)
                </strong>
                <br />
                <br />
                if you have connected with notion automatically, then your
                integration name will{" "}
                <span className="text-red-400">{utils_1.INTEGRATION_NAME}</span>
              </p>
            </div>
            <div className="space-y-2">
              <label_1.Label htmlFor="interval">sync interval (minutes)</label_1.Label>
              <input_1.Input id="interval" name="interval" type="number" min="1" step="1" max="60" defaultValue={(settings === null || settings === void 0 ? void 0 : settings.interval) ? settings === null || settings === void 0 ? void 0 : settings.interval : 5} onChange={(e) => {
            setLocalSettings(Object.assign(Object.assign({}, localSettings), { interval: parseInt(e.target.value) }));
        }}/>
            </div>
            <div className="space-y-2">
              <label_1.Label>Workspace Name</label_1.Label>
              <input_1.Input type="text" placeholder="Required" value={(settings === null || settings === void 0 ? void 0 : settings.workspace) || ""} onChange={(e) => updateSettings(Object.assign(Object.assign({}, settings), { workspace: e.target.value }))}/>
              <p className="text-xs text-muted-foreground">
                this is required when you are connecting automatically. you can
                find your workspace name{" "}
                <a href="https://www.notion.so" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                  here
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <label_1.Label htmlFor="pageSize">Page size</label_1.Label>
              <input_1.Input id="pageSize" name="pageSize" type="number" defaultValue={(settings === null || settings === void 0 ? void 0 : settings.pageSize) || 50} onChange={(e) => setLocalSettings(Object.assign(Object.assign({}, localSettings), { pageSize: parseInt(e.target.value) }))}/>
            </div>

            <div className="space-y-2">
              <label_1.Label>
                Access Token{" "}
                <span className="text-xs text-muted-foreground">
                  (found in your integration page)
                </span>
              </label_1.Label>
              <input_1.Input placeholder="Access Token" value={((_a = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _a === void 0 ? void 0 : _a.accessToken) || ""} onChange={(e) => setLocalSettings(Object.assign(Object.assign({}, localSettings), { notion: Object.assign(Object.assign({}, localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion), { accessToken: e.target.value }) }))}/>
              <p className="text-xs text-muted-foreground">
                you can create integration{" "}
                <a href="https://www.notion.so/my-integrations" target="_blank" className="text-blue-400 underline">
                  {" "}
                  here
                </a>{" "}
                if you want to do it manually
              </p>
            </div>
            <div className="space-y-2">
              <notion_url_to_input_1.NotionIdInput label="Database ID" value={((_b = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _b === void 0 ? void 0 : _b.databaseId) || ""} onChange={(value) => setLocalSettings(Object.assign(Object.assign({}, localSettings), { notion: Object.assign(Object.assign({}, localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion), { databaseId: value }) }))} dialogTitle="Extract Database ID from URL"/>
            </div>
            <div className="space-y-2">
              <notion_url_to_input_1.NotionIdInput label="Intelligence ID" value={((_c = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _c === void 0 ? void 0 : _c.intelligenceDbId) || ""} onChange={(value) => setLocalSettings(Object.assign(Object.assign({}, localSettings), { notion: Object.assign(Object.assign({}, localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion), { intelligenceDbId: value }) }))} dialogTitle="Extract Intelligence Database ID from URL"/>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex gap-5 items-center">
                <NotionConnectButton isAutoDisabled={isSettingUp || !(settings === null || settings === void 0 ? void 0 : settings.workspace)} isManualDisabled={isSettingUp ||
            !((_d = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _d === void 0 ? void 0 : _d.accessToken) ||
            !((_e = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _e === void 0 ? void 0 : _e.databaseId) ||
            !((_f = localSettings === null || localSettings === void 0 ? void 0 : localSettings.notion) === null || _f === void 0 ? void 0 : _f.intelligenceDbId)} handleAuto={handleSetup} handleManual={handleValidate} isLoading={isSettingUp}/>
              </div>
              {(settings === null || settings === void 0 ? void 0 : settings.notion) && (<div className="flex gap-2 mt-4">
                  <button_1.Button onClick={handleTestLog} disabled={testingLog} variant="secondary">
                    {testingLog ? (<>
                        <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                        Testing Log
                      </>) : ("Test Log")}
                  </button_1.Button>

                  <button_1.Button onClick={handleTestIntelligence} disabled={testingIntelligence} variant="secondary">
                    {testingIntelligence ? (<>
                        <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                        Analyzing
                      </>) : ("Test Intelligence")}
                  </button_1.Button>
                </div>)}

              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <button_1.Button onClick={handleSaveSettings} disabled={loading} variant="outline">
                      Save Settings
                    </button_1.Button>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>
                      Saves AI model, prompt, interval, and page size settings
                      only
                    </p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
          </div>
        </div>
      </card_1.CardContent>
    </card_1.Card>);
}
const NotionConnectButton = ({ isAutoDisabled, isManualDisabled, isLoading, handleAuto, handleManual, }) => {
    return (<dropdown_menu_1.DropdownMenu>
      <dropdown_menu_1.DropdownMenuTrigger asChild>
        <button_1.Button disabled={isLoading} className="group">
          {isLoading ? "Connecting..." : "Connect Notion"}
          <lucide_react_1.ChevronDown className="group-aria-expanded:rotate-180 transition duration-200"/>
        </button_1.Button>
      </dropdown_menu_1.DropdownMenuTrigger>
      <dropdown_menu_1.DropdownMenuContent>
        <dropdown_menu_1.DropdownMenuItem onClick={handleAuto} disabled={isAutoDisabled}>
          Automatic
        </dropdown_menu_1.DropdownMenuItem>
        <dropdown_menu_1.DropdownMenuItem onClick={handleManual} disabled={isManualDisabled}>
          Manual
        </dropdown_menu_1.DropdownMenuItem>
      </dropdown_menu_1.DropdownMenuContent>
    </dropdown_menu_1.DropdownMenu>);
};
