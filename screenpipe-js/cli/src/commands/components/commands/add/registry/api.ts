import { handleError } from "../utils/handle-error";
import { logger } from "../utils/logger";
import { registryResolvedComponentsTreeSchema, RegistrySchema, registrySchema } from "./schema";
import registry from "./registry.json";
import deepmerge from "deepmerge";

export function getRegistry() {
    try {
      const parsedRegistry = registrySchema.parse(registry)
      return parsedRegistry
    } catch (error) {
      logger.break()
      handleError(error)
    }
}

function resolveRegistryItems(names: string[]) {
  let registryDependencies: RegistrySchema = {}
  const registry = getRegistry()
  if(!registry) return

  for (const name of names) {
    const itemRegistryDependencies = resolveRegistryDependencies(
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

function resolveRegistryDependencies(
  name: string,
  registry: RegistrySchema
): RegistrySchema {
  const components: RegistrySchema = {}
  
  
  function resolveDependencies(componentName: string) {
      if (registry[componentName]) {
        components[componentName] = registry[componentName]
      } else {
        logger.break()
        handleError(
          `Component ${componentName} not found.`,
        )
      }

      if (registry[componentName].registryDependencies) {
        for (const dependency of registry[componentName].registryDependencies) {
          resolveDependencies(dependency)
        }
      }
  }

  resolveDependencies(name)
  return components
}

export function registryResolveItemsTree(
  names: RegistrySchema['']["name"][],
) {
  let relevantItemsRegistry = resolveRegistryItems(names)
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
    shadcnComponent: Array.from(new Set(
      componentArray.flatMap((item) => item.shadcnComponent ?? [])
    ))
  })
}