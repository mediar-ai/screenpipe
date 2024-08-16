README TODO

Getting started locally:
```
pnpm install
pnpm tauri dev
```



releasing app:
```
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/myapp.key" # ask @louis030195 for key/pw 
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" # ask @louis030195 for key/pw 
pnpm add @sentry/nextjs
pnpm tauri build -- --features metal
# todo rest
```



