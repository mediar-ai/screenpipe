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
const react_1 = __importStar(require("react"));
const event_1 = require("@tauri-apps/api/event");
const codeblock_1 = require("@/components/ui/codeblock");
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const PipeLogger = ({ pipeId }) => {
    const [logs, setLogs] = (0, react_1.useState)([]);
    const [isExpanded, setIsExpanded] = (0, react_1.useState)(false);
    const logEndRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const unlisten = (0, event_1.listen)("log-message", (event) => {
            if (event.payload.pipe_id === pipeId) {
                setLogs((prevLogs) => [
                    ...prevLogs,
                    `[${event.payload.level}] ${event.payload.message}`,
                ]);
            }
        });
        return () => {
            unlisten.then((f) => f());
        };
    }, [pipeId]);
    (0, react_1.useEffect)(() => {
        var _a;
        if (isExpanded) {
            (_a = logEndRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, isExpanded]);
    const toggleExpand = () => {
        setIsExpanded(!isExpanded);
    };
    return (<div className="mt-4 border rounded-md">
      <button_1.Button onClick={toggleExpand} variant="ghost" className="w-full flex justify-between items-center p-2">
        <span>Pipe Logs</span>
        {isExpanded ? <lucide_react_1.ChevronUp size={16}/> : <lucide_react_1.ChevronDown size={16}/>}
      </button_1.Button>
      {isExpanded && (<div className="p-2">
          <codeblock_1.CodeBlock language="log" value={logs.join("\n")}/>
          <div ref={logEndRef}/>
        </div>)}
    </div>);
};
exports.default = PipeLogger;
