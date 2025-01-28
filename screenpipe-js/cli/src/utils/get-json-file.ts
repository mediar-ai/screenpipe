import path from "path"
import fs from "fs-extra"
import { type PackageJson } from "type-fest"

export function getJSONFile(
  cwd: string = "",
  fileName: string,
  shouldThrow: boolean = true
) {
  const packageJsonPath = path.join(cwd, fileName)

  return fs.readJSONSync(packageJsonPath, {
    throws: shouldThrow,
  })
}

export function getPackageInfo(
    cwd: string = "",
) : PackageJson | null {
    return getJSONFile(cwd, 'package.json') as PackageJson
}
  
