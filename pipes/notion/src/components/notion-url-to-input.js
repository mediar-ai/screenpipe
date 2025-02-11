"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotionIdInput = NotionIdInput;
const dialog_1 = require("@/components/ui/dialog");
const input_1 = require("@/components/ui/input");
const label_1 = require("@/components/ui/label");
const button_1 = require("@/components/ui/button");
const use_toast_1 = require("@/hooks/use-toast");
const react_1 = require("react");
function NotionIdInput({ label, value, onChange, dialogTitle, }) {
    const [isDialogOpen, setIsDialogOpen] = (0, react_1.useState)(false);
    const extractIdFromUrl = (url) => {
        try {
            const match = url.match(/notion\.so\/(?:[^/]+\/)?([a-zA-Z0-9]{32})/);
            return match ? match[1] : null;
        }
        catch (error) {
            return null;
        }
    };
    const handleUrlSubmit = (url) => {
        const id = extractIdFromUrl(url);
        if (id) {
            onChange(id);
            setIsDialogOpen(false);
        }
        else {
            (0, use_toast_1.toast)({
                title: "Error",
                description: "Invalid Notion URL",
                variant: "destructive",
            });
        }
    };
    return (<div className="space-y-2">
      <label_1.Label>{label}</label_1.Label>
      <div className="flex gap-2">
        <input_1.Input placeholder={label} value={value} onChange={(e) => onChange(e.target.value)}/>
        <button_1.Button variant="outline" onClick={() => setIsDialogOpen(true)}>
          Get ID from URL
        </button_1.Button>
      </div>

      <dialog_1.Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <dialog_1.DialogContent>
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>{dialogTitle}</dialog_1.DialogTitle>
          </dialog_1.DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label_1.Label>Notion Database URL</label_1.Label>
              <input_1.Input placeholder="https://www.notion.so/..." onKeyDown={(e) => {
            if (e.key === "Enter") {
                handleUrlSubmit(e.currentTarget.value);
            }
        }}/>
            </div>
            <button_1.Button className="w-full" onClick={(e) => {
            var _a;
            const input = (_a = e.currentTarget.parentElement) === null || _a === void 0 ? void 0 : _a.querySelector("input");
            if (input)
                handleUrlSubmit(input.value);
        }}>
              Extract ID
            </button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </div>);
}
