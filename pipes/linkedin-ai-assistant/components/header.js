"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Header;
const image_1 = __importDefault(require("next/image"));
function Header() {
    return (<div className="flex flex-col justify-center items-center mt-6">
      <image_1.default className="w-24 h-24" src="/128x128.png" alt="screenpipe-logo" width={96} height={96} priority/>
      <h1 className="font-bold text-center text-2xl">screenpipe</h1>
    </div>);
}
