import { defineConfig } from "tsup"
import path from 'path';
import fs from 'fs';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  sourcemap: true,
  minify: true,
  target: "esnext",
  outDir: "dist",
  treeshake: true,
})