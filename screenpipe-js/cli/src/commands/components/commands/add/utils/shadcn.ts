import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"
import { spinner } from "./logger"
import { detectPackageManager, PackageManager } from "./package-manager"
import { handleError } from "./handle-error"
import prompts from "prompts"
import * as p from "@clack/prompts"

// Add delay utility
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ShadcnRegistryItem {
  name: string;
  type: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: Array<{
    path: string;
    type: string;
  }>;
}

async function getValidShadcnComponents(): Promise<string[]> {
  try {
    const response = await fetch('https://ui.shadcn.com/r/index.json');
    const data = await response.json() as ShadcnRegistryItem[];
    return data.map(item => item.name);
  } catch (error) {
    // Fallback to basic components if we can't fetch the registry
    return [
      'accordion',
      'alert',
      'alert-dialog',
      'aspect-ratio',
      'avatar',
      'badge',
      'button',
      'calendar',
      'card',
      'carousel',
      'checkbox',
      'collapsible',
      'command',
      'context-menu',
      'dialog',
      'dropdown-menu',
      'form',
      'hover-card',
      'input',
      'label',
      'menubar',
      'navigation-menu',
      'popover',
      'progress',
      'radio-group',
      'scroll-area',
      'select',
      'separator',
      'sheet',
      'skeleton',
      'slider',
      'switch',
      'table',
      'tabs',
      'textarea',
      'toast',
      'toggle',
      'tooltip'
    ];
  }
}

export function getShadcnAddCommand(
  components: string[], 
  packageManager: PackageManager,
  options: {
    overwrite?: boolean,
    noPrompt?: boolean
  } = {}
): string[] {
  const flags: string[] = [];
  
  // Add -y flag to skip prompts if noPrompt is true
  if (options.noPrompt) {
    flags.push('-y');
  }

  // Add --overwrite flag if overwrite is true
  if (options.overwrite) {
    flags.push('--overwrite');
  }

  // Base command parts for each package manager
  const baseCommand = {
    bun: ['bunx', '--bun', 'shadcn@latest'],
    pnpm: ['pnpm', 'dlx', 'shadcn@latest'],
    yarn: ['yarn', 'dlx', 'shadcn@latest'],
    npm: ['npx', 'shadcn@latest']
  };

  const command = baseCommand[packageManager] || baseCommand.npm;
  return [...command, 'add', ...components, ...flags];
}

function getShadcnInitCommand(packageManager: PackageManager): string[] {
  const baseCommand = {
    bun: ['bunx', '--bun', 'shadcn@latest'],
    pnpm: ['pnpm', 'dlx', 'shadcn@latest'],
    yarn: ['yarn', 'dlx', 'shadcn@latest'],
    npm: ['npx', 'shadcn@latest']
  };

  const command = baseCommand[packageManager] || baseCommand.npm;
  return [...command, 'init', '-yd'];
}

function isShadcnInitialized(cwd: string): boolean {
  return existsSync(join(cwd, 'components.json'));
}

async function initializeShadcn(cwd: string, silent: boolean = false): Promise<boolean> {
  // Initialize spinner but don't start it yet
  const initSpinner = spinner('Checking shadcn-ui initialization...');
  
  try {
    if (!silent) {
      // Clear the line instead of showing initial spinner
      const shouldInit = await p.confirm({
        message: 'shadcn-ui is not initialized in this project. Would you like to initialize it now?'
      });
      
      if (p.isCancel(shouldInit) || !shouldInit) {
        console.log('Please initialize shadcn-ui manually by running: npx shadcn@latest init');
        return false;
      }
    }

    // Start spinner for initialization
    initSpinner.start('Initializing shadcn-ui...');
    
    const packageManager = detectPackageManager(cwd);
    const commandParts = getShadcnInitCommand(packageManager);
    execSync(commandParts.join(' '), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: 'true',
        CI: 'true' // Always run in CI mode for init
      }
    });
    
    initSpinner.succeed('Initialized shadcn-ui');
    return true;
  } catch (error) {
    initSpinner.fail('Failed to initialize shadcn-ui');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to initialize shadcn-ui: ${errorMessage}`);
  }
}

export async function installShadcnComponents(
  components: string[] = [],
  options: {
    cwd: string,
    silent?: boolean,
    overwrite?: boolean
  }
): Promise<void> {
  // Early return if no components to install
  if (!components?.length) {
    return;
  }

  try {
    // Check if shadcn is initialized, if not initialize it
    if (!isShadcnInitialized(options.cwd)) {
      const initialized = await initializeShadcn(options.cwd, options.silent);
      if (!initialized) {
        return handleError(
          new Error('shadcn-ui must be initialized before installing components')
        );
      }
    }

    // Validate components against the registry
    const validComponents = await getValidShadcnComponents();
    const invalidComponents = components.filter(component => !validComponents.includes(component));
    
    if (invalidComponents.length > 0) {
      return handleError(
        new Error(
          `Invalid shadcn components: ${invalidComponents.join(', ')}\n` +
          `Available components are: ${validComponents.join(', ')}`
        )
      );
    }

    const packageManager = detectPackageManager(options.cwd);
    const componentList = components.join(', ');
    const commandParts = getShadcnAddCommand(components, packageManager, {
      overwrite: options.overwrite,
      noPrompt: options.silent
    });

    const shadcnSpinner = spinner(`Installing shadcn components: ${componentList}...`, { silent: options.silent });
    shadcnSpinner.start();
    
    try {
      execSync(commandParts.join(' '), {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: 'true',
          CI: options.silent ? 'true' : 'false'
        }
      });

      shadcnSpinner.succeed(`Installed shadcn components: ${componentList}\n`);
    } catch (error) {
      shadcnSpinner.fail(`Failed to install shadcn components\n`);
      throw error;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return handleError(new Error(`Failed to install shadcn components: ${errorMessage}`));
  }
} 