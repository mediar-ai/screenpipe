# screenpipe CLI (npm)

Install and run the screenpipe CLI via npm/bun.

## Usage

```bash
# Run directly (downloads binary on first use)
npx screenpipe status --json
bunx screenpipe status --json

# Or install globally
npm install -g screenpipe
screenpipe record --fps 1
screenpipe status
screenpipe pipe list
```

## How it works

The `screenpipe` npm package is a thin wrapper around the platform-specific binary.
Platform packages (`@screenpipe/cli-darwin-arm64`, etc.) contain the actual compiled
Rust binary. npm/bun automatically installs only the package matching your platform.

## Publishing (CI)

After a release build, copy the binary into the platform package and publish:

```bash
# Example for darwin-arm64
cp target/aarch64-apple-darwin/release/screenpipe packages/cli/screenpipe-darwin-arm64/bin/
cd packages/cli/screenpipe-darwin-arm64 && npm publish --access public
cd packages/cli/screenpipe && npm publish --access public
```

## Supported platforms

- macOS ARM64 (Apple Silicon)
- macOS x64 (Intel)
- Linux x64
- Windows x64
