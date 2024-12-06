import OnboardingAPISetup from "../api-setup"
import OnboardingDevConfig from "../dev-configuration"
import OnboardingDevOrNonDev from "../dev-or-non-dev"
import OnboardingInstructions from "../explain-instructions"
import OnboardingIntro from "../introduction"
import OnboardingPersonalize from "../personalize"
import OnboardingPipes from "../pipes"
import OnboardingStatus from "../status"
import OnboardingSelection from "../usecases-selection"

const oldprocess = {
    intro:{
      slug: 'intro',
      optional: true,
      component: () => OnboardingIntro
    },
    setup:{
      slug: 'setup',
      optional: true,
      component: () => OnboardingStatus
    },
    selection:{
      slug: 'selection',
      optional: false,
      component: ()=> OnboardingSelection
    },
    personalize:{
      slug: 'personalize',
      optional: false,
      component: () => OnboardingPersonalize
    },
    apiSetup:{
      slug: 'apiSetup',
      optional: false,
      component: () => OnboardingAPISetup
    },
    devOrNonDev:{
      slug: 'devOrNonDev',
      optional: false,
      component: () => OnboardingDevOrNonDev
    },
    devConfig:{
      slug: 'devConfig',
      optional: true,
      component: () => OnboardingDevConfig,
    },
    pipes:{
      slug: 'pipes',
      optional: true,
      component: () => OnboardingPipes
    },
    instructions:{
      slug: 'instructions',
      optional: true,
      component: () => OnboardingInstructions
    }
}
  
const devProcess: Record<string, taskBase|processBase> = {
    devConfig:{
        type: 'TASK',
        slug: 'devConfig',
        optional: true,
        component: () => <OnboardingDevConfig/>,
        condition:{
            isConditional: false,
        }
    },
    pipes:{
        type: 'TASK',
        slug: 'pipes',
        optional: true,
        component: () => <OnboardingPipes/>,
        condition:{
            isConditional: false,
        }
    }
}

const standardProcess: Record<string, taskBase|processBase>  = {
    personalize:{
        type: 'TASK',
        slug: 'personalize',
        optional: false,
        component: () => <OnboardingPersonalize/>,
        condition:{
            isConditional: false,
        }
    },
    apiSetup:{
        type: 'TASK',
        slug: 'apiSetup',
        optional: true,
        component: () => <OnboardingAPISetup/>,
        condition:{
            isConditional: false,
        }
    },
    instructions:{
        type: 'TASK',
        slug: 'instructions',
        optional: true,
        component: () => <OnboardingInstructions/>,
        condition:{
            isConditional: false,
        }
    }
}

type stepBase = {
    slug: string,
    optional: boolean,
    condition: {
        isConditional: boolean,
        conditionProperty?: string,
        value?: any,
        conditionStep?: string
    }
}

export type taskBase = stepBase & {
    type: 'TASK',
    component: () => React.ReactElement
}

export type processBase = stepBase & {
    type: 'PROCESS',
    tasks: Record<string, taskBase | processBase>
}

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
        component: () => <OnboardingSelection/>
    },
    {
        type: 'TASK',
        slug: 'devOrNonDev',
        optional: false,
        condition:{
            isConditional: false,
        },
        component: () => <OnboardingDevOrNonDev/>
    },
    {
        type: 'TASK',
        slug: 'setup',
        optional: true,
        condition:{
            isConditional: false,
        },
        component: () => <OnboardingStatus/>
    },
    {
        type: 'TASK',
        slug: 'devProcess',
        optional: true,
        condition:{
            isConditional: true,
            conditionStep: 'devOrNonDev',
            conditionProperty: 'devMode',
            value: true
        },
        // tasks: devProcess,
        component: ()=> <h1>hey</h1>
    },
    {
        type: 'TASK',
        slug: 'standardProcess',
        optional: true,
        condition:{
            isConditional: true,
            conditionStep: 'devOrNonDev',
            conditionProperty: 'devMode',
            value: false
        },
        component: () => <h1>hohoho</h1>
    }
]