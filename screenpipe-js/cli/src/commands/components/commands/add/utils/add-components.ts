import { handleError } from "./handle-error"
import { registryResolveItemsTree } from "../registry/api"
import { updateDependencies } from "./updaters/update-dependencies"
import { spinner } from "./logger"
import { updateFiles } from "./updaters/update-files"

export async function addComponents(
    components: string[],
    options: {
      silent?: boolean,
      cwd: string,
      overwrite: boolean
    }
) {
    const registrySpinner = spinner(`Checking registry.`, {
      silent: options.silent,
    })?.start()

    const tree = registryResolveItemsTree(components)

    if (!tree) {
      registrySpinner?.fail()
      return handleError(new Error("Failed to fetch components from registry."))
    }
    registrySpinner?.succeed()


    await updateDependencies(tree.dependencies, options.cwd, {
      silent: options.silent,
    })

    await updateDependencies(tree.devDependencies, options.cwd, {
      silent: options.silent,
      devDependency: true
    })


    await updateFiles(tree.files, {
      cwd: options.cwd,
      overwrite: options.overwrite,
      silent: options.silent,
    })
}