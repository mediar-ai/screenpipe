import chalk from 'chalk';

export const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  dim: chalk.gray,
  highlight: chalk.magenta,
  bold: chalk.bold,
  header: (text: string) => chalk.bold.cyan(`\n${text}`),
  subHeader: (text: string) => chalk.dim(`${text}`),
  listItem: (text: string) => chalk.cyan(`  * ${text}`),
  label: (text: string) => chalk.bold.blue(`${text}:`),
  value: (text: string) => chalk.white(`${text}`),
};

export const symbols = {
  success: '+',
  error: 'x',
  warning: '!',
  info: 'i',
  arrow: '>',
}; 