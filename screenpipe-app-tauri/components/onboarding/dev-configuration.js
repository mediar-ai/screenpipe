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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const lucide_react_1 = require("lucide-react");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const single_codeblock_1 = require("@/components/onboarding/single-codeblock");
const dialog_1 = require("@/components/ui/dialog");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const OnboardingDevConfig = ({ className = "", handlePrevSlide, handleNextSlide, }) => {
    const [instructions, setInstructions] = (0, react_1.useState)([]);
    const devInstructionsData = {
        windows: [
            {
                label: "to start using the screenpipe cli,",
                description: "to use the screenpipe cli, open your cmd with admin privileges and navigate to '%LOCALAPPDATA%\\screenpipe' or run this command to view all setup arguments",
                command: "cd %LOCALAPPDATA%\\screenpipe && ./screenpipe.exe -h   # shows list of arguments",
            },
            {
                label: "starting screenpipe with custom arguments,",
                description: "after reviewing the cli arguments, choose your setup options and start screenpipe with your preference. replace arguments as needed. for example:",
                command: "screenpipe --ignored-windows settings    # ignore the windows named settings",
            },
        ],
        macos: [
            {
                label: "to start using the screenpipe cli,",
                description: "to use the screenpipe cli, open your terminal and navigate to '/Applications/screenpipe.app/Contents/MacOS/' or run this command to view all setup arguments",
                command: "cd /Applications/screenpipe.app/Contents/MacOS/ && screenpipe -h  # shows help",
            },
            {
                label: "starting screenpipe with custom arguments",
                description: "after reviewing the cli arguments, choose your setup options and start screenpipe with your preference. replace arguments as needed. for example:",
                command: "screenpipe --list-monitors     # list monitors",
            },
        ],
        linux: [
            {
                label: "to start using the screenpipe cli,",
                description: "open your terminal and navigate to the installation directory (usually /usr/local/bin) or run this command, this will show all arguments to setup screenpipe as you prefer.",
                command: "cd /usr/local/bin/ && screenpipe -h   # shows list of arguments",
            },
            {
                label: "starting screenpipe with custom arguments",
                description: "after reviewing the cli arguments, choose your setup options and start screenpipe with your preference. replace arguments as needed. for example:",
                command: "screenpipe --ignored-windows kitty    # ignore the windows named kitty",
            },
        ],
    };
    (0, react_1.useEffect)(() => {
        const getOsType = () => {
            const os = (0, plugin_os_1.platform)();
            setInstructions(devInstructionsData[os] || []);
        };
        getOsType();
    }, []);
    return (<div className={`${className} w-full flex justify-center flex-col`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          screenpipe in dev mode
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>
      <div className="mt-8 w-full flex justify-around flex-col">
        <div className="mx-3">
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium prose text-[14px] mr-1">
              by using the cli,
            </span>
            you can manually configure and manage backend processes for advanced
            customization and debugging.
          </p>
        </div>
        {instructions.length > 0 && (<div className="mx-3 mt-1">
            <h1 className="font-medium text-md">
              run the screenpipe backend via cli:
            </h1>
            <ul className="mt-0">
              {instructions.map((instructions, index) => (<li key={index} className="list-disc mt-1">
                  <p className="text-muted-foreground text-sm ml-4">
                    <span className="font-medium text-nowrap text-[14px] mr-1 prose">
                      {instructions.label}
                    </span>
                    {instructions.description}
                  </p>
                  <single_codeblock_1.CodeBlock className="rounded-md mt-2" language="bash" value={instructions.command}/>
                </li>))}
            </ul>
          </div>)}
        <a onClick={() => (0, plugin_shell_1.open)("https://docs.screenpi.pe/")} href="#" className="mt-4 text-muted-foreground text-sm mr-auto ml-auto !text-center hover:underline">
          learn more about screenpipe args &amp; api
          <lucide_react_1.ArrowUpRight className="inline w-4 h-4 ml-1 "/>
        </a>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        note: if you use dev mode, you will have to start and maintain the
        recording process yourself in the terminal
      </p>
      <navigation_1.default className="mt-6" handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide} prevBtnText="previous" nextBtnText="next"/>
    </div>);
};
exports.default = OnboardingDevConfig;
