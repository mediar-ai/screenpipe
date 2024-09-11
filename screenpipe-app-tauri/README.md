

getting started locally:

```
# Build the Rust backend first
cargo build --release 
cd screenpipe-app-tauri
# Install dependencies using Bun
bun i 
bun scripts/pre_build.js
bun tauri build 
# or bun tauri dev for development environment
```

can be more complex on windows

### macos specific

add this to `.vscode/settings.json`:

```json
{
    "rust-analyzer.server.extraEnv": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}"
    },
    "rust-analyzer.cargo.extraEnv": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}"
    },
    "terminal.integrated.env.osx": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}",
    }
}
```

this is used to link apple native OCR compiled lib to the bins

