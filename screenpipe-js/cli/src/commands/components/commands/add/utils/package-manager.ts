import { existsSync } from 'fs';
import { join } from 'path';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface PackageManagerCommands {
  install: string[];
  add: string[];
  addDev: string[];
}

const packageManagerCommands: Record<PackageManager, PackageManagerCommands> = {
  npm: {
    install: ['install'],
    add: ['install'],
    addDev: ['install', '--save-dev'],
  },
  yarn: {
    install: ['install'],
    add: ['add'],
    addDev: ['add', '--dev'],
  },
  pnpm: {
    install: ['install'],
    add: ['add'],
    addDev: ['add', '--save-dev'],
  },
  bun: {
    install: ['install'],
    add: ['add'],
    addDev: ['add', '--dev'],
  },
};

export function detectPackageManager(cwd: string): PackageManager {
  // Check for lock files
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm';

  // Default to npm if no lock file is found
  return 'npm';
}

export function getPackageManagerCommands(packageManager: PackageManager): PackageManagerCommands {
  return packageManagerCommands[packageManager];
} 