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
exports.useOnboarding = exports.OnboardingProvider = void 0;
const react_1 = __importStar(require("react"));
const use_settings_1 = require("./use-settings");
const localforage_1 = __importDefault(require("localforage"));
const OnboardingContext = (0, react_1.createContext)(undefined);
const OnboardingProvider = ({ children, }) => {
    const [showOnboarding, setShowOnboarding] = (0, react_1.useState)(false);
    const { settings } = (0, use_settings_1.useSettings)();
    (0, react_1.useEffect)(() => {
        const checkFirstTimeUser = () => __awaiter(void 0, void 0, void 0, function* () {
            // settings unreliable here ... race condition
            const showOnboarding = yield localforage_1.default.getItem("showOnboarding");
            if (showOnboarding === null || showOnboarding === undefined || showOnboarding === true) {
                setShowOnboarding(true);
                localforage_1.default.setItem("showOnboarding", false);
            }
        });
        checkFirstTimeUser();
    }, [settings]);
    (0, react_1.useEffect)(() => {
        localforage_1.default.setItem("showOnboarding", showOnboarding);
    }, [showOnboarding]);
    return (<OnboardingContext.Provider value={{ showOnboarding, setShowOnboarding }}>
      {children}
    </OnboardingContext.Provider>);
};
exports.OnboardingProvider = OnboardingProvider;
const useOnboarding = () => {
    const context = (0, react_1.useContext)(OnboardingContext);
    if (context === undefined) {
        throw new Error("useOnboarding must be used within an OnboardingProvider");
    }
    return context;
};
exports.useOnboarding = useOnboarding;
