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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxMessages = InboxMessages;
const react_1 = __importStar(require("react"));
const scroll_area_1 = require("@/components/ui/scroll-area");
const button_1 = require("@/components/ui/button");
const react_virtual_1 = require("@tanstack/react-virtual");
const lucide_react_1 = require("lucide-react");
const card_1 = require("@/components/ui/card");
const dialog_1 = require("@/components/ui/dialog");
const markdown_1 = require("./markdown");
const remark_gfm_1 = __importDefault(require("remark-gfm"));
const remark_math_1 = __importDefault(require("remark-math"));
const date_fns_1 = require("date-fns");
const posthog_js_1 = __importDefault(require("posthog-js"));
const MessageCard = react_1.default.memo(({ message, onDelete, onExpand, expandedMessages, toggleMessageExpansion, handleAction, formatDate, }) => {
    var _a, _b;
    return (<card_1.Card className={`mb-4 w-full ${message.read ? "bg-secondary/50" : "bg-background"}`}>
      <card_1.CardHeader className="flex flex-row items-center justify-between py-2">
        <div className="flex items-center space-x-2 flex-1 mr-2 max-w-[70%]">
          <lucide_react_1.Bot className="h-4 w-4 flex-shrink-0 text-muted-foreground"/>
          <h3 className="text-sm font-semibold truncate" title={message.title}>
            {message.title}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(message.date)}
        </span>
      </card_1.CardHeader>
      <card_1.CardContent className="py-2">
        <div className="w-full overflow-hidden">
          <react_1.Suspense fallback={<div>loading...</div>}>
            <markdown_1.MemoizedReactMarkdown className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-[35vw] text-sm" remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
            p: ({ children }) => (<p className="mb-2 last:mb-0">{children}</p>),
            a: (_a) => {
                var { href, children } = _a, props = __rest(_a, ["href", "children"]);
                const isExternal = (href === null || href === void 0 ? void 0 : href.startsWith("http")) || (href === null || href === void 0 ? void 0 : href.startsWith("https"));
                return (<a href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} className="break-all text-blue-500 hover:underline" {...props}>
                      {children}
                    </a>);
            },
        }}>
              {expandedMessages.has(message.id)
            ? message.body || ""
            : ((_a = message.body) === null || _a === void 0 ? void 0 : _a.length) > 150
                ? `${message.body.slice(0, 150)}...`
                : message.body || ""}
            </markdown_1.MemoizedReactMarkdown>
          </react_1.Suspense>
        </div>
        {message.body && message.body.length > 150 && (<button_1.Button variant="ghost" size="sm" onClick={() => toggleMessageExpansion(message.id)} className="text-xs mt-2">
            {expandedMessages.has(message.id) ? (<>
                <lucide_react_1.ChevronUp className="mr-1 h-4 w-4"/>
                show less
              </>) : (<>
                <lucide_react_1.ChevronDown className="mr-1 h-4 w-4"/>
                show more
              </>)}
          </button_1.Button>)}
      </card_1.CardContent>
      <card_1.CardFooter className="flex justify-end space-x-2 py-2">
        {(_b = message.actions) === null || _b === void 0 ? void 0 : _b.map((action) => (<button_1.Button key={`${message.id}-${action.action}`} variant="outline" size="sm" onClick={() => handleAction(action.action, action.port)} className="text-xs">
            {action.label}
          </button_1.Button>))}
        <button_1.Button variant="ghost" size="sm" onClick={() => onDelete(message.id)} className="text-xs">
          <lucide_react_1.X className="mr-1 h-4 w-4"/>
          dismiss
        </button_1.Button>
        <button_1.Button variant="ghost" size="sm" onClick={() => onExpand(message)} className="text-xs">
          <lucide_react_1.Maximize2 className="mr-1 h-4 w-4"/>
          expand
        </button_1.Button>
      </card_1.CardFooter>
    </card_1.Card>);
});
MessageCard.displayName = "MessageCard";
function InboxMessages({ messages, onMessageRead, onMessageDelete, onClearAll, onClose, }) {
    var _a;
    const [expandedMessages, setExpandedMessages] = (0, react_1.useState)(new Set());
    const [dialogMessage, setDialogMessage] = (0, react_1.useState)(null);
    const [dialogOpen, setDialogOpen] = (0, react_1.useState)(false);
    const inboxRef = (0, react_1.useRef)(null);
    const parentRef = (0, react_1.useRef)(null);
    const unreadMessages = messages.filter((msg) => !msg.read);
    const virtualizer = (0, react_virtual_1.useVirtualizer)({
        count: unreadMessages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 200,
        overscan: 5,
    });
    const handleMarkAllAsRead = (0, react_1.useCallback)(() => {
        messages.forEach((msg) => {
            if (!msg.read) {
                onMessageRead(msg.id);
            }
        });
    }, [messages, onMessageRead]);
    const toggleMessageExpansion = (0, react_1.useCallback)((id) => {
        setExpandedMessages((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            }
            else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);
    const formatDate = (0, react_1.useCallback)((dateString) => {
        const date = new Date(dateString);
        return (0, date_fns_1.format)(date, "MMM d, yyyy 'at' h:mm a");
    }, []);
    const openDialog = (0, react_1.useCallback)((message) => {
        setDialogMessage(message);
        setDialogOpen(true);
        if (!message.read) {
            onMessageRead(message.id);
        }
    }, [onMessageRead]);
    const closeDialog = (0, react_1.useCallback)(() => {
        setDialogOpen(false);
    }, []);
    const handleDeleteAndClose = (0, react_1.useCallback)(() => {
        if (dialogMessage) {
            onMessageDelete(dialogMessage.id);
            closeDialog();
        }
    }, [dialogMessage, onMessageDelete, closeDialog]);
    const handleAction = (0, react_1.useCallback)((actionId, port) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`http://localhost:${port}/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: actionId }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        }
        catch (error) {
            console.error("failed to send action callback:", error);
        }
    }), []);
    (0, react_1.useEffect)(() => {
        posthog_js_1.default.capture("inbox opened");
        function handleClickOutside(event) {
            if (inboxRef.current &&
                !inboxRef.current.contains(event.target)) {
                if (!dialogOpen) {
                    onClose();
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dialogOpen, onClose]);
    return (<div ref={inboxRef}>
      <scroll_area_1.ScrollArea className="w-full max-w-[46vw] overflow-y-auto max-h-[80vh]">
        <card_1.Card className="w-full">
          <card_1.CardHeader className="flex flex-row items-center justify-between">
            <h2 className="text-lg font-semibold">inbox messages</h2>
            {unreadMessages.length > 0 && (<div className="flex space-x-2">
                <button_1.Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="text-xs">
                  <lucide_react_1.CheckSquare className="mr-1 h-4 w-4"/>
                  mark all as read
                </button_1.Button>
                <button_1.Button variant="outline" size="sm" onClick={onClearAll} className="text-xs">
                  <lucide_react_1.X className="mr-1 h-4 w-4"/>
                  clear all
                </button_1.Button>
              </div>)}
          </card_1.CardHeader>
          <card_1.CardContent className="min-h-[200px] w-[45vw]" ref={parentRef}>
            {unreadMessages.length === 0 ? (<div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                no new messages
              </div>) : (<div style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
            }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                const message = unreadMessages[virtualRow.index];
                return (<div key={message.id} style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                    }}>
                      <MessageCard message={message} onDelete={onMessageDelete} onExpand={openDialog} expandedMessages={expandedMessages} toggleMessageExpansion={toggleMessageExpansion} handleAction={handleAction} formatDate={formatDate}/>
                    </div>);
            })}
              </div>)}
          </card_1.CardContent>
        </card_1.Card>
        <dialog_1.Dialog open={dialogOpen} onOpenChange={(open) => {
            if (!open) {
                closeDialog();
            }
        }}>
          <dialog_1.DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
            <dialog_1.DialogHeader>
              <dialog_1.DialogTitle>{dialogMessage === null || dialogMessage === void 0 ? void 0 : dialogMessage.title}</dialog_1.DialogTitle>
            </dialog_1.DialogHeader>
            <div className="mt-4">
              <react_1.Suspense fallback={<div>loading...</div>}>
                <markdown_1.MemoizedReactMarkdown className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0" remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
            p: ({ children }) => (<p className="mb-2 last:mb-0">{children}</p>),
            a: (_a) => {
                var { href, children } = _a, props = __rest(_a, ["href", "children"]);
                return (<a href={href} target="_blank" rel="noopener noreferrer" className="break-all" {...props}>
                        {children}
                      </a>);
            },
        }}>
                  {(dialogMessage === null || dialogMessage === void 0 ? void 0 : dialogMessage.body) || ""}
                </markdown_1.MemoizedReactMarkdown>
              </react_1.Suspense>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              {(_a = dialogMessage === null || dialogMessage === void 0 ? void 0 : dialogMessage.actions) === null || _a === void 0 ? void 0 : _a.map((action) => (<button_1.Button key={`dialog-${dialogMessage.id}-${action.action}`} variant="outline" onClick={() => handleAction(action.action, action.port)}>
                  {action.label}
                </button_1.Button>))}
              <dialog_1.DialogClose asChild>
                <button_1.Button variant="outline" onClick={closeDialog}>
                  close
                </button_1.Button>
              </dialog_1.DialogClose>
              <button_1.Button variant="default" onClick={handleDeleteAndClose}>
                dismiss
              </button_1.Button>
            </div>
          </dialog_1.DialogContent>
        </dialog_1.Dialog>
      </scroll_area_1.ScrollArea>
    </div>);
}
