function stripAnsiCodes(log: string) {
    return log.replace(/\u001b\[[0-9;]*m/g, '');
}

export type ReactLogPresenterOutput = ReturnType<typeof reactLogPresenter>
export function reactLogPresenter(log: string) {
    const strippedLog = stripAnsiCodes(log);
    const logRegex = /^(?<timestamp>[\d\-T:\.Z]+)\s+(?<level>[A-Z]+)\s+(?<module>[\w:]+):\s+(?<message>.+)$/;

    const match = strippedLog.match(logRegex);
    if (!match || !match.groups) {
        return { raw: strippedLog }; // Return raw log if parsing fails
    }

    return {
        timestamp: match.groups.timestamp,
        level: match.groups.level,
        module: match.groups.module,
        message: match.groups.message,
    };
}

