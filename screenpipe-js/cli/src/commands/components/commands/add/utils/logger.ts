import ora from "ora";
import { colors } from "../../../../../utils/colors";

export const highlighter = {
  error: colors.error,
  warn: colors.warning,
  info: colors.info,
  success: colors.success,
};

export const logger = {
  error(...args: unknown[]) {
    console.log(highlighter.error(args.join(" ").toLowerCase()));
  },
  warn(...args: unknown[]) {
    console.log(highlighter.warn(args.join(" ").toLowerCase()));
  },
  info(...args: unknown[]) {
    console.log(highlighter.info(args.join(" ").toLowerCase()));
  },
  success(...args: unknown[]) {
    console.log(highlighter.success(args.join(" ").toLowerCase()));
  },
  log(...args: unknown[]) {
    console.log(args.join(" ").toLowerCase());
  },
  break() {
    console.log("");
  },
};

export function spinner(
  text: string,
  options?: {
    silent?: boolean;
  }
) {
  if (options?.silent) {
    return {
      start: () => ({ succeed: () => {}, fail: () => {}, stop: () => {}, info: () => {} }),
      succeed: () => {},
      fail: () => {},
      stop: () => {},
      info: () => {},
    };
  }
  const spinner = ora({
    text: text,
    color: "white",
  });
  return spinner;
}
