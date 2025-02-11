"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStatusDialog = void 0;
const zustand_1 = require("zustand");
exports.useStatusDialog = (0, zustand_1.create)((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
