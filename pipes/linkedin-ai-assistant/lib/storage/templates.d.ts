export interface Templates {
    'paste-here-url-from-linkedin-with-2nd-grade-connections': string;
    'request-for-intro-prompt-to-ai': string;
    'llm-appraisal-prompt': string;
    'llm-user-reply-needs-response-prompt': string;
}

declare module '*.json' {
    const value: Templates;
    export default value;
} 