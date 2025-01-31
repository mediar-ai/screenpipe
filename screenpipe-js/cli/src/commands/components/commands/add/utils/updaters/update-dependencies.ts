import { execa } from "execa"
import { spinner } from "../logger"
import { ComponentSchema } from "../../registry/schema"

export async function updateDependencies(
    dependencies: ComponentSchema["dependencies"],
    cwd: string,
    options: {
      silent?: boolean,
      devDependency?: boolean
    }
  ) {
    dependencies = Array.from(new Set(dependencies))
    if (!dependencies?.length) {
      return
    }
  
    options = {
      silent: false,
      ...options,
    }
  
    const dependenciesSpinner = spinner(`Installing dependencies.`, {
      silent: options.silent,
    })?.start()

    dependenciesSpinner?.start()
  
    await execa(
      'bun',
      [
        "add",
        ...dependencies,
        ...(options.devDependency ? [`--dev`] : []),
      ],
      {
        cwd: cwd,
      }
    )
  
    dependenciesSpinner?.succeed()
  }