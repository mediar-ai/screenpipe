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
exports.dockVariants = exports.DockIcon = exports.Dock = void 0;
const react_1 = __importStar(require("react"));
const class_variance_authority_1 = require("class-variance-authority");
const framer_motion_1 = require("framer-motion");
const utils_1 = require("@/lib/utils");
const DEFAULT_MAGNIFICATION = 60;
const DEFAULT_DISTANCE = 140;
const dockVariants = (0, class_variance_authority_1.cva)("supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10 mx-auto mt-8 flex h-[58px] w-max gap-2 rounded-2xl border p-2 backdrop-blur-md");
exports.dockVariants = dockVariants;
const Dock = react_1.default.forwardRef((_a, ref) => {
    var { className, children, magnification = DEFAULT_MAGNIFICATION, distance = DEFAULT_DISTANCE, direction = "bottom" } = _a, props = __rest(_a, ["className", "children", "magnification", "distance", "direction"]);
    const mouseX = (0, framer_motion_1.useMotionValue)(Infinity);
    const renderChildren = () => {
        return react_1.default.Children.map(children, (child) => {
            if (react_1.default.isValidElement(child) && child.type === DockIcon) {
                return react_1.default.cloneElement(child, Object.assign(Object.assign({}, child.props), { mouseX: mouseX, magnification: magnification, distance: distance }));
            }
            return child;
        });
    };
    return (<framer_motion_1.motion.div ref={ref} onMouseMove={(e) => mouseX.set(e.pageX)} onMouseLeave={() => mouseX.set(Infinity)} {...props} className={(0, utils_1.cn)(dockVariants({ className }), {
            "items-start": direction === "top",
            "items-center": direction === "middle",
            "items-end": direction === "bottom",
        })}>
        {renderChildren()}
      </framer_motion_1.motion.div>);
});
exports.Dock = Dock;
Dock.displayName = "Dock";
const DockIcon = (_a) => {
    var { size, magnification = DEFAULT_MAGNIFICATION, distance = DEFAULT_DISTANCE, mouseX, className, children } = _a, props = __rest(_a, ["size", "magnification", "distance", "mouseX", "className", "children"]);
    const ref = (0, react_1.useRef)(null);
    const distanceCalc = (0, framer_motion_1.useTransform)(mouseX, (val) => {
        var _a, _b;
        const bounds = (_b = (_a = ref.current) === null || _a === void 0 ? void 0 : _a.getBoundingClientRect()) !== null && _b !== void 0 ? _b : { x: 0, width: 0 };
        return val - bounds.x - bounds.width / 2;
    });
    let widthSync = (0, framer_motion_1.useTransform)(distanceCalc, [-distance, 0, distance], [40, magnification, 40]);
    let width = (0, framer_motion_1.useSpring)(widthSync, {
        mass: 0.1,
        stiffness: 150,
        damping: 12,
    });
    return (<framer_motion_1.motion.div ref={ref} style={{ width }} className={(0, utils_1.cn)("flex aspect-square cursor-pointer items-center justify-center rounded-full", className)} {...props}>
      {children}
    </framer_motion_1.motion.div>);
};
exports.DockIcon = DockIcon;
DockIcon.displayName = "DockIcon";
