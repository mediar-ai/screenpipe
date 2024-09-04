

getting started locally:

```
cargo build --release 
cd examples/apps/screenpipe-app-tauri
bun i
bun scripts/pre_build.js
bun tauri build # or bun tauri dev 
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

