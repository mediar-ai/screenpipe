

getting started locally:

```
# Build the Rust backend first
cargo build --release # add --features metal or cuda or whatever u need 
cd screenpipe-app-tauri
# Install dependencies using Bun
bun i 
bun scripts/pre_build.js
bun tauri build 
# or bun tauri dev for development environment
```

can be more complex on windows

### macos specific

louis' macos cursor/vscode settings `.vscode/settings.json`:

```json
{
    "rust-analyzer.cargo.features": [
        "metal",
        "pipes"
    ],
    "rust-analyzer.server.extraEnv": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}",
        "SCREENPIPE_APP_DEV": "true"
    },
    "rust-analyzer.cargo.extraEnv": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}",
        "SCREENPIPE_APP_DEV": "true"
    },
    "terminal.integrated.env.osx": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}",
        "SCREENPIPE_APP_DEV": "true"
    }
}
```

