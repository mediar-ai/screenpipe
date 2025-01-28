import fs from 'fs';
import path from 'path';
import * as ERRORS from '@/src/utils/errors';
import { addOptionsSchema } from '../commands/add';
import { z } from 'zod';

export async function preFlightAdd(options: z.infer<typeof addOptionsSchema>) {
  const errors: Record<string, boolean> = {}

  // Ensure target directory exists.
  // Check for empty project. We assume if no package.json exists, the project is empty.
  if (
    !fs.existsSync(options.cwd) ||
    !fs.existsSync(path.resolve(options.cwd, "package.json"))
  ) {
    errors[ERRORS.MISSING_DIR_OR_EMPTY_PIPE] = true
    return {
      errors
    }
  }
}