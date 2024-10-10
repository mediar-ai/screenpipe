import React from "react";
import { ArrowUpRight } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { CodeBlock } from "@/components/onboarding/single-codeblock"
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";

interface OnboardingDevConfigProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const getDebuggingCommands = (os: string | null) => {
  let cliInstructions = "";

  if (os === "windows") {
    cliInstructions =
      "# 1. Open Command Prompt as admin (search for 'cmd' in the Start menu, right click, 'Run as admin')\n# 2. Navigate to: %LOCALAPPDATA%\\screenpipe\\\n#    Type: cd %LOCALAPPDATA%\\screenpipe\n";
  } else if (os === "macos") {
    cliInstructions =
      "# 1. Open Terminal\n# 2. Navigate to: /Applications/screenpipe.app/Contents/MacOS/\n#    Type: cd /Applications/screenpipe.app/Contents/MacOS/\n";
  } else if (os === "linux") {
    cliInstructions =
      "# 1. Open Terminal\n# 2. Navigate to: /usr/local/bin/\n#    Type: cd /usr/local/bin/\n";
  } else {
    cliInstructions =
      "# OS not recognized. Please check the documentation for your specific operating system.\n";
  }

  const baseInstructions = `# First, view the Screenpipe CLI arguments:
${cliInstructions}
# 3. Run: screenpipe -h
# 4. Choose your preferred setup and start Screenpipe:
#    (Replace [YOUR_ARGS] with your chosen arguments)
#    Example: screenpipe --fps 1 `;

  const dataDir =
    os === "windows" ? "%USERPROFILE%\\.screenpipe" : "$HOME/.screenpipe";

  const logPath =
    os === "windows"
      ? "%USERPROFILE%\\.screenpipe\\screenpipe.log"
      : "$HOME/.screenpipe/screenpipe.log";

  const dbPath =
    os === "windows"
      ? "%USERPROFILE%\\.screenpipe\\db.sqlite"
      : "$HOME/.screenpipe/db.sqlite";

  const baseCommand =
    baseInstructions +
    dataDir +
    (os === "windows"
      ? "\n\n# We highly recommend adding --ocr-engine windows-native to your command.\n# This will use a very experimental but powerful engine to extract text from your screen instead of the default one.\n# Example: screenpipe --data-dir %USERPROFILE%\\.screenpipe --ocr-engine windows-native\n"
      : "") +
    "\n\n# 5. If you've already started Screenpipe, try these debugging commands:\n";

  if (os === "windows") {
    return (
      baseCommand +
      `# Stream the log:
type "${logPath}"

# Scroll the logs:
more "${logPath}"

# View last 10 frames:
sqlite3 "${dbPath}" "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 "${dbPath}" "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`
    );
  } else if (os === "macos" || os === "linux") {
    return (
      baseCommand +
      `# Stream the log:
tail -f "${logPath}"

# Scroll the logs:
less "${logPath}"

# View last 10 frames:
sqlite3 "${dbPath}" "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 "${dbPath}" "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`
    );
  } else {
    return "OS not recognized. \n\nPlease check the documentation for your specific operating system.";
  }
}




const OnboardingDevConfig: React.FC<OnboardingDevConfigProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {

  return (
    <div className={`${className} w-full flex justify-center flex-col`}>
      <DialogHeader className="px-2">
        <div className="w-full inline-flex !mt-[-10px] justify-center">
          <img
            src="/128x128.png"
            alt="screenpipe-logo"
            width="72"
            height="72"
          />
        </div>
        <DialogTitle className="text-center !mt-[-3px] font-bold text-[30px] text-balance flex justify-center">
          screenpipe with dev config
        </DialogTitle>
        <h1 className="font-medium text-center !mt-[-1px] text-md">
          customize the screenpipe setting using dev configuration
        </h1>
      </DialogHeader>
      <div className="mt-0 w-full flex justify-around flex-col">
        <div className="mx-3">
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
            </span> 
          </p>
        </div>
        <div className="mx-3 mt-2">
          <h1 className="font-semibold text-md">
            run the screenpipe backend via cli
          </h1>
          <ul className="mt-1">
            <li className="list-disc">
              <p className="text-muted-foreground text-sm ml-4">
                <span className="font-medium text-nowrap text-[14px] mr-1 prose">
                </span> 
              </p>
              <CodeBlock 
                className="rounded-md mt-2"
                language="bash"
                value="#"
              />
            </li>
            <li className="mt-2 list-disc">
              <p className="text-muted-foreground text-sm ml-4">
                <span className=" font-medium text-nowrap text-[14px] mr-1 prose">
                </span> 
              </p>
              <CodeBlock 
                className="rounded-md mt-2"
                language="bash"
                value="#"
              />
            </li>
          </ul>
        </div>
        <a
          onClick={() =>
            open(
              "https://docs.screenpi.pe/",
            )
          }
          href="#"
          className="mt-4 text-muted-foreground text-sm mr-auto ml-auto !text-center hover:underline"
        >
          learn more about screenpipe
          <ArrowUpRight className="inline w-4 h-4 ml-1 " />
        </a>
      </div>
      <OnboardingNavigation
        className="mt-8"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNextSlide}
        prevBtnText="previous"
        nextBtnText="next"
      />
    </div>
  );
};

export default OnboardingDevConfig;

