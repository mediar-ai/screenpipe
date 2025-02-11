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
exports.PipeConfigForm = void 0;
const react_1 = __importStar(require("react"));
const input_1 = require("./ui/input");
const button_1 = require("./ui/button");
const label_1 = require("./ui/label");
const checkbox_1 = require("./ui/checkbox");
const tooltip_1 = require("./ui/tooltip");
const lucide_react_1 = require("lucide-react");
const sql_autocomplete_input_1 = require("./sql-autocomplete-input");
const select_1 = require("./ui/select");
const markdown_1 = require("./markdown");
const codeblock_1 = require("./ui/codeblock");
const remark_gfm_1 = __importDefault(require("remark-gfm"));
const remark_math_1 = __importDefault(require("remark-math"));
const plugin_dialog_1 = require("@tauri-apps/plugin-dialog");
const lucide_react_2 = require("lucide-react");
const PipeConfigForm = ({ pipe, onConfigSave, }) => {
    var _a, _b;
    const [config, setConfig] = (0, react_1.useState)(pipe.installed_config);
    (0, react_1.useEffect)(() => {
        setConfig(pipe.installed_config);
    }, [pipe]);
    const handleInputChange = (name, value) => {
        if (!config)
            return;
        setConfig((prevConfig) => {
            var _a;
            if (!prevConfig)
                return prevConfig;
            return Object.assign(Object.assign({}, prevConfig), { fields: (_a = prevConfig.fields) === null || _a === void 0 ? void 0 : _a.map((field) => field.name === name ? Object.assign(Object.assign({}, field), { value }) : field) });
        });
    };
    const renderConfigInput = (field) => {
        var _a;
        const value = (_a = field === null || field === void 0 ? void 0 : field.value) !== null && _a !== void 0 ? _a : field === null || field === void 0 ? void 0 : field.default;
        const resetToDefault = () => {
            handleInputChange(field.name, field.default);
        };
        switch (field.type) {
            case "boolean":
                return (<div className="flex items-center space-x-2">
            <checkbox_1.Checkbox id={field.name} checked={value} onCheckedChange={(checked) => handleInputChange(field.name, checked)}/>
            <label_1.Label htmlFor={field.name}>{field.name}</label_1.Label>
          </div>);
            case "number":
                return (<div className="flex items-center space-x-2">
            <input_1.Input id={field.name} type="number" value={value} onChange={(e) => handleInputChange(field.name, parseFloat(e.target.value) || 0)} onWheel={(e) => e.preventDefault()} // prevent scrolling down breaking stuff
                 step="any" autoCorrect="off" spellCheck="false"/>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button size="icon" variant="ghost" onClick={resetToDefault} className="h-8 w-8">
                    <lucide_react_1.RefreshCw className="h-4 w-4"/>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>Reset to default</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>);
            case "time":
                return (<div className="flex items-center space-x-2">
            <input_1.Input id={field.name} type="time" value={value} onChange={(e) => handleInputChange(field.name, e.target.value)} autoCorrect="off" spellCheck="false"/>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button size="icon" variant="ghost" onClick={resetToDefault} className="h-8 w-8">
                    <lucide_react_1.RefreshCw className="h-4 w-4"/>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>Reset to default</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>);
            case "window":
                return (<div className="flex items-center space-x-2 w-full">
            <sql_autocomplete_input_1.SqlAutocompleteInput className="w-full" id={field.name} placeholder={`Enter ${field.name}`} value={value} onChange={(newValue) => handleInputChange(field.name, newValue)} type="window" icon={<lucide_react_1.Layout className="h-4 w-4"/>}/>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button size="icon" variant="ghost" onClick={resetToDefault} className="h-8 w-8">
                    <lucide_react_1.RefreshCw className="h-4 w-4"/>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>Reset to default</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>);
            case "app":
                return (<div className="flex items-center space-x-2 w-full">
            <sql_autocomplete_input_1.SqlAutocompleteInput className="w-full" id={field.name} placeholder={`Enter ${field.name}`} value={value} onChange={(newValue) => handleInputChange(field.name, newValue)} type="app" icon={<lucide_react_1.Layout className="h-4 w-4"/>}/>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button size="icon" variant="ghost" onClick={resetToDefault} className="h-8 w-8">
                    <lucide_react_1.RefreshCw className="h-4 w-4"/>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>Reset to default</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>);
            case "contentType":
                return (<div className="space-y-2">
            <div className="flex items-center space-x-2">
              <select_1.Select value={value} onValueChange={(newValue) => handleInputChange(field.name, newValue)}>
                <select_1.SelectTrigger id={field.name} className="relative w-full">
                  <lucide_react_1.Layers className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" size={18}/>
                  <select_1.SelectValue placeholder="content type"/>
                </select_1.SelectTrigger>
                <select_1.SelectContent>
                  <select_1.SelectItem value="all">
                    <span className="pl-6">all</span>
                  </select_1.SelectItem>
                  <select_1.SelectItem value="ocr">
                    <span className="pl-6">ocr</span>
                  </select_1.SelectItem>
                  <select_1.SelectItem value="audio">
                    <span className="pl-6">audio</span>
                  </select_1.SelectItem>
                </select_1.SelectContent>
              </select_1.Select>
              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <button_1.Button size="icon" variant="ghost" onClick={resetToDefault} className="h-8 w-8">
                      <lucide_react_1.RefreshCw className="h-4 w-4"/>
                    </button_1.Button>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>Reset to default</p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
          </div>);
            case "path":
                return (<div className="flex items-center space-x-2">
            <input_1.Input id={field.name} type="text" value={value} onChange={(e) => handleInputChange(field.name, e.target.value)} autoCorrect="off" spellCheck="false"/>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button size="icon" variant="ghost" onClick={() => __awaiter(void 0, void 0, void 0, function* () {
                        try {
                            const selectedPath = yield (0, plugin_dialog_1.open)({
                                directory: true,
                                multiple: false,
                            });
                            if (selectedPath) {
                                handleInputChange(field.name, selectedPath);
                            }
                        }
                        catch (error) {
                            console.error("failed to select path:", error);
                        }
                    })} className="h-8 w-8">
                    <lucide_react_2.FolderOpen className="h-4 w-4"/>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>Select folder</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button size="icon" variant="ghost" onClick={resetToDefault} className="h-8 w-8">
                    <lucide_react_1.RefreshCw className="h-4 w-4"/>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>Reset to default</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>);
            default:
                return (<div className="flex items-center space-x-2">
            <input_1.Input id={field.name} type="text" value={value} onChange={(e) => handleInputChange(field.name, e.target.value)} autoCorrect="off" spellCheck="false"/>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button size="icon" variant="ghost" onClick={resetToDefault} className="h-8 w-8">
                    <lucide_react_1.RefreshCw className="h-4 w-4"/>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>Reset to default</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>);
        }
    };
    return (<div className="space-y-6">
      <h3 className="text-lg font-semibold">pipe configuration</h3>

      <div className="space-y-2">
        <label_1.Label htmlFor="port" className="font-medium">
          port (number)
        </label_1.Label>
        <div className="flex items-center space-x-2">
          <input_1.Input id="port" type="number" value={(_a = config === null || config === void 0 ? void 0 : config.port) !== null && _a !== void 0 ? _a : ""} onChange={(e) => setConfig((prev) => prev
            ? Object.assign(Object.assign({}, prev), { port: parseInt(e.target.value) || 3000 }) : prev)} onWheel={(e) => e.preventDefault()} step="1" min="1" max="65535" autoCorrect="off" spellCheck="false"/>
          <tooltip_1.TooltipProvider>
            <tooltip_1.Tooltip>
              <tooltip_1.TooltipTrigger asChild>
                <button_1.Button size="icon" variant="ghost" onClick={() => setConfig((prev) => (prev ? Object.assign(Object.assign({}, prev), { port: 3000 }) : prev))} className="h-8 w-8">
                  <lucide_react_1.RefreshCw className="h-4 w-4"/>
                </button_1.Button>
              </tooltip_1.TooltipTrigger>
              <tooltip_1.TooltipContent>
                <p>Reset to default (3000)</p>
              </tooltip_1.TooltipContent>
            </tooltip_1.Tooltip>
          </tooltip_1.TooltipProvider>
        </div>
        <markdown_1.MemoizedReactMarkdown className="prose prose-sm break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full" remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
            p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
            },
            a(_a) {
                var { node, href, children } = _a, props = __rest(_a, ["node", "href", "children"]);
                return (<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>);
            },
            code(_a) {
                var { node, className, children } = _a, props = __rest(_a, ["node", "className", "children"]);
                const content = String(children).replace(/\n$/, "");
                const match = /language-(\w+)/.exec(className || "");
                if (!match) {
                    return (<code className="px-1 py-0.5 rounded-sm font-mono text-sm" {...props}>
                    {content}
                  </code>);
                }
                return (<codeblock_1.CodeBlock key={Math.random()} language={(match && match[1]) || ""} value={content} {...props}/>);
            },
        }}>
          Port number for this pipe. If the selected port is already in use when
          starting the pipe, a random available port will be automatically
          assigned.
        </markdown_1.MemoizedReactMarkdown>
      </div>

      {(_b = config === null || config === void 0 ? void 0 : config.fields) === null || _b === void 0 ? void 0 : _b.map((field) => (<div key={field.name} className="space-y-2">
          <label_1.Label htmlFor={field.name} className="font-medium">
            {field.name} ({field.type})
          </label_1.Label>
          {renderConfigInput(field)}
          <markdown_1.MemoizedReactMarkdown className="prose prose-sm break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full" remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
                p({ children }) {
                    return <p className="mb-2 last:mb-0">{children}</p>;
                },
                a(_a) {
                    var { node, href, children } = _a, props = __rest(_a, ["node", "href", "children"]);
                    return (<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                    {children}
                  </a>);
                },
                code(_a) {
                    var { node, className, children } = _a, props = __rest(_a, ["node", "className", "children"]);
                    const content = String(children).replace(/\n$/, "");
                    const match = /language-(\w+)/.exec(className || "");
                    if (!match) {
                        return (<code className="px-1 py-0.5 rounded-sm font-mono text-sm" {...props}>
                      {content}
                    </code>);
                    }
                    return (<codeblock_1.CodeBlock key={Math.random()} language={(match && match[1]) || ""} value={content} {...props}/>);
                },
            }}>
            {field.description}
          </markdown_1.MemoizedReactMarkdown>
        </div>))}
      <button_1.Button type="submit" onClick={() => onConfigSave(config || {})}>
        save configuration
      </button_1.Button>
    </div>);
};
exports.PipeConfigForm = PipeConfigForm;
