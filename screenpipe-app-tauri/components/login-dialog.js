"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLoginCheck = exports.LoginDialog = void 0;
const button_1 = require("@/components/ui/button");
const dialog_1 = require("@/components/ui/dialog");
const lucide_react_1 = require("lucide-react");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const react_1 = require("react");
const LoginDialog = ({ open, onOpenChange }) => {
    return (<dialog_1.Dialog open={open} onOpenChange={onOpenChange}>
      <dialog_1.DialogContent>
        <dialog_1.DialogHeader>
          <dialog_1.DialogTitle>login required</dialog_1.DialogTitle>
          <dialog_1.DialogDescription>
            please login to continue. you will be redirected to screenpi.pe
          </dialog_1.DialogDescription>
        </dialog_1.DialogHeader>
        <div className='flex justify-end'>
          <button_1.Button variant='default' onClick={() => {
            (0, plugin_shell_1.open)('https://screenpi.pe/login');
            onOpenChange(false);
        }}>
            login <lucide_react_1.ExternalLinkIcon className='w-4 h-4 ml-2'/>
          </button_1.Button>
        </div>
      </dialog_1.DialogContent>
    </dialog_1.Dialog>);
};
exports.LoginDialog = LoginDialog;
const useLoginCheck = () => {
    const [showLoginDialog, setShowLoginDialog] = (0, react_1.useState)(false);
    const checkLogin = (user, showDialog = true) => {
        if (!(user === null || user === void 0 ? void 0 : user.token)) {
            if (showDialog)
                setShowLoginDialog(true);
            return false;
        }
        return true;
    };
    return { showLoginDialog, setShowLoginDialog, checkLogin };
};
exports.useLoginCheck = useLoginCheck;
