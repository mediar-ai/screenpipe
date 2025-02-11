"use strict";
// "use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SearchPage;
const page_1 = __importDefault(require("@/components/page"));
function SearchPage() {
    return (<div className="flex flex-col gap-2 items-center justify-center h-full mt-4">
      <p className="text-xl font-bold">where pixels become magic</p>
      <page_1.default />
    </div>);
}
