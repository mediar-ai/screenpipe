import { Spinner } from "@topcli/spinner";
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
  return new Spinner({
    verbose: !options?.silent,
    color: "white", // you can customize this
  }).start(text);
}
