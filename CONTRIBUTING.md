# contributing to screen pipe

first off, thank you for considering contributing to screen pipe! it's people like you that make screen pipe such a great tool.

i'd love to personally onboard you to the project. let's [schedule a call](https://cal.com/louis030195/screenpipe).

## getting started

before you begin:
- make sure you have installed all the necessary dependencies as mentioned in the [docs](https://docs.screenpi.pe/).
- familiarize yourself with the project structure and architecture.

## how can i contribute?

### reporting bugs

this section guides you through submitting a bug report for screen pipe. following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

- use a clear and descriptive title for the issue to identify the problem.
- describe the exact steps which reproduce the problem in as many details as possible.
- provide specific examples to demonstrate the steps.

### suggesting enhancements

this section guides you through submitting an enhancement suggestion for screen pipe, including completely new features and minor improvements to existing functionality.

- use a clear and descriptive title for the issue to identify the suggestion.
- provide a step-by-step description of the suggested enhancement in as many details as possible.
- explain why this enhancement would be useful to most screen pipe users.

### pull requests

- fill in the required template
- do not include issue numbers in the pr title
- include screenshots and animated gifs in your pull request whenever possible.
- follow the rust styleguides.
- end all files with a newline.

## styleguides

### git commit messages

- use the present tense ("add feature" not "added feature")
- use the imperative mood ("move cursor to..." not "moves cursor to...")
- limit the first line to 72 characters or less
- reference issues and pull requests liberally after the first line

### rust styleguide

all rust code must adhere to [rust style guide](https://github.com/rust-lang/rust/tree/4f2f477fded0a47b21ed3f6aeddeafa5db8bf518/src/doc/style-guide/src).

we follow [this](https://doc.rust-lang.org/cargo/guide/project-layout.html) folder structure.

## additional notes

### try to keep files small (under 600 lines of code)

AI is quite bad when files are big, we should try to keep small so we move faster (also it's nice for humans too 🤓)

### ai system prompt

i use cursor with this prompt to help me with the code:

```
Rules:
- Coding: louis is working on screenpipe most of the time, it's an open source app, lib, and CLI, that record screens & mics 24/7, extract OCR & STT, save to local db, connect to AI, do magic, it's written in Rust + Tauri and we write plugins (pipes) in TS + Bun. the Rust CLI is embedded as a sidecar in Tauri. it works on macos, windows, linux
- Coding: always keep my style black and white, with some nerdy style and fonts pixelated / scientific style
- Coding: do not remove @ts-ignore except if i explicitly ask you
- Coding: always use lower case for logging stuff or UI
- Coding: Rust: always use anyhow error, tokio instead of std stuff, avoid mutex if you can, prefer channels, write code easy to read for humans, fast for machines
- Coding: when i ask to give me the full code it means FULL, no fucking // rest of the code comments GIVE ME THE FULL CODE
- Coding: if it seems like you lack some context about a niche lib just ask me to provide the source code and i will (instead of providing a bad answer)
- Coding: NextJS: make sure to use tailwind, typescript, shadcn, lucide, magicui, and framer-motion to make UIs amazing
- Coding: Make sure to escape html thing like quotes etc properly. Only when necessary
- Coding: When writing react or html code make sure to use thing like &apos; instead of ". Only when necessary (e.g inside quote themselves)
```


### principles 

- **user fanatic: focus on building what people want and bring maximum value.**
- concurrency: channels > mutexes/locks
- simplicity: avoid premature optimization. write code that is easy for humans to read, fast for machines to execute. less is more. optimise for less code, less files, less dependencies, less complexity.
- production: we're building real products, not python toy that grow to 150k stars and die prematurely and never leave localhost, thank you.
- focus: avoid feature creep. focus on the core functionality and build upon it. focus on the user and their needs.
- use numbers: if you can't measure it, you can't improve it.
- avoid oop: prefer functional programming.
- positive-sum: we're all going to win, it is a multiplayer, positive sum game. (that escalated quickly)

### issue and pull request labels

this section lists the labels we use to help us track and manage issues and pull requests.

* `bug` - issues that are bugs.
* `enhancement` - issues that are feature requests.
* `documentation` - issues or pull requests related to documentation.
* `good first issue` - good for newcomers.

## building

```bash
cargo build --release --features metal # or cuda, depending on your computer's NPU
```

## running tests

before submitting a pull request, run all the tests to ensure nothing has broken:

```bash
cargo test
# on macos you need to set DYLD_LIBRARY_PATH for apple native OCR tests to run
DYLD_LIBRARY_PATH=$(pwd)/screenpipe-vision/lib cargo test
```

you can add env var to `.vscode/settings.json`:

```json
{
    "terminal.integrated.env.osx": {
        "DYLD_LIBRARY_PATH": "$(pwd)/screenpipe-vision/lib"
    }
}
```

this is @louis030195 whole `.vscode/settings.json` file:

```json
{
    "rust-analyzer.server.extraEnv": {
        "PKG_CONFIG_ALLOW_SYSTEM_LIBS": "1",
        "PKG_CONFIG_ALLOW_SYSTEM_CFLAGS": "1",
        "PKG_CONFIG_PATH": "/opt/homebrew/lib/pkgconfig:/opt/homebrew/share/pkgconfig",
        "PATH": "/usr/bin:/opt/homebrew/bin:${env:PATH}",
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}"
    },
    "rust-analyzer.cargo.extraEnv": {
        "PKG_CONFIG_ALLOW_SYSTEM_LIBS": "1",
        "PKG_CONFIG_ALLOW_SYSTEM_CFLAGS": "1",
        "PKG_CONFIG_PATH": "/opt/homebrew/lib/pkgconfig:/opt/homebrew/share/pkgconfig",
        "PATH": "/usr/bin:/opt/homebrew/bin:${env:PATH}",
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}"
    },
    // add env to integrated terminal
    "terminal.integrated.env.osx": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/screenpipe-vision/lib:${env:DYLD_LIBRARY_PATH}",
        "SCREENPIPE_APP_DEV": "true",
    },
    "rust-analyzer.cargo.features": [
        "pipes"
    ],
    "rust-analyzer.cargo.runBuildScripts": true,
    "rust-analyzer.checkOnSave.command": "clippy",
    "rust-analyzer.checkOnSave.extraArgs": [
        "--features",
        "pipes"
    ],
    "rust-analyzer.cargo.allFeatures": false,
    "rust-analyzer.cargo.noDefaultFeatures": false
}
```


## other hacks

### running dev + prod in the same time

one command i keep using to avoid having to kill my main "production" process is:

```bash
./target/release/screenpipe --port 3035 --data-dir /tmp/sp
```

it will avoid conflicts with the port and avoid conflicts with the data dir

especially useful if you've done new database migrations and want to avoid breaking your previous months of data :)

on macos the /tmp dir keeps being cleaned up by the system fyi

### debugging github action

ssh into the runner:

```yaml
- name: Setup tmate session # HACK
  if: matrix.platform == 'windows-latest'
  uses: mxschmitt/action-tmate@v3
```

run locally: https://github.com/nektos/act


### debugging memory errors

```bash
RUSTFLAGS="-Z sanitizer=address" cargo run --bin screenpipe
# or
RUSTFLAGS="-Z sanitizer=leak" cargo run --bin screenpipe
```

for performance monitoring, you can use the following command:

```bash
cargo install cargo-instruments
# tracking leaks over 60 minutes time limit
cargo instruments -t Leaks --bin screenpipe --features metal --time-limit 600000 --open
```

then open the file in `target/release/instruments` using xcode -> open developer tool -> instruments.


### benchmarks

```
cargo bench
```

[check benchmark visuals](https://mediar-ai.github.io/screenpipe/dev/bench/)

### creating new migrations

```bash
cargo install sqlx-cli
sqlx migrate add <migration_name>
```

### set up azure ubuntu vm with display & audio

```bash
# Set variables
RG_NAME="my-avd-rgg"
LOCATION="westus2" 
VM_NAME="ubuntu-avd"
IMAGE="Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest"
VM_SIZE="Standard_D2s_v3"  

# Create resource group
az group create --name $RG_NAME --location $LOCATION

# Create VM
az vm create \
  --resource-group $RG_NAME \
  --name $VM_NAME \
  --image $IMAGE \
  --admin-username azureuser \
  --generate-ssh-keys \
  --size $VM_SIZE

# Enable RDP
az vm open-port --port 3389 --resource-group $RG_NAME --name $VM_NAME

# Install xrdp, audio, and desktop environment
az vm run-command invoke \
  --resource-group $RG_NAME \
  --name $VM_NAME \
  --command-id RunShellScript \
  --scripts "
    sudo apt update && sudo apt install -y xrdp ubuntu-desktop pulseaudio
    sudo systemctl enable xrdp
    sudo adduser xrdp ssl-cert
    echo 'startxfce4' | sudo tee /etc/xrdp/startwm.sh
    sudo systemctl restart xrdp
    sudo ufw allow 3389/tcp
  "

# Enable audio redirection
az vm run-command invoke \
  --resource-group $RG_NAME \
  --name $VM_NAME \
  --command-id RunShellScript \
  --scripts "
    echo 'load-module module-native-protocol-tcp auth-anonymous=1' | sudo tee -a /etc/pulse/default.pa
    sudo systemctl restart pulseaudio
  "

# Get IP address
IP=$(az vm list-ip-addresses --resource-group $RG_NAME --name $VM_NAME --output table | grep -oE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" | head -1)

# Now you can open Microsoft Remote Desktop and use the IP in new PC to connect to it

# RDP into the VM
ssh azureuser@$IP

# Forwarding port to local 
ssh -L 13389:localhost:3389 azureuser@$IP

# Changing password
az vm user update \
  --resource-group $RG_NAME \
  --name $VM_NAME \
  --username azureuser \
  --password <new-password>
```

now you can either dev screenpipe on linux or run screenpipe in the cloud that record your local macos. make sure to configure microsoft remote desktop to forward audio


## join the community

say 👋 in our [public discord channel](https://discord.gg/du9ebuw7uq). we discuss how to bring this lib to production, help each other with contributions, personal projects or just hang out ☕.

thank you for contributing to screen pipe! 🎉
