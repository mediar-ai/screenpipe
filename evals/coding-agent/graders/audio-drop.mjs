// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { appendFileSync, readFileSync } from 'node:fs';
appendFileSync('crates/screenpipe-audio/src/core/stream.rs', '\n' + readFileSync(new URL('./audio-drop.fixture.rs', import.meta.url), 'utf8'));
