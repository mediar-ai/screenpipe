"use strict";
'use client';
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
exports.ChatButton = ChatButton;
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const framer_motion_1 = require("framer-motion");
function ChatButton() {
    const supportLink = "https://wa.me/16507961489";
    const openLink = () => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            console.log('opening link:', supportLink);
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            console.log('is localhost?', isLocalhost, 'hostname:', window.location.hostname);
            const isTauri = typeof window !== 'undefined' && (window.__TAURI__ ||
                window.location.protocol === 'tauri:' ||
                window.location.protocol === 'asset:' ||
                isLocalhost);
            console.log('is tauri?', isTauri, 'protocol:', (_a = window.location) === null || _a === void 0 ? void 0 : _a.protocol);
            if (!isTauri) {
                console.log('using browser');
                window.open(supportLink, '_blank');
                console.log('opened in browser');
            }
        }
        catch (error) {
            console.error('failed to open link:', error);
        }
    });
    // Don't render button in Tauri environment
    const isTauri = typeof window !== 'undefined' && (window.__TAURI__ ||
        window.location.protocol === 'tauri:' ||
        window.location.protocol === 'asset:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');
    if (isTauri) {
        return null;
    }
    return (<framer_motion_1.motion.div className="fixed bottom-2 right-2 z-50" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.05 }}>
      <button_1.Button onClick={openLink} size="sm" className="rounded-full shadow-lg">
        <lucide_react_1.MessageCircle className="mr-1 h-4 w-4"/>
        talk to founder
      </button_1.Button>
    </framer_motion_1.motion.div>);
}
