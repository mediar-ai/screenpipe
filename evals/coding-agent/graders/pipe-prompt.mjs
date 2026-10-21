// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const source = 'crates/screenpipe-core/src/pipes/mod.rs';
// Resolve the actual runtime before writing. The shared runner recognizes the
// real Node missing-module error as setup failure; no copied runtime is substituted.
createRequire(import.meta.url).resolve(resolve(source));
appendFileSync(source, '\n' + readFileSync(join(dirname(new URL(import.meta.url).pathname), 'pipe-prompt.fixture.rs'), 'utf8'));
