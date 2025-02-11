"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
const header_1 = __importDefault(require("@/components/header"));
const pipe_1 = __importDefault(require("@/components/pipe"));
function Home() {
    return (<main className="flex flex-col justify-center items-center">
      <header_1.default />
      <pipe_1.default />
    </main>);
}
