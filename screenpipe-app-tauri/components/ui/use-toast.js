"use strict";
"use client";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.reducer = void 0;
exports.useToast = useToast;
exports.toast = toast;
// Inspired by react-hot-toast library
const React = __importStar(require("react"));
const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;
const actionTypes = {
    ADD_TOAST: "ADD_TOAST",
    UPDATE_TOAST: "UPDATE_TOAST",
    DISMISS_TOAST: "DISMISS_TOAST",
    REMOVE_TOAST: "REMOVE_TOAST",
};
let count = 0;
function genId() {
    count = (count + 1) % Number.MAX_SAFE_INTEGER;
    return count.toString();
}
const toastTimeouts = new Map();
const addToRemoveQueue = (toastId) => {
    if (toastTimeouts.has(toastId)) {
        return;
    }
    const timeout = setTimeout(() => {
        toastTimeouts.delete(toastId);
        dispatch({
            type: "REMOVE_TOAST",
            toastId: toastId,
        });
    }, TOAST_REMOVE_DELAY);
    toastTimeouts.set(toastId, timeout);
};
const reducer = (state, action) => {
    switch (action.type) {
        case "ADD_TOAST":
            return Object.assign(Object.assign({}, state), { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) });
        case "UPDATE_TOAST":
            return Object.assign(Object.assign({}, state), { toasts: state.toasts.map((t) => t.id === action.toast.id ? Object.assign(Object.assign({}, t), action.toast) : t) });
        case "DISMISS_TOAST": {
            const { toastId } = action;
            // ! Side effects ! - This could be extracted into a dismissToast() action,
            // but I'll keep it here for simplicity
            if (toastId) {
                addToRemoveQueue(toastId);
            }
            else {
                state.toasts.forEach((toast) => {
                    addToRemoveQueue(toast.id);
                });
            }
            return Object.assign(Object.assign({}, state), { toasts: state.toasts.map((t) => t.id === toastId || toastId === undefined
                    ? Object.assign(Object.assign({}, t), { open: false }) : t) });
        }
        case "REMOVE_TOAST":
            if (action.toastId === undefined) {
                return Object.assign(Object.assign({}, state), { toasts: [] });
            }
            return Object.assign(Object.assign({}, state), { toasts: state.toasts.filter((t) => t.id !== action.toastId) });
    }
};
exports.reducer = reducer;
const listeners = [];
let memoryState = { toasts: [] };
function dispatch(action) {
    memoryState = (0, exports.reducer)(memoryState, action);
    listeners.forEach((listener) => {
        listener(memoryState);
    });
}
function toast(_a) {
    var props = __rest(_a, []);
    const id = genId();
    const update = (props) => dispatch({
        type: "UPDATE_TOAST",
        toast: Object.assign(Object.assign({}, props), { id }),
    });
    const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });
    dispatch({
        type: "ADD_TOAST",
        toast: Object.assign(Object.assign({}, props), { id, open: true, onOpenChange: (open) => {
                if (!open)
                    dismiss();
            } }),
    });
    return {
        id: id,
        dismiss,
        update,
    };
}
function useToast() {
    const [state, setState] = React.useState(memoryState);
    React.useEffect(() => {
        listeners.push(setState);
        return () => {
            const index = listeners.indexOf(setState);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }, [state]);
    return Object.assign(Object.assign({}, state), { toast, dismiss: (toastId) => dispatch({ type: "DISMISS_TOAST", toastId }) });
}
