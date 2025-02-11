"use strict";
"use client";
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
exports.default = Header;
const button_1 = require("@/components/ui/button");
const settings_1 = require("@/components/settings");
const screenpipe_status_1 = __importDefault(require("@/components/screenpipe-status"));
const react_1 = __importDefault(require("react"));
const dropdown_menu_1 = require("@/components/ui/dropdown-menu");
const lucide_react_1 = require("lucide-react");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const inbox_messages_1 = require("@/components/inbox-messages");
const react_2 = require("react");
const use_onboarding_1 = require("@/lib/hooks/use-onboarding");
const event_1 = require("@tauri-apps/api/event");
const localforage_1 = __importDefault(require("localforage"));
const use_changelog_dialog_1 = require("@/lib/hooks/use-changelog-dialog");
const use_settings_dialog_1 = require("@/lib/hooks/use-settings-dialog");
const popover_1 = require("./ui/popover");
const share_logs_button_1 = require("./share-logs-button");
function Header() {
    const [showInbox, setShowInbox] = (0, react_2.useState)(false);
    const [messages, setMessages] = (0, react_2.useState)([]);
    (0, react_2.useEffect)(() => {
        const loadMessages = () => __awaiter(this, void 0, void 0, function* () {
            const savedMessages = yield localforage_1.default.getItem("inboxMessages");
            if (savedMessages) {
                setMessages(savedMessages);
            }
        });
        loadMessages();
        const unlisten = (0, event_1.listen)("inbox-message-received", (event) => __awaiter(this, void 0, void 0, function* () {
            console.log("inbox-message-received", event);
            const newMessage = {
                id: Date.now().toString(),
                title: event.payload.title,
                body: event.payload.body,
                date: new Date().toISOString(),
                read: false,
                actions: event.payload.actions,
            };
            setMessages((prevMessages) => {
                const updatedMessages = [newMessage, ...prevMessages];
                localforage_1.default.setItem("inboxMessages", updatedMessages);
                return updatedMessages;
            });
        }));
        return () => {
            unlisten.then((unlistenFn) => unlistenFn());
        };
    }, []);
    const handleMessageRead = (id) => __awaiter(this, void 0, void 0, function* () {
        setMessages((prevMessages) => {
            const updatedMessages = prevMessages.map((msg) => msg.id === id ? Object.assign(Object.assign({}, msg), { read: true }) : msg);
            localforage_1.default.setItem("inboxMessages", updatedMessages);
            return updatedMessages;
        });
    });
    const handleMessageDelete = (id) => __awaiter(this, void 0, void 0, function* () {
        setMessages((prevMessages) => {
            const updatedMessages = prevMessages.filter((msg) => msg.id !== id);
            localforage_1.default.setItem("inboxMessages", updatedMessages);
            return updatedMessages;
        });
    });
    const handleClearAll = () => __awaiter(this, void 0, void 0, function* () {
        setMessages([]);
        yield localforage_1.default.setItem("inboxMessages", []);
    });
    const { setShowOnboarding } = (0, use_onboarding_1.useOnboarding)();
    const { setShowChangelogDialog } = (0, use_changelog_dialog_1.useChangelogDialog)();
    const { setIsOpen: setSettingsOpen } = (0, use_settings_dialog_1.useSettingsDialog)();
    const [isFeedbackOpen, setIsFeedbackOpen] = (0, react_2.useState)(false);
    return (<div>
      <div className="relative z-[-1] flex flex-col items-center">
        <div className="relative flex flex-col items-center before:absolute before:h-[300px] before:w-full before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-full after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 sm:before:w-[480px] sm:after:w-[240px] before:lg:h-[360px] gap-4">
          <div className="w-[180px] h-[50px]"/>
        </div>
      </div>
      <div className="flex space-x-4 absolute top-4 right-4">
        <popover_1.Popover open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
          <popover_1.PopoverTrigger asChild>
            <button_1.Button variant="outline">
              <lucide_react_1.Mail className="h-3.5 w-3.5 mr-2"/>
              feedback
            </button_1.Button>
          </popover_1.PopoverTrigger>
          <popover_1.PopoverContent className="w-100 rounded-2xl">
            <share_logs_button_1.ShareLogsButton showShareLink={false} onComplete={() => setIsFeedbackOpen(false)}/>
          </popover_1.PopoverContent>
        </popover_1.Popover>
        <screenpipe_status_1.default className="mt-3 cursor-pointer"/>
        <settings_1.Settings />

        <button_1.Button variant="ghost" size="icon" onClick={() => setShowInbox(!showInbox)} className="cursor-pointer h-8 w-8 p-0">
          <lucide_react_1.Bell className="h-4 w-4"/>
          <span className="sr-only">notifications</span>
        </button_1.Button>
        <dropdown_menu_1.DropdownMenu>
          <dropdown_menu_1.DropdownMenuTrigger asChild>
            <button_1.Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8 p-0">
              <lucide_react_1.User className="h-4 w-4"/>
              <span className="sr-only">user menu</span>
            </button_1.Button>
          </dropdown_menu_1.DropdownMenuTrigger>
          <dropdown_menu_1.DropdownMenuContent className="mr-4" align="end">
            <dropdown_menu_1.DropdownMenuLabel>account</dropdown_menu_1.DropdownMenuLabel>
            <dropdown_menu_1.DropdownMenuSeparator />
            <dropdown_menu_1.DropdownMenuGroup>
              <dropdown_menu_1.DropdownMenuItem onSelect={(e) => {
            e.preventDefault();
            setSettingsOpen(true);
        }} className="cursor-pointer p-1.5">
                <lucide_react_1.Settings2 className="mr-2 h-4 w-4"/>
                <span>settings</span>
              </dropdown_menu_1.DropdownMenuItem>
            </dropdown_menu_1.DropdownMenuGroup>
            <dropdown_menu_1.DropdownMenuSeparator />
            <dropdown_menu_1.DropdownMenuGroup>
              <dropdown_menu_1.DropdownMenuItem className="cursor-pointer" onClick={() => (0, plugin_shell_1.open)("https://docs.screenpi.pe")}>
                <lucide_react_1.Book className="mr-2 h-4 w-4"/>
                <span>check docs</span>
              </dropdown_menu_1.DropdownMenuItem>
              <dropdown_menu_1.DropdownMenuItem className="cursor-pointer" onClick={() => (0, plugin_shell_1.open)("https://twitter.com/intent/tweet?text=here's%20how%20i%20use%20@screen_pipe%20...%20%5Bscreenshot%5D%20an%20awesome%20tool%20for%20...")}>
                <lucide_react_1.Heart className="mr-2 h-4 w-4"/>
                <span>support us</span>
              </dropdown_menu_1.DropdownMenuItem>
            </dropdown_menu_1.DropdownMenuGroup>
            <dropdown_menu_1.DropdownMenuSeparator />
            <dropdown_menu_1.DropdownMenuGroup>
              <dropdown_menu_1.DropdownMenuItem className="cursor-pointer" onClick={() => setShowOnboarding(true)}>
                <lucide_react_1.Play className="mr-2 h-4 w-4"/>
                <span>show onboarding</span>
              </dropdown_menu_1.DropdownMenuItem>
              <dropdown_menu_1.DropdownMenuItem className="cursor-pointer" onClick={() => setShowChangelogDialog(true)}>
                <lucide_react_1.Folder className="mr-2 h-4 w-4"/>
                <span>show changelog</span>
              </dropdown_menu_1.DropdownMenuItem>
            </dropdown_menu_1.DropdownMenuGroup>
          </dropdown_menu_1.DropdownMenuContent>
        </dropdown_menu_1.DropdownMenu>
      </div>
      {showInbox && (<div className="absolute right-4 top-16 z-50 bg-white shadow-lg rounded-lg">
          <inbox_messages_1.InboxMessages messages={messages} onMessageRead={handleMessageRead} onMessageDelete={handleMessageDelete} onClearAll={handleClearAll} onClose={() => setShowInbox(false)}/>
        </div>)}
    </div>);
}
