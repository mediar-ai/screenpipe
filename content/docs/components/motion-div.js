"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const framer_motion_1 = require("framer-motion");
const MotionDiv = ({ children, delay = 0.3, duration = 0.6 }) => {
    return (<framer_motion_1.motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration }}>
      {children}
    </framer_motion_1.motion.div>);
};
exports.default = MotionDiv;
