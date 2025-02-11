"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAppVersion = useAppVersion;
const app_1 = require("@tauri-apps/api/app");
const react_1 = require("react");
function useAppVersion() {
    const [version, setVersion] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        (0, app_1.getVersion)().then(setVersion);
    }, []);
    return version;
}
