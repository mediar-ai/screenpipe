import { describe, expect, test, beforeEach } from "bun:test";
import { v4 as uuid } from "uuid";
import { ParsedConfig, loadPipeConfig } from "../main";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadPipeConfig", () => {
  let pipeDir: string;
  let pipeId: string;

  const setupPipeDir = async (config: ParsedConfig) => {
    pipeId = uuid();
    pipeDir = join(tmpdir(), `screenpipe-test-${uuid()}`);

    process.env.SCREENPIPE_DIR = pipeDir;
    process.env.PIPE_ID = pipeId;

    const pipePath = join(pipeDir, "pipes", pipeId);
    await mkdir(pipePath, { recursive: true });
    await writeFile(join(pipePath, "pipe.json"), JSON.stringify(config));
  };

  const generateConfig = () => ({
    interval: Math.floor(Math.random() * 100),
    summaryFrequency: Math.floor(Math.random() * 100),
    emailAddress: `mail+${uuid()}@contact.com`,
  });

  test("should return empty object if pipe.json is not found", async () => {
    process.env.SCREENPIPE_DIR = uuid();
    process.env.PIPE_ID = uuid();

    const loadedConfig = loadPipeConfig();
    expect(loadedConfig).toEqual({});
  });

  test("should load config from SCREENPIPE_DIR/pipes/PIPE_ID/pipe.json", async () => {
    const config = generateConfig();

    await setupPipeDir({
      fields: [
        { name: "interval", value: config.interval },
        { name: "summaryFrequency", value: config.summaryFrequency },
        { name: "emailAddress", value: config.emailAddress },
      ],
    });

    const loadedConfig = loadPipeConfig();
    expect(loadedConfig).toEqual(config);
  });

  test("should load default values if not provided in config", async () => {
    const config = generateConfig();

    await setupPipeDir({
      fields: [
        { name: "interval", value: config.interval },
        { name: "summaryFrequency", default: 5 },
        { name: "emailAddress", value: config.emailAddress },
      ],
    });

    const loadedConfig = loadPipeConfig();
    expect(loadedConfig).toEqual({ ...config, summaryFrequency: 5 });
  });
});
