"use client";
import React, { useEffect, useRef, useState } from "react";
import {  UserRound } from 'lucide-react';
import { ActorRef } from "xstate";
import { useConfettiFireworks } from "../use-confetti-fireworks";
import { useSelector } from "@xstate/react";
import { screenpipeOnboardingMachine } from "@/features/onboarding/state-machine/onboarding-flow";
import ConversationBox from "../components/conversation-box";
import PermissionStatus from "../components/permissions";
import LlmModelsStatus from "../components/llm-models-status";
import SystemTerminals from "../components/system-terminals";
import SystemApps from "../components/system-apps";
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container";
import { AnimatePresence } from "framer-motion";
import SystemComponentRelationships from "../components/system-component-relationships";
import { CircleIcon } from "@/components/ui/circle-icon";
import ScreenpipeLogo from '../components/screenpipe-logo/index';


export default function ScreenpipeSystemAtlas(props:{
    actorRef: ActorRef<any,any,any>,
}) {

    console.log("HELLO")
  const { handleClick } = useConfettiFireworks()
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
  const [show1, setShow1] = useState(false)
  
  useEffect(() => {
    setTimeout(() => {
        setShow(true)
        setShow1(true)
    },300)
  },[])

  const state = useSelector(screenpipeOnboardingMachine, (snapshot) => {
    if (snapshot.matches('done')) {
        handleClick()
    }

    return snapshot
  })


  return (
    <main
        id="main-container"
        className="relative w-[100%] h-[100%] flex flex-col justify-center items-center "
    >
        <ConversationBox
            className="top-[30px] left-[30px] absolute z-[100]"
        />
        <section
            id="atlas"
            className="relative flex h-[500px] w-[95%] flex-row items-stretch p-5 justify-between bg-background"
            ref={containerRef}
        >
            <PermissionStatus
                actorRef={props.actorRef}
                isContainerActive={state.matches('permissions')}
                micRef={micRef}
                keyboardRef={keyboardRef}
                monitorRef={monitorRef}
                className="self-center"
            />
            <div className="relative flex flex-col items-center justify-center">
                <ScreenpipeLogo ref={screenpipeRef}/>
                <LlmModelsStatus
                    actorRef={props.actorRef}
                    isContainerActive={state.matches('core_models')}
                    className="absolute z-[10] bottom-[-100px]"
                    llmModelsRef={llmModelsRef}
                />
            </div>
            <div className="h-[300px] self-center flex flex-col items-center justify-between">
                <SystemTerminals
                    isAppStoreActive={state.matches('appstore')}
                    isSearchActive={state.matches('search')}
                    actorRef={props.actorRef}
                    appStoreRef={appStoreRef}
                    searchRef={searchRef}
                />
            </div>
            <div className="h-[300px] self-center relative flex flex-col items-center justify-between">
                <SystemApps
                    isContainerActive={state.matches('appstore')}
                    className="z-[10] relative top-[-40px]"
                    collectionRef={collectionRef}
                />
                <AnimatedGroupContainer
                    hiddenBorder
                    shouldScale={state.matches('user')}
                    className="data-[isactive=true]:p-2"
                >
                    <CircleIcon ref={userRef}>
                        <UserRound className="h-4 w-4"/>
                    </CircleIcon>
                </AnimatedGroupContainer>
            </div>

            <AnimatePresence>
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
            </AnimatePresence>
        </section> 
    </main>
  );
}