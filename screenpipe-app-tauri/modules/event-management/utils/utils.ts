function stripAnsiCodes(log: string) {
    log = log.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-ntqry=><]/g, '');
    log = log.replace(/[\n\r]+/g, '');
    return log
}    

export type ReactLogPresenterOutput = ReturnType<typeof reactLogPresenter>
export function reactLogPresenter(log: string) {
    const strippedLog = stripAnsiCodes(log)
    
    const logRegex = /^(?<timestamp>[\d\-T:\.Z]+)\s+(?<level>[A-Z]+)\s+(?<module>[\w:]+):\s+(?<message>[\s\S]+)$/;
    const match = strippedLog.match(logRegex);
    
    if (!match || !match.groups) {
        return { raw: strippedLog };
    }

    return {
        timestamp: match.groups.timestamp,
        level: match.groups.level,
        module: match.groups.module,
        message: match.groups.message,
    };
}

