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
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAiProvider = useAiProvider;
const react_1 = require("react");
function useAiProvider(settings) {
    var _a;
    const [status, setStatus] = (0, react_1.useState)({
        isAvailable: true,
        error: "",
    });
    (0, react_1.useEffect)(() => {
        const checkAiProvider = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                if (!settings.aiProviderType) {
                    setStatus({ isAvailable: false, error: "no ai-provider is set" });
                    return;
                }
                switch (settings.aiProviderType) {
                    case "openai":
                        if (!settings.openaiApiKey) {
                            setStatus({
                                isAvailable: false,
                                error: "openai api key not configured",
                            });
                            return;
                        }
                        break;
                    case "native-ollama":
                        try {
                            const response = yield fetch("http://localhost:11434/api/tags");
                            if (!response.ok)
                                throw new Error();
                        }
                        catch (_b) {
                            setStatus({
                                isAvailable: false,
                                error: "ollama not running on port 11434",
                            });
                            return;
                        }
                        break;
                    case "screenpipe-cloud":
                        if (!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token)) {
                            setStatus({
                                isAvailable: false,
                                error: "login required for screenpipe cloud",
                            });
                            return;
                        }
                        break;
                    case "custom":
                        if (!settings.aiUrl) {
                            setStatus({
                                isAvailable: false,
                                error: "custom ai url not configured",
                            });
                            return;
                        }
                        break;
                }
                setStatus({ isAvailable: true, error: "" });
            }
            catch (error) {
                setStatus({
                    isAvailable: false,
                    error: "failed to check ai provider",
                });
            }
        });
        checkAiProvider();
    }, [
        settings.aiProviderType,
        settings.openaiApiKey,
        settings.aiUrl,
        (_a = settings.user) === null || _a === void 0 ? void 0 : _a.token,
    ]);
    return status;
}
