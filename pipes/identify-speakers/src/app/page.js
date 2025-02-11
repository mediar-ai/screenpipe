"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = IdentifySpeakersPage;
const identify_speakers_1 = __importDefault(require("@/components/identify-speakers"));
const react_1 = require("react");
function IdentifySpeakersPage() {
    // @ts-ignore
    const [_, setShowIdentifySpeakers] = (0, react_1.useState)(true);
    return (<identify_speakers_1.default showIdentifySpeakers={true} setShowIdentifySpeakers={setShowIdentifySpeakers}/>);
}
