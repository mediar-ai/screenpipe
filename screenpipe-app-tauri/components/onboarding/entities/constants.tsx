import { BotMessageSquare, BriefcaseBusiness, SlidersHorizontal, TextSearch, UserRound, Wrench } from "lucide-react"
import OnboardingAPISetup from "../api-setup"
import OnboardingDevConfig from "../dev-configuration"
import OnboardingDevOrNonDev from "../dev-or-non-dev"
import OnboardingInstructions from "../explain-instructions"
import OnboardingIntro from "../introduction"
import OnboardingPersonalize from "../personalize"
import OnboardingPipes from "../pipes"
import OnboardingStatus from "../status"
import OnboardingSelection from "../usecases-selection"
import { taskBase } from "./types"

const devProcess: taskBase[] = [
    {
        type: 'TASK',
        slug: 'devConfig',
        optional: true,
        component: () => <OnboardingDevConfig/>,
        condition:{
            isConditional: true,
            conditions: [
                {
                    conditionStep: 'devOrNonDev',
                    conditionProperty: 'devMode',
                    value: true
                }
            ]
        },
    },
    {
        type: 'TASK',
        slug: 'pipes',
        optional: true,
        component: () => <OnboardingPipes/>,
        condition:{
            isConditional: true,
            conditions: [
                {
                    conditionStep: 'devOrNonDev',
                    conditionProperty: 'devMode',
                    value: true
                }
            ]
        },
    }
]

const standardProcess: taskBase[]  = [
    {
        type: 'TASK',
        slug: 'personalize',
        optional: false,
        component: () => <OnboardingPersonalize/>,
        condition:{
            isConditional: true,
            conditions: [
                {
                    conditionStep: 'devOrNonDev',
                    conditionProperty: 'devMode',
                    value: false
                }
            ]
        },
        meta: {
            options: [
                {
                    key: "withoutAI",
                    icon: TextSearch,
                    title: "conventional search",
                    description:
                      "use advanced search capabilities on top of your 24/7 recordings or the pipe store",
                    note: "no api key needed.",
                  },
                  {
                    key: "withAI",
                    icon: BotMessageSquare,
                    title: "ai-enhanced Search",
                    description:
                      "use ai capabilities to summarize your recordings, extract insights, or use meeting summaries.",
                    note: "api key required.",
                  },
            ]
        }
    },
    {
        type: 'TASK',
        slug: 'apiSetup',
        optional: true,
        component: () => <OnboardingAPISetup/>,
        condition:{
            isConditional: true,
            conditions: [
                {
                    conditionStep: 'devOrNonDev',
                    conditionProperty: 'devMode',
                    value: false
                },
                {
                    conditionStep: 'personalize',
                    conditionProperty: 'withAi',
                    value: true
                },
            ]
        }
    },
    {
        type: 'TASK',
        slug: 'instructions',
        optional: true,
        component: () => <OnboardingInstructions/>,
        condition:{
            isConditional: true,
            conditions: [
                {
                    conditionStep: 'devOrNonDev',
                    conditionProperty: 'devMode',
                    value: false
                }
            ]
        },
    }
]

export const onboardingFlow: (taskBase)[] = [
    {
        type: 'TASK',
        slug: 'intro',
        optional: true,
        condition:{
            isConditional: false,
        },
        component: () => <OnboardingIntro/>
    },
    {
        type: 'TASK',
        slug: 'selection',
        optional: false,
        condition:{
            isConditional: false,
        },
        meta: {
            options: [
                {
                key: "personalUse",
                icon: UserRound,
                label: "personal use",
                description:
                    "personal knowledge management, productivity, custom dev, etc.",
                },
                {
                key: "professionalUse",
                icon: BriefcaseBusiness,
                label: "professional use",
                description:
                    "out of the box productivity, meeting summaries, automation, etc.",
                },
                {
                key: "developmentlUse",
                icon: Wrench,
                label: "development purpose",
                description:
                    "integrate in your business product, build on top, resell, etc.",
                },
                {
                key: "otherUse",
                icon: SlidersHorizontal,
                label: "other",
                description: "", // TODO editable
                },
            ]
        },
        component: () => <OnboardingSelection/>
    },
    {
        type: 'TASK',
        slug: 'devOrNonDev',
        optional: false,
        condition:{
            isConditional: false,
        },
        component: () => <OnboardingDevOrNonDev/>,
        meta: {
            options: [
                {
                  key: "standardMode",
                  icon: UserRound,
                  title: "standard mode",
                  description:
                    "screenpipe takes care of everything for you, making it easy and stress-free.",
                },
                {
                  key: "devMode",
                  icon: Wrench,
                  title: "dev mode",
                  description:
                    "run the CLI on top of the UI, and customize screenpipe to fit your needs.",
                },
            ]
        }
    },
    {
        type: 'TASK',
        slug: 'setup',
        optional: true,
        condition:{
            isConditional: false,
        },
        component: () => <OnboardingStatus/>,
    },
    ...devProcess,
    ...standardProcess
]