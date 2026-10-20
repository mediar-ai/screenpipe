// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { appendFileSync, readFileSync } from 'node:fs';
appendFileSync('crates/screenpipe-audio/src/core/device.rs', '\n' + readFileSync(new URL('./audio-inventory.fixture.rs', import.meta.url), 'utf8'));
