"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPipeForm = void 0;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const lucide_react_1 = require("lucide-react");
const AddPipeForm = ({ onAddPipe, onLoadFromLocalFolder, isHealthy, }) => {
    const [newRepoUrl, setNewRepoUrl] = (0, react_1.useState)('');
    return (<div className="border rounded-lg p-4 space-y-3 w-[50%] mx-auto">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input_1.Input type="url" placeholder={!isHealthy
            ? 'screenpipe not running...'
            : 'enter github url or local path'} value={newRepoUrl} onChange={(e) => setNewRepoUrl(e.target.value)} autoCorrect="off" autoComplete="off" disabled={!isHealthy}/>
        </div>
        <button_1.Button onClick={() => onAddPipe(newRepoUrl)} disabled={!newRepoUrl || !isHealthy} size="icon" className="h-10 w-10">
          <lucide_react_1.Plus className="h-4 w-4"/>
        </button_1.Button>
        <button_1.Button onClick={() => onLoadFromLocalFolder(setNewRepoUrl)} variant="outline" size="icon" className="h-10 w-10" disabled={!isHealthy}>
          <lucide_react_1.FolderOpen className="h-4 w-4"/>
        </button_1.Button>
      </div>
      <div className="text-sm text-muted-foreground">
        <a href="https://docs.screenpi.pe/docs/plugins" target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
          <lucide_react_1.Puzzle className="h-3 w-3"/>
          learn how to create your own pipe
        </a>
      </div>
    </div>);
};
exports.AddPipeForm = AddPipeForm;
