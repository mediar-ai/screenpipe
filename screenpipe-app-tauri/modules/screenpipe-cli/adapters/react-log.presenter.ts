import { formatDateString, stripAnsiCodes } from "../utils/cli.service.utils";

export type ReactLogPresenterOutput = ReturnType<typeof reactLogPresenter>
export function reactLogPresenter(log: string) {
    const strippedLog = stripAnsiCodes(log)
    
    const logRegex = /^(?<timestamp>[\d\-T:\.Z]+)\s+(?<level>[A-Z]+)\s+(?<module>[\w:]+):\s+(?<message>[\s\S]+)$/;
    const match = strippedLog.match(logRegex);
    
    if (!match || !match.groups) {
        return { raw: strippedLog };
    }

    return {
        timestamp: formatDateString(match.groups.timestamp, true),
        level: match.groups.level,
        module: match.groups.module,
        message: match.groups.message,
    };
}