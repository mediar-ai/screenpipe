"use strict";
"use client";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarTrigger = exports.SidebarSeparator = exports.SidebarRail = exports.SidebarProvider = exports.SidebarMenuSubItem = exports.SidebarMenuSubButton = exports.SidebarMenuSub = exports.SidebarMenuSkeleton = exports.SidebarMenuItem = exports.SidebarMenuButton = exports.SidebarMenuBadge = exports.SidebarMenuAction = exports.SidebarMenu = exports.SidebarInset = exports.SidebarInput = exports.SidebarHeader = exports.SidebarGroupLabel = exports.SidebarGroupContent = exports.SidebarGroupAction = exports.SidebarGroup = exports.SidebarFooter = exports.SidebarContent = exports.Sidebar = void 0;
exports.useSidebar = useSidebar;
const React = __importStar(require("react"));
const react_slot_1 = require("@radix-ui/react-slot");
const class_variance_authority_1 = require("class-variance-authority");
const lucide_react_1 = require("lucide-react");
const use_mobile_1 = require("@/lib/hooks/use-mobile");
const utils_1 = require("@/lib/utils");
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const separator_1 = require("@/components/ui/separator");
const sheet_1 = require("@/components/ui/sheet");
const skeleton_1 = require("@/components/ui/skeleton");
const tooltip_1 = require("@/components/ui/tooltip");
const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SidebarContext = React.createContext(null);
function useSidebar() {
    const context = React.useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider.");
    }
    return context;
}
const SidebarProvider = React.forwardRef((_a, ref) => {
    var { defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className, style, children } = _a, props = __rest(_a, ["defaultOpen", "open", "onOpenChange", "className", "style", "children"]);
    const isMobile = (0, use_mobile_1.useIsMobile)();
    const [openMobile, setOpenMobile] = React.useState(false);
    // This is the internal state of the sidebar.
    // We use openProp and setOpenProp for control from outside the component.
    const [_open, _setOpen] = React.useState(defaultOpen);
    const open = openProp !== null && openProp !== void 0 ? openProp : _open;
    const setOpen = React.useCallback((value) => {
        const openState = typeof value === "function" ? value(open) : value;
        if (setOpenProp) {
            setOpenProp(openState);
        }
        else {
            _setOpen(openState);
        }
        // This sets the cookie to keep the sidebar state.
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    }, [setOpenProp, open]);
    // Helper to toggle the sidebar.
    const toggleSidebar = React.useCallback(() => {
        return isMobile
            ? setOpenMobile((open) => !open)
            : setOpen((open) => !open);
    }, [isMobile, setOpen, setOpenMobile]);
    // Adds a keyboard shortcut to toggle the sidebar.
    React.useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
                (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                toggleSidebar();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar]);
    // We add a state so that we can do data-state="expanded" or "collapsed".
    // This makes it easier to style the sidebar with Tailwind classes.
    const state = open ? "expanded" : "collapsed";
    const contextValue = React.useMemo(() => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
    }), [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]);
    return (<SidebarContext.Provider value={contextValue}>
        <tooltip_1.TooltipProvider delayDuration={0}>
          <div style={Object.assign({ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON }, style)} className={(0, utils_1.cn)("group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar", className)} ref={ref} {...props}>
            {children}
          </div>
        </tooltip_1.TooltipProvider>
      </SidebarContext.Provider>);
});
exports.SidebarProvider = SidebarProvider;
SidebarProvider.displayName = "SidebarProvider";
const Sidebar = React.forwardRef((_a, ref) => {
    var { side = "left", variant = "sidebar", collapsible = "offcanvas", className, children } = _a, props = __rest(_a, ["side", "variant", "collapsible", "className", "children"]);
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
    if (collapsible === "none") {
        return (<div className={(0, utils_1.cn)("flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground", className)} ref={ref} {...props}>
          {children}
        </div>);
    }
    if (isMobile) {
        return (<sheet_1.Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <sheet_1.SheetContent data-sidebar="sidebar" data-mobile="true" className="w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden" style={{
                "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            }} side={side}>
            <div className="flex h-full w-full flex-col">{children}</div>
          </sheet_1.SheetContent>
        </sheet_1.Sheet>);
    }
    return (<div ref={ref} className="group peer hidden md:block text-sidebar-foreground" data-state={state} data-collapsible={state === "collapsed" ? collapsible : ""} data-variant={variant} data-side={side}>
        {/* This is what handles the sidebar gap on desktop */}
        <div className={(0, utils_1.cn)("duration-200 relative h-svh w-[--sidebar-width] bg-transparent transition-[width] ease-linear", "group-data-[collapsible=offcanvas]:w-0", "group-data-[side=right]:rotate-180", variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
            : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]")}/>
        <div className={(0, utils_1.cn)("duration-200 fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] ease-linear md:flex", side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]", 
        // Adjust the padding for floating and inset variants.
        variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]"
            : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l", className)} {...props}>
          <div data-sidebar="sidebar" className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow">
            {children}
          </div>
        </div>
      </div>);
});
exports.Sidebar = Sidebar;
Sidebar.displayName = "Sidebar";
const SidebarTrigger = React.forwardRef((_a, ref) => {
    var { className, onClick } = _a, props = __rest(_a, ["className", "onClick"]);
    const { toggleSidebar } = useSidebar();
    return (<button_1.Button ref={ref} data-sidebar="trigger" variant="ghost" size="icon" className={(0, utils_1.cn)("h-7 w-7", className)} onClick={(event) => {
            onClick === null || onClick === void 0 ? void 0 : onClick(event);
            toggleSidebar();
        }} {...props}>
      <lucide_react_1.PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </button_1.Button>);
});
exports.SidebarTrigger = SidebarTrigger;
SidebarTrigger.displayName = "SidebarTrigger";
const SidebarRail = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    const { toggleSidebar } = useSidebar();
    return (<button ref={ref} data-sidebar="rail" aria-label="Toggle Sidebar" tabIndex={-1} onClick={toggleSidebar} title="Toggle Sidebar" className={(0, utils_1.cn)("absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex", "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize", "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize", "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar", "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2", "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2", className)} {...props}/>);
});
exports.SidebarRail = SidebarRail;
SidebarRail.displayName = "SidebarRail";
const SidebarInset = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<main ref={ref} className={(0, utils_1.cn)("relative flex min-h-svh flex-1 flex-col bg-background", "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow", className)} {...props}/>);
});
exports.SidebarInset = SidebarInset;
SidebarInset.displayName = "SidebarInset";
const SidebarInput = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<input_1.Input ref={ref} data-sidebar="input" className={(0, utils_1.cn)("h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", className)} {...props}/>);
});
exports.SidebarInput = SidebarInput;
SidebarInput.displayName = "SidebarInput";
const SidebarHeader = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<div ref={ref} data-sidebar="header" className={(0, utils_1.cn)("flex flex-col gap-2 p-2", className)} {...props}/>);
});
exports.SidebarHeader = SidebarHeader;
SidebarHeader.displayName = "SidebarHeader";
const SidebarFooter = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<div ref={ref} data-sidebar="footer" className={(0, utils_1.cn)("flex flex-col gap-2 p-2", className)} {...props}/>);
});
exports.SidebarFooter = SidebarFooter;
SidebarFooter.displayName = "SidebarFooter";
const SidebarSeparator = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<separator_1.Separator ref={ref} data-sidebar="separator" className={(0, utils_1.cn)("mx-2 w-auto bg-sidebar-border", className)} {...props}/>);
});
exports.SidebarSeparator = SidebarSeparator;
SidebarSeparator.displayName = "SidebarSeparator";
const SidebarContent = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<div ref={ref} data-sidebar="content" className={(0, utils_1.cn)("flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden", className)} {...props}/>);
});
exports.SidebarContent = SidebarContent;
SidebarContent.displayName = "SidebarContent";
const SidebarGroup = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<div ref={ref} data-sidebar="group" className={(0, utils_1.cn)("relative flex w-full min-w-0 flex-col p-2", className)} {...props}/>);
});
exports.SidebarGroup = SidebarGroup;
SidebarGroup.displayName = "SidebarGroup";
const SidebarGroupLabel = React.forwardRef((_a, ref) => {
    var { className, asChild = false } = _a, props = __rest(_a, ["className", "asChild"]);
    const Comp = asChild ? react_slot_1.Slot : "div";
    return (<Comp ref={ref} data-sidebar="group-label" className={(0, utils_1.cn)("duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0", "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0", className)} {...props}/>);
});
exports.SidebarGroupLabel = SidebarGroupLabel;
SidebarGroupLabel.displayName = "SidebarGroupLabel";
const SidebarGroupAction = React.forwardRef((_a, ref) => {
    var { className, asChild = false } = _a, props = __rest(_a, ["className", "asChild"]);
    const Comp = asChild ? react_slot_1.Slot : "button";
    return (<Comp ref={ref} data-sidebar="group-action" className={(0, utils_1.cn)("absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0", 
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:md:hidden", "group-data-[collapsible=icon]:hidden", className)} {...props}/>);
});
exports.SidebarGroupAction = SidebarGroupAction;
SidebarGroupAction.displayName = "SidebarGroupAction";
const SidebarGroupContent = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<div ref={ref} data-sidebar="group-content" className={(0, utils_1.cn)("w-full text-sm", className)} {...props}/>);
});
exports.SidebarGroupContent = SidebarGroupContent;
SidebarGroupContent.displayName = "SidebarGroupContent";
const SidebarMenu = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<ul ref={ref} data-sidebar="menu" className={(0, utils_1.cn)("flex w-full min-w-0 flex-col gap-1", className)} {...props}/>);
});
exports.SidebarMenu = SidebarMenu;
SidebarMenu.displayName = "SidebarMenu";
const SidebarMenuItem = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<li ref={ref} data-sidebar="menu-item" className={(0, utils_1.cn)("group/menu-item relative", className)} {...props}/>);
});
exports.SidebarMenuItem = SidebarMenuItem;
SidebarMenuItem.displayName = "SidebarMenuItem";
const sidebarMenuButtonVariants = (0, class_variance_authority_1.cva)("peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0", {
    variants: {
        variant: {
            default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            outline: "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
        },
        size: {
            default: "h-8 text-sm",
            sm: "h-7 text-xs",
            lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});
const SidebarMenuButton = React.forwardRef((_a, ref) => {
    var { asChild = false, isActive = false, variant = "default", size = "default", tooltip, className } = _a, props = __rest(_a, ["asChild", "isActive", "variant", "size", "tooltip", "className"]);
    const Comp = asChild ? react_slot_1.Slot : "button";
    const { isMobile, state } = useSidebar();
    const button = (<Comp ref={ref} data-sidebar="menu-button" data-size={size} data-active={isActive} className={(0, utils_1.cn)(sidebarMenuButtonVariants({ variant, size }), className)} {...props}/>);
    if (!tooltip) {
        return button;
    }
    if (typeof tooltip === "string") {
        tooltip = {
            children: tooltip,
        };
    }
    return (<tooltip_1.Tooltip>
        <tooltip_1.TooltipTrigger asChild>{button}</tooltip_1.TooltipTrigger>
        <tooltip_1.TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile} {...tooltip}/>
      </tooltip_1.Tooltip>);
});
exports.SidebarMenuButton = SidebarMenuButton;
SidebarMenuButton.displayName = "SidebarMenuButton";
const SidebarMenuAction = React.forwardRef((_a, ref) => {
    var { className, asChild = false, showOnHover = false } = _a, props = __rest(_a, ["className", "asChild", "showOnHover"]);
    const Comp = asChild ? react_slot_1.Slot : "button";
    return (<Comp ref={ref} data-sidebar="menu-action" className={(0, utils_1.cn)("absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0", 
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:md:hidden", "peer-data-[size=sm]/menu-button:top-1", "peer-data-[size=default]/menu-button:top-1.5", "peer-data-[size=lg]/menu-button:top-2.5", "group-data-[collapsible=icon]:hidden", showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0", className)} {...props}/>);
});
exports.SidebarMenuAction = SidebarMenuAction;
SidebarMenuAction.displayName = "SidebarMenuAction";
const SidebarMenuBadge = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<div ref={ref} data-sidebar="menu-badge" className={(0, utils_1.cn)("absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none pointer-events-none", "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground", "peer-data-[size=sm]/menu-button:top-1", "peer-data-[size=default]/menu-button:top-1.5", "peer-data-[size=lg]/menu-button:top-2.5", "group-data-[collapsible=icon]:hidden", className)} {...props}/>);
});
exports.SidebarMenuBadge = SidebarMenuBadge;
SidebarMenuBadge.displayName = "SidebarMenuBadge";
const SidebarMenuSkeleton = React.forwardRef((_a, ref) => {
    var { className, showIcon = false } = _a, props = __rest(_a, ["className", "showIcon"]);
    // Random width between 50 to 90%.
    const width = React.useMemo(() => {
        return `${Math.floor(Math.random() * 40) + 50}%`;
    }, []);
    return (<div ref={ref} data-sidebar="menu-skeleton" className={(0, utils_1.cn)("rounded-md h-8 flex gap-2 px-2 items-center", className)} {...props}>
      {showIcon && (<skeleton_1.Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon"/>)}
      <skeleton_1.Skeleton className="h-4 flex-1 max-w-[--skeleton-width]" data-sidebar="menu-skeleton-text" style={{
            "--skeleton-width": width,
        }}/>
    </div>);
});
exports.SidebarMenuSkeleton = SidebarMenuSkeleton;
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";
const SidebarMenuSub = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<ul ref={ref} data-sidebar="menu-sub" className={(0, utils_1.cn)("mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5", "group-data-[collapsible=icon]:hidden", className)} {...props}/>);
});
exports.SidebarMenuSub = SidebarMenuSub;
SidebarMenuSub.displayName = "SidebarMenuSub";
const SidebarMenuSubItem = React.forwardRef((_a, ref) => {
    var props = __rest(_a, []);
    return <li ref={ref} {...props}/>;
});
exports.SidebarMenuSubItem = SidebarMenuSubItem;
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";
const SidebarMenuSubButton = React.forwardRef((_a, ref) => {
    var { asChild = false, size = "md", isActive, className } = _a, props = __rest(_a, ["asChild", "size", "isActive", "className"]);
    const Comp = asChild ? react_slot_1.Slot : "a";
    return (<Comp ref={ref} data-sidebar="menu-sub-button" data-size={size} data-active={isActive} className={(0, utils_1.cn)("flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground", "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground", size === "sm" && "text-xs", size === "md" && "text-sm", "group-data-[collapsible=icon]:hidden", className)} {...props}/>);
});
exports.SidebarMenuSubButton = SidebarMenuSubButton;
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";
