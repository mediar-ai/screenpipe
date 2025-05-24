import React, { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";
import { CodeBlock } from "@/components/onboarding/single-codeblock";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";

interface OnboardingDevConfigProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

interface devInstructionsItemsTypes {
  label: string;
  description: string;
  command: string;
}

type devInstructionItems = Record<string, devInstructionsItemsTypes[]>;

const OnboardingDevConfig: React.FC<OnboardingDevConfigProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  const [instructions, setInstructions] = useState<devInstructionsItemsTypes[]>(
    []
  );

  const devInstructionsData: devInstructionItems = {
    windows: [
      {
        label: "to start using the screenpipe cli,",
        description:
          "to use the screenpipe cli, open your cmd with admin privileges and navigate to '%LOCALAPPDATA%\\screenpipe' or run this command to view all setup arguments",
        command:
          "cd %LOCALAPPDATA%\\screenpipe && ./screenpipe.exe -h   # shows list of arguments",
      },
      {
        label: "starting screenpipe with custom arguments,",
        description:
          "after reviewing the cli arguments, choose your setup options and start screenpipe with your preference. replace arguments as needed. for example:",
        command:
          "screenpipe --ignored-windows settings    # ignore the windows named settings",
      },
    ],
    macos: [
      {
        label: "to start using the screenpipe cli,",
        description:
          "to use the screenpipe cli, open your terminal and navigate to '/Applications/screenpipe.app/Contents/MacOS/' or run this command to view all setup arguments",
        command:
          "cd /Applications/screenpipe.app/Contents/MacOS/ && screenpipe -h  # shows help",
      },
      {
        label: "starting screenpipe with custom arguments",
        description:
          "after reviewing the cli arguments, choose your setup options and start screenpipe with your preference. replace arguments as needed. for example:",
        command: "screenpipe --list-monitors     # list monitors",
      },
    ],
    linux: [
      {
        label: "to start using the screenpipe cli,",
        description:
          "open your terminal and navigate to the installation directory (usually /usr/local/bin) or run this command, this will show all arguments to setup screenpipe as you prefer.",
        command:
          "cd /usr/local/bin/ && screenpipe -h   # shows list of arguments",
      },
      {
        label: "starting screenpipe with custom arguments",
        description:
          "after reviewing the cli arguments, choose your setup options and start screenpipe with your preference. replace arguments as needed. for example:",
        command:
          "screenpipe --ignored-windows kitty    # ignore the windows named kitty",
      },
    ],
  };

  useEffect(() => {
    const getOsType = () => {
      const os = platform();
      setInstructions(devInstructionsData[os] || []);
    };
    getOsType();
  }, []);

  return (
    <div className={`${className} w-full flex justify-center flex-col`}>
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          screenpipe in dev mode
        </DialogTitle>
      </DialogHeader>
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
        {instructions.length > 0 && (
          <div className="mx-3 mt-1">
            <h1 className="font-medium text-md">
              run the screenpipe backend via cli:
            </h1>
            <ul className="mt-0">
              {instructions.map((instructions, index) => (
                <li key={index} className="list-disc mt-1">
                  <p className="text-muted-foreground text-sm ml-4">
                    <span className="font-medium text-nowrap text-[14px] mr-1 prose">
                      {instructions.label}
                    </span>
                    {instructions.description}
                  </p>
                  <CodeBlock
                    className="rounded-md mt-2"
                    language="bash"
                    value={instructions.command}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        <a
          onClick={() => open("https://docs.screenpi.pe/")}
          href="#"
          className="mt-4 text-muted-foreground text-sm mr-auto ml-auto !text-center hover:underline"
        >
          learn more about screenpipe args &amp; api
          <ArrowUpRight className="inline w-4 h-4 ml-1 " />
        </a>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        note: if you use dev mode, you will have to start and maintain the
        recording process yourself in the terminal
      </p>
      <OnboardingNavigation
        className="mt-6"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNextSlide}
        prevBtnText="previous"
        nextBtnText="next"
      />
    </div>
  );
};

export default OnboardingDevConfig;
