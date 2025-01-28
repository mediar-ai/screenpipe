import { handleError } from "../utils/handle-error";
import { logger } from "../utils/logger";
import { registryResolvedComponentsTreeSchema, RegistrySchema, registrySchema } from "./schema";
import registry from "./registry.json";
import deepmerge from "deepmerge";

export async function getRegistry() {
    try {
      const parsedRegistry = registrySchema.parse(registry)
      return parsedRegistry
    } catch (error) {
      logger.error("\n")
      handleError(error)
    }
}

async function resolveRegistryItems(names: string[]) {
  let registryDependencies: RegistrySchema = {}
  const registry = await getRegistry()
  if(!registry) return

  for (const name of names) {
    const itemRegistryDependencies = await resolveRegistryDependencies(
      name,
      registry
    )

    registryDependencies = {
      ...registryDependencies,
      ...itemRegistryDependencies
    }
  }

  return registryDependencies
}

async function resolveRegistryDependencies(
  name: string,
  registry: RegistrySchema
): Promise<RegistrySchema> {
  const components: RegistrySchema = {}
  
  
  async function resolveDependencies(componentName: string) {
    try {
      if (registry[componentName]) {
        components[componentName] = registry[componentName]
      } else {
        throw Error(componentName)
      }

      if (registry[componentName].registryDependencies) {
        for (const dependency of registry[componentName].registryDependencies) {
          await resolveDependencies(dependency)
        }
      }
    } catch (error: any) {
      console.error(
        `Component ${error.message} not found.`,
        error
      )
    }
  }

  await resolveDependencies(name)
  return components
}

export async function registryResolveItemsTree(
  names: RegistrySchema['']["name"][],
) {
  try {
    let relevantItemsRegistry = await resolveRegistryItems(names)
    const payload = registrySchema.parse(relevantItemsRegistry)

    if (!payload) {
      return null
    }

    const componentArray = Object.values(payload)

    let docs = ""
    componentArray.forEach((item) => {
      if (item.docs) {
        docs += `${item.docs}\n`
      }
    })

    return registryResolvedComponentsTreeSchema.parse({
      dependencies: deepmerge.all(
        componentArray.map((item) => item.dependencies ?? [])
      ),
      devDependencies: deepmerge.all(
        componentArray.map((item) => item.devDependencies ?? [])
      ),
      files: componentArray.map((item) => {
        return {
          src: item.src, 
          target: item.target
        }
      }),
      docs,
    })
  } catch (error) {
    handleError(error)
    return null
  }
}