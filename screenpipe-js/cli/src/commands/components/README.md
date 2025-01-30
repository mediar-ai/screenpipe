# screenpipe-cli

a cli for adding screenpipe components to your project.

## Usage

## add

use the `add` command to adds a component to your project and install all required dependencies.

```bash
bunx screenpipe-cli add [component]
```

### Example

```bash
bunx screenpipe-cli add use-health
```

you can also run the command without any arguments to view a list of all available components:

```bash
bunx screenpipe-cli add
```

### Registry

the registry, which you can find at `src/registry/registry.json`, holds important static information about screenpipe's components. each component follows the following schema:

```ts
export const registryComponentSchema = z.object({
  // registry defined name, used by other components if they depend on it.
  name: z.string(),
  // github link to download from
  src: z.string(),
  // file to create 
  target: z.string(),
  // optional info to print with cli
  docs: z.string().optional(),
  // will be installed using bun
  dependencies: z.array(z.string()).optional(),
  devDependencies: z.array(z.string()).optional(),
  // should be names of other components within the registry
  registryDependencies: z.array(z.string()).optional(),
})
```

to register a new component you have to:

1. get components github url
    - url follows this pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path}
    - the path can be found in the github page of the component by clicking the top right, `more file actions` button.
2. edit `src/registry/registry.json`
3. build and publish cli


## License

Licensed under the [MIT license](https://github.com/shadcn/ui/blob/main/LICENSE.md).
