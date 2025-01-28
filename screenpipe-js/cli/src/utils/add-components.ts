import { spinner } from "./spinner"
import { handleError } from "./handle-error"
import { registryResolveItemsTree } from "../registry/api"

export async function addComponents(
    components: string[],
    options: {
      overwrite?: boolean
      silent?: boolean
      isNewProject?: boolean
    }
) {
    const registrySpinner = spinner(`Checking registry.`, {
      silent: options.silent,
    })?.start()

    const tree = await registryResolveItemsTree(components)

    if (!tree) {
      registrySpinner?.fail()
      return handleError(new Error("Failed to fetch components from registry."))
    }
    registrySpinner?.succeed()

    // await updateDependencies(tree.dependencies, config, {
    //   silent: options.silent,
    // })
    // await updateFiles(tree.files, config, {
    //   overwrite: options.overwrite,
    //   silent: options.silent,
    // })
  
}