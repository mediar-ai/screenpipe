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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BreakingChangesInstructionsDialog = BreakingChangesInstructionsDialog;
const react_1 = __importStar(require("react"));
const dialog_1 = require("@/components/ui/dialog");
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const localforage_1 = __importDefault(require("localforage"));
const use_toast_1 = require("@/components/ui/use-toast");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
function BreakingChangesInstructionsDialog() {
    const { toast } = (0, use_toast_1.useToast)();
    const [open, setOpen] = (0, react_1.useState)(false);
    const [hasShownDialog, setHasShownDialog] = (0, react_1.useState)(false);
    const [hasPipes, setHasPipes] = (0, react_1.useState)(false);
    const [isDeleting, setIsDeleting] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const init = () => __awaiter(this, void 0, void 0, function* () {
            const shown = yield localforage_1.default.getItem("has-shown-delete-pipes-dialog");
            setHasShownDialog(!!shown);
            try {
                const response = yield fetch("http://localhost:3030/pipes/list");
                const data = yield response.json();
                setHasPipes(data.data.length > 0);
            }
            catch (error) {
                console.error("failed to check pipes:", error);
            }
        });
        init();
    }, []);
    (0, react_1.useEffect)(() => {
        if (!hasShownDialog && hasPipes) {
            setOpen(true);
            localforage_1.default.setItem("has-shown-delete-pipes-dialog", true);
        }
    }, [hasShownDialog, hasPipes]);
    const handleResetAllPipes = () => __awaiter(this, void 0, void 0, function* () {
        setIsDeleting(true);
        try {
            const cmd = plugin_shell_1.Command.sidecar("screenpipe", ["pipe", "purge", "-y"]);
            yield cmd.execute();
            toast({
                title: "all pipes deleted",
                description: "you can now reinstall the updated pipes from the store",
            });
            localforage_1.default.setItem("has-shown-delete-pipes-dialog", true);
            setOpen(false);
        }
        catch (error) {
            console.error("failed to reset pipes:", error);
            toast({
                title: "error deleting pipes",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
        finally {
            setIsDeleting(false);
        }
    });
    if (!hasPipes)
        return null;
    return (<dialog_1.Dialog open={open} onOpenChange={() => { }}>
      <dialog_1.DialogContent className="sm:max-w-[525px] [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <dialog_1.DialogHeader>
          <dialog_1.DialogTitle className="flex gap-2 items-center">
            <lucide_react_1.Trash2 className="h-5 w-5"/>
            critical update: new pipe system available
          </dialog_1.DialogTitle>
          <dialog_1.DialogDescription className="space-y-4">
            <p>
              we&apos;ve completely redesigned the pipe system from the ground
              up to make it more powerful and efficient. this is a breaking
              change that requires action from you.
            </p>
            <div className="bg-muted p-4 rounded-md space-y-2">
              <p className="font-medium">required actions:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>delete all your existing pipes using the button below</li>
                <li>
                  reinstall the pipes you need from the updated collection
                </li>
              </ol>
            </div>
            <p className="text-sm text-muted-foreground">
              clicking &apos;delete all pipes&apos; will remove all your
              existing pipes. don&apos;t worry, you can reinstall them from the
              store afterwards.
            </p>
            <p className="text-sm text-muted-foreground">
              face any issues? DM us on{" "}
              <a href="https://discord.gg/dU9EBuw7Uq" target="_blank" className="text-blue-500 hover:underline">
                discord
              </a>
              .
            </p>
          </dialog_1.DialogDescription>
        </dialog_1.DialogHeader>
        <div className="flex justify-end gap-2">
          <button_1.Button onClick={handleResetAllPipes} disabled={isDeleting}>
            {isDeleting ? (<>
                <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                deleting...
              </>) : ("delete all pipes")}
          </button_1.Button>
        </div>
      </dialog_1.DialogContent>
    </dialog_1.Dialog>);
}
