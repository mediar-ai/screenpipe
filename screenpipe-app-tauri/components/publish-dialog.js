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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublishDialog = void 0;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const label_1 = require("@/components/ui/label");
const textarea_1 = require("@/components/ui/textarea");
const lucide_react_1 = require("lucide-react");
const use_toast_1 = require("./ui/use-toast");
const dialog_1 = require("@/components/ui/dialog");
const tooltip_1 = require("@/components/ui/tooltip");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const PublishDialog = ({ app }) => {
    const [open, setOpen] = (0, react_1.useState)(false);
    const [name, setName] = (0, react_1.useState)((app === null || app === void 0 ? void 0 : app.id) || "");
    const [description, setDescription] = (0, react_1.useState)("");
    const [githubUrl, setGithubUrl] = (0, react_1.useState)("");
    const [price, setPrice] = (0, react_1.useState)("0");
    const [isSubmitting, setIsSubmitting] = (0, react_1.useState)(false);
    const [githubUsername, setGithubUsername] = (0, react_1.useState)("");
    const [issueUrl, setIssueUrl] = (0, react_1.useState)(null);
    const handleSubmit = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            setIsSubmitting(true);
            const host = "https://screenpi.pe";
            // const host = "http://localhost:3001";
            const response = yield fetch(`${host}/api/publish`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name,
                    description,
                    githubUrl,
                    price: parseFloat(price),
                    githubUsername,
                }),
            });
            const data = yield response.json();
            if (!response.ok)
                throw new Error("failed to publish");
            setIssueUrl(data.issueUrl);
            (0, use_toast_1.toast)({
                title: "submission received",
                description: "we'll review your app and add it to the store soon",
            });
        }
        catch (error) {
            console.error("failed to publish:", error);
            (0, use_toast_1.toast)({
                title: "error publishing app",
                description: "please try again later",
                variant: "destructive",
            });
        }
        finally {
            setIsSubmitting(false);
        }
    });
    return (<>
      <tooltip_1.TooltipProvider>
        <tooltip_1.Tooltip>
          <tooltip_1.TooltipTrigger asChild>
            <button_1.Button onClick={() => setOpen(true)} variant="outline" size="icon" className="h-10 w-10">
              <lucide_react_1.Upload className="h-4 w-4"/>
            </button_1.Button>
          </tooltip_1.TooltipTrigger>
          <tooltip_1.TooltipContent>
            <p>publish to store</p>
          </tooltip_1.TooltipContent>
        </tooltip_1.Tooltip>
      </tooltip_1.TooltipProvider>

      <dialog_1.Dialog open={open} onOpenChange={setOpen}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>publish to store</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              submit your app to the screenpipe community store
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>

          {issueUrl ? (<div className="py-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-lg font-medium">
                  submission successful!
                </div>
                <p className="text-sm text-muted-foreground">
                  your app has been submitted for review
                </p>
              </div>
              <button_1.Button className="w-full" onClick={() => (0, plugin_shell_1.open)(issueUrl)}>
                <lucide_react_1.ExternalLink className="mr-2 h-4 w-4"/>
                view submission status
              </button_1.Button>
              <button_1.Button variant="outline" className="w-full" onClick={() => {
                setOpen(false);
                setIssueUrl(null);
                // Reset other form fields
                setName("");
                setDescription("");
                setGithubUrl("");
                setGithubUsername("");
            }}>
                close
              </button_1.Button>
            </div>) : (<>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label_1.Label htmlFor="name">name</label_1.Label>
                  <input_1.Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-awesome-app" autoCorrect="off" autoComplete="off"/>
                </div>
                <div className="grid gap-2">
                  <label_1.Label htmlFor="description">description</label_1.Label>
                  <textarea_1.Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="what does your app do?"/>
                </div>
                <div className="grid gap-2">
                  <label_1.Label htmlFor="github">github repository url</label_1.Label>
                  <div className="flex gap-2">
                    <input_1.Input id="github" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/username/repo" autoCorrect="off" autoComplete="off"/>
                    <button_1.Button variant="outline" onClick={() => (0, plugin_shell_1.open)("https://github.com/new")} size="icon">
                      <lucide_react_1.Plus className="h-4 w-4"/>
                    </button_1.Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label_1.Label htmlFor="price">price (soon)</label_1.Label>
                  <input_1.Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} disabled min="0" step="0.01"/>
                </div>
                <div className="grid gap-2">
                  <label_1.Label htmlFor="github-username">github username</label_1.Label>
                  <input_1.Input id="github-username" value={githubUsername} onChange={(e) => setGithubUsername(e.target.value)} placeholder="your github username" autoCorrect="off" autoComplete="off"/>
                </div>
              </div>
              <dialog_1.DialogFooter>
                <button_1.Button onClick={handleSubmit} disabled={!name ||
                !description ||
                !githubUrl ||
                !githubUsername ||
                isSubmitting}>
                  {isSubmitting ? "submitting..." : "submit for review"}
                </button_1.Button>
              </dialog_1.DialogFooter>
            </>)}
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </>);
};
exports.PublishDialog = PublishDialog;
