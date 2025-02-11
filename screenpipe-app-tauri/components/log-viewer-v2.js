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
const event_1 = require("@tauri-apps/api/event");
const utils_1 = require("@/lib/utils");
const ansi_to_html_1 = __importDefault(require("ansi-to-html"));
const localforage_1 = __importDefault(require("localforage"));
const button_1 = require("./ui/button"); // import Button component
const convert = new ansi_to_html_1.default({ newline: true });
const LogViewer = ({ className }) => {
    const [logs, setLogs] = (0, react_1.useState)([]);
    const logContainerRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const initLogs = () => __awaiter(void 0, void 0, void 0, function* () {
            // load logs from localforage
            const storedLogs = yield localforage_1.default.getItem("sidecar_logs");
            if (storedLogs) {
                setLogs(storedLogs);
            }
        });
        initLogs();
        const unlisten = (0, event_1.listen)("sidecar_log", (event) => {
            setLogs((prevLogs) => {
                const newLogs = [...prevLogs, event.payload].slice(-100);
                localforage_1.default.setItem("sidecar_logs", newLogs);
                return newLogs;
            });
        });
        return () => {
            unlisten.then((f) => f());
        };
    }, []);
    // function to clear logs
    const clearLogs = () => __awaiter(void 0, void 0, void 0, function* () {
        yield localforage_1.default.removeItem("sidecar_logs");
        setLogs([]);
    });
    (0, react_1.useEffect)(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);
    const htmlLogs = logs.map((log) => convert.toHtml(log));
    return (<div className="flex flex-col py-2">
      <button_1.Button onClick={clearLogs} className="mb-2 self-end" variant="outline" size="sm">
        clear logs
      </button_1.Button>
      <div ref={logContainerRef} className={(0, utils_1.cn)("h-64 overflow-y-auto bg-black p-2 font-mono text-sm text-white", "whitespace-pre-wrap break-words", className)}>
        {htmlLogs.map((log, index) => (<div key={index} dangerouslySetInnerHTML={{ __html: log }} className="leading-5"/>))}
      </div>
    </div>);
};
exports.default = LogViewer;
