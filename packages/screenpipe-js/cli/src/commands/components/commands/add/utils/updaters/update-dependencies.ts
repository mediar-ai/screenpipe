import { execSync } from "child_process"
import { spinner } from "../logger"
import { detectPackageManager, getPackageManagerCommands, PackageManager } from "../package-manager"

export async function updateDependencies(
    dependencies: string[] | undefined,
    options: {
      cwd: string,
      silent?: boolean,
      devDependency?: boolean
    }
  ) {
    if (!dependencies?.length) {
      return;
    }

    // Remove duplicate dependencies
    const uniqueDependencies = Array.from(new Set(dependencies));

    try {
      const packageManager = detectPackageManager(options.cwd);
      const command = getPackageManagerCommand(packageManager, uniqueDependencies, options.devDependency);

      const spinnerText = `Installing ${options.devDependency ? 'dev dependencies' : 'dependencies'}: ${uniqueDependencies.join(', ')}...`;
      const dependenciesSpinner = spinner(spinnerText, { silent: options.silent });
      dependenciesSpinner.start();

      try {
        execSync(command.join(' '), {
          cwd: options.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        if (!options.silent) {
          dependenciesSpinner.succeed(`Installed ${options.devDependency ? 'dev dependencies' : 'dependencies'}: ${uniqueDependencies.join(', ')}`);
        }
      } catch (error) {
        if (!options.silent) {
          dependenciesSpinner.fail(`Failed to install ${options.devDependency ? 'dev dependencies' : 'dependencies'}`);
        }
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

function getPackageManagerCommand(packageManager: PackageManager, dependencies: string[], isDevDependency: boolean = false): string[] {
  const commands = {
    npm: ['npm', isDevDependency ? 'install --save-dev' : 'install', ...dependencies],
    yarn: ['yarn', 'add', isDevDependency ? '--dev' : '', ...dependencies],
    pnpm: ['pnpm', 'add', isDevDependency ? '--save-dev' : '', ...dependencies],
    bun: ['bun', 'add', isDevDependency ? '--dev' : '', ...dependencies],
  };

  return commands[packageManager].filter(Boolean);
}