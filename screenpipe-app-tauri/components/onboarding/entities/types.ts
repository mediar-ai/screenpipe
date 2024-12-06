type stepBase = {
    slug: string,
    optional: boolean,
    condition: {
        isConditional: boolean,
        conditions?: 
            {
                conditionProperty?: string,
                value?: any,
                conditionStep?: string
            }[]
        
    }
    meta?: any,
    component: ()=> React.ReactElement
}

export type taskBase = stepBase & {
    type: 'TASK',
}

export type processBase = stepBase & {
    type: 'PROCESS',
    tasks: Record<string, taskBase | processBase>
}