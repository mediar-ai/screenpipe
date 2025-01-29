import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ERRORS } from '../utils/handle-error';

export async function preFlightAdd(cwd: string) {
  const errors: Record<string, boolean> = {}

  // Ensure target directory exists.
  // Check for empty project. We assume if no package.json exists, the project is empty.
  if (
    !fs.existsSync(cwd) ||
    !fs.existsSync(path.resolve(cwd, "package.json"))
  ) {
    errors[ERRORS.MISSING_DIR_OR_EMPTY_PIPE] = true
    return {
      errors
    }
  }
}