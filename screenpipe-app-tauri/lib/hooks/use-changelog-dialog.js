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
exports.useChangelogDialog = exports.ChangelogDialogProvider = void 0;
const react_1 = __importStar(require("react"));
const localforage_1 = __importDefault(require("localforage"));
const use_app_version_1 = require("./use-app-version");
const ChangelogDialogContext = (0, react_1.createContext)(undefined);
const ChangelogDialogProvider = ({ children, }) => {
    const [showChangelogDialog, setShowChangelogDialog] = (0, react_1.useState)(false);
    const version = (0, use_app_version_1.useAppVersion)();
    (0, react_1.useEffect)(() => {
        const checkChangelogStatus = () => __awaiter(void 0, void 0, void 0, function* () {
            const versionSeen = yield localforage_1.default.getItem("versionSeen");
            if (version && (!versionSeen || versionSeen !== version)) {
                setShowChangelogDialog(true);
                yield localforage_1.default.setItem("versionSeen", version);
            }
        });
        checkChangelogStatus();
    }, [version]);
    return (<ChangelogDialogContext.Provider value={{ showChangelogDialog, setShowChangelogDialog }}>
      {children}
    </ChangelogDialogContext.Provider>);
};
exports.ChangelogDialogProvider = ChangelogDialogProvider;
const useChangelogDialog = () => {
    const context = (0, react_1.useContext)(ChangelogDialogContext);
    if (context === undefined) {
        throw new Error("useChangelogDialog must be used within a ChangelogDialogProvider");
    }
    return context;
};
exports.useChangelogDialog = useChangelogDialog;
