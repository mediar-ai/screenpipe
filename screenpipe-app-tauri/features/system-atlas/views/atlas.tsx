"use client";
import React, { useEffect, useRef, useState } from "react";
import { UserRound } from 'lucide-react';
import { ConversationBox } from "@/components/ui/conversation-box";
import PermissionStatus from "../components/permissions";
import { ScreenPipeLogo } from "../components/screenpipe-logo";
import LlmModelsStatus from "../components/llm-models-status";
import SystemTerminals from "../components/system-terminals";
import SystemApps from "../components/system-apps";
import { CircleIcon } from "@/components/ui/circle-icon";
import SystemComponentRelationships from "../components/system-component-relationships";

export default function SystemAtlas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const micRef = useRef<HTMLDivElement>(null);
  const monitorRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const screenpipeRef = useRef<HTMLDivElement>(null);
  const appStoreRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const collectionRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const llmModelsRef = useRef<HTMLDivElement>(null);

  const [show, setShow] = useState(false)
  useEffect(() => {
    setTimeout(() => setShow(true),1000)
  },[])

  return (
    <main
        id="main-container"
        className="relative w-[100vw] h-[100vh] flex flex-col justify-center items-center "
    >
        <ConversationBox
            init 
            className="absolute top-[30px] left-[30px] z-[100]" 
        />
        <section
            id="atlas"
            className="relative flex h-[500px] w-[95%] flex-row items-stretch p-5 justify-between bg-background"
            ref={containerRef}
        >
            <PermissionStatus
                micRef={micRef}
                keyboardRef={keyboardRef}
                monitorRef={monitorRef}
                className="self-center"
            />
            <div className="relative flex flex-col items-center justify-center">
                <ScreenPipeLogo
                    ref={screenpipeRef}
                    init
                />
                <LlmModelsStatus
                    className="absolute z-[10] bottom-[-100px]"
                    llmModelsRef={llmModelsRef}
                />
            </div>
            <div className="h-[300px] p-4 self-center flex flex-col items-center justify-between">
                <SystemTerminals
                    appStoreRef={appStoreRef}
                    searchRef={searchRef}
                />
            </div>
            <div className="h-[300px] p-4 self-center relative flex flex-col items-center justify-between">
                <SystemApps
                    className="z-[10] relative top-[-40px]"
                    collectionRef={collectionRef}
                />
                <CircleIcon ref={userRef}>
                    <UserRound className="h-4 w-4"/>
                </CircleIcon>
            </div>

            { show && 
                <SystemComponentRelationships
                    containerRef={containerRef}
                    micRef={micRef}
                    keyboardRef={keyboardRef}
                    monitorRef={monitorRef}
                    screenpipeRef={screenpipeRef}
                    appStoreRef={appStoreRef}
                    searchRef={searchRef}
                    userRef={userRef}
                    collectionRef={collectionRef}
                    llmModelsRef={llmModelsRef}
                />
            }
        </section> 
    </main>
  );
}