import { execa } from "execa"
import ora from "ora"
import { detectPackageManager, getPackageManagerCommands } from "../package-manager"

export async function updateDependencies(
    dependencies: string[] | undefined,
    cwd: string,
    options: {
      silent?: boolean,
      devDependency?: boolean
    }
  ) {
    dependencies = Array.from(new Set(dependencies ?? []));
  
    options = {
      silent: false,
      ...options,
    }

    if (!dependencies?.length) {
      return;
    }

    const packageManager = detectPackageManager(cwd);
    const commands = getPackageManagerCommands(packageManager);
  
    const spinnerText = `Installing ${options.devDependency ? 'dev dependencies' : 'dependencies'}: ${dependencies.join(', ')}...`;
    const dependenciesSpinner = options.silent ? null : ora({
      text: spinnerText,
      color: "white",
    }).start();

    try {
      const command = [
        ...(options.devDependency ? commands.addDev : commands.add),
        ...dependencies,
      ];

      await execa(
        packageManager,
        command,
        {
          cwd: cwd,
        }
      );
      dependenciesSpinner?.succeed(`${options.devDependency ? 'Dev dependencies' : 'Dependencies'} installed successfully!`);
    } catch (error) {
      dependenciesSpinner?.fail(`Failed to install ${options.devDependency ? 'dev dependencies' : 'dependencies'}`);
      throw error;
    }
  }