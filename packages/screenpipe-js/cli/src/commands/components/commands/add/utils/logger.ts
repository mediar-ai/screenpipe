import * as p from "@clack/prompts";
import chalk from "chalk";

export const logger = {
  error: (...args: unknown[]) => console.error(chalk.red(...args)),
  warn: (...args: unknown[]) => console.warn(chalk.yellow(...args)),
  info: (...args: unknown[]) => console.info(chalk.blue(...args)),
  success: (...args: unknown[]) => console.log(chalk.green(...args)),
  log: (...args: unknown[]) => console.log(...args),
  break: () => console.log(""),
};

export const highlighter = {
  info: (text: string) => chalk.blue(text),
  error: (text: string) => chalk.red(text),
  warning: (text: string) => chalk.yellow(text),
  success: (text: string) => chalk.green(text),
  code: (text: string) => chalk.gray(text),
};

export const spinner = (text: string, options: { silent?: boolean } = {}) => {
  const s = p.spinner();
  return {
    start: (newText?: string) => {
      if (!options.silent) {
        s.start(newText || text);
      }
      return s;
    },
    stop: () => {
      if (!options.silent) {
        s.stop();
      }
      return s;
    },
    succeed: (text?: string) => {
      if (!options.silent) {
        s.stop(text ? chalk.green(`✔ ${text}`) : undefined);
      }
      return s;
    },
    fail: (text?: string) => {
      if (!options.silent) {
        s.stop(text ? chalk.red(`✖ ${text}`) : undefined);
      }
      return s;
    },
    info: (text?: string) => {
      if (!options.silent) {
        s.stop(text ? chalk.blue(`ℹ ${text}`) : undefined);
      }
      return s;
    },
    warn: (text?: string) => {
      if (!options.silent) {
        s.stop(text ? chalk.yellow(`⚠ ${text}`) : undefined);
      }
      return s;
    }
  };
};
