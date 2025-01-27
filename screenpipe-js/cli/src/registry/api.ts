import path from "path";
import { handleError } from "../utils/handle-error";
import { logger } from "../utils/logger";
import { registrySchema } from "./schema";
import fs from 'fs';

function loadFile(filePath: string, encoding: BufferEncoding = 'utf8') {
    return new Promise<string>((resolve, reject) => {
      fs.readFile(filePath, encoding, (err, data) => {

        if (err) {
          return reject(err);
        }

        resolve(data);
      });
    });
}

export async function getRegistry(cwd: string) {
    try {
      const result = await loadFile(path.join(cwd + '/src/registry/registry.json'))
  
      return registrySchema.parse(JSON.parse(result))
    } catch (error) {
      logger.error("\n")
      handleError(error)
    }
}