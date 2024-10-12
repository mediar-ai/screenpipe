import process from 'node:process';
import { assertEquals } from "jsr:@std/assert";
import { v1 as uuid } from 'jsr:@std/uuid';
import { ParsedConfig, loadPipeConfig } from '../main.ts';

Deno.test('should return empty object if pipe.json is not found', async () => {
  // ensuring it'll not be valid values
  Deno.env.set('SCREENPIPE_DIR', uuid.generate());
  Deno.env.set('PIPE_ID', uuid.generate());

  const loadedConfig = await loadPipeConfig();

  assertEquals(loadedConfig, {});
});

const setupPipeDir = async (config: ParsedConfig) => {
  const pipeId = uuid.generate();
  const pipeDir = await Deno.makeTempDir({ prefix: 'screenpipe-test-dir' });

  // ensuring if the env vars are set using process.env, they are available in the Deno.env
  process.env.SCREENPIPE_DIR = pipeDir;
  process.env.PIPE_ID = pipeId;

  const encoder = new TextEncoder();
  const content = encoder.encode(JSON.stringify(config));

  // getting value from process.env via Deno.env
  const pipePath = `${Deno.env.get('SCREENPIPE_DIR')}/pipes/${Deno.env.get('PIPE_ID')}`

  await Deno.mkdir(pipePath, { recursive: true });
  
  await Deno.writeFile(`${pipePath}/pipe.json`, content);
}

const generateConfig = () => ({
  interval: Math.floor(Math.random() * 100),
  summaryFrequency: Math.floor(Math.random() * 100),
  emailAddress: `mail+${uuid.generate()}@contact.com`,
})

Deno.test('should load config from SCREENPIPE_DIR/pipes/PIPE_ID/pipe.json', async () => {
  const config = generateConfig();

  await setupPipeDir({
    fields: [
      { name: 'interval', value: config.interval },
      { name: 'summaryFrequency', value: config.summaryFrequency },
      { name: 'emailAddress', value: config.emailAddress },
    ]
  });

  const loadedConfig = await loadPipeConfig();

  assertEquals(loadedConfig, config);
});

Deno.test('should load default values if not provided in config', async () => {
  const config = generateConfig();

  await setupPipeDir({
    fields: [
      { name: 'interval', value: config.interval },
      { name: 'summaryFrequency', default: 5 },
      { name: 'emailAddress', value: config.emailAddress },
    ]
  });

  const loadedConfig = await loadPipeConfig();

  assertEquals(loadedConfig, { ...config, summaryFrequency: 5 });
});
