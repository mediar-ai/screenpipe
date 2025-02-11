"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSettingsDialog = void 0;
const zustand_1 = require("zustand");
exports.useSettingsDialog = (0, zustand_1.create)((set) => ({
    isOpen: false,
    setIsOpen: (open) => set({ isOpen: open }),
}));
