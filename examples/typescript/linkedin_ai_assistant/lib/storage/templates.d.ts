declare module '*.json' {
    export interface Templates {
        request_for_intro: string;
        llm_appraisal_prompt: string;
        request_for_intro_prompt_to_AI: string;
    }
    const value: Templates;
    export default value;
} 