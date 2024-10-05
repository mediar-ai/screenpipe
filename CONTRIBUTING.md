# Contributing to Screen Pipe

First off, thank you for considering contributing to Screen Pipe! It's people like you that make Screen Pipe such a great tool.

I'd love to personally onboard you to the project. Let's [schedule a call](https://cal.com/louis030195/screenpipe).

## Getting Started

Before you begin:
- Make sure you have installed all the necessary dependencies as mentioned in the [README.md](README.md).
- Familiarize yourself with the project structure and architecture.

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for Screen Pipe. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

- Use a clear and descriptive title for the issue to identify the problem.
- Describe the exact steps which reproduce the problem in as many details as possible.
- Provide specific examples to demonstrate the steps.

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for Screen Pipe, including completely new features and minor improvements to existing functionality.

- Use a clear and descriptive title for the issue to identify the suggestion.
- Provide a step-by-step description of the suggested enhancement in as many details as possible.
- Explain why this enhancement would be useful to most Screen Pipe users.

### Pull Requests

- Fill in the required template
- Do not include issue numbers in the PR title
- Include screenshots and animated GIFs in your pull request whenever possible.
- Follow the Rust styleguides.
- End all files with a newline.

## Styleguides

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

### Rust Styleguide

All Rust code must adhere to [Rust Style Guide](https://github.com/rust-lang/style-team/blob/master/guide/guide.md).

We follow [this](https://doc.rust-lang.org/cargo/guide/project-layout.html) folder structure.

## Additional Notes

### AI system prompt

I use cursor with this prompt to help me with the code:

```
Rules:
- Coding: always use lower case for logging stuff or UI
- Coding: Rust: always use anyhow error, tokio instead of std stuff, avoid mutex if you can, prefer channels, write code easy to read for humans, fast for machines
- Coding: when i ask to give me the full code it means FULL, no fucking // rest of the code comments GIVE ME THE FULL CODE
- Coding: if it seems like you lack some context about a niche lib just ask me to provide the source code and i will (instead of providing a bad answer)
- Coding: NextJS: make sure to use tailwind, typescript, shadcn, lucide, magicui, and framer-motion to make UIs amazing
- Coding: Make sure to escape html thing like quotes etc properly. Only when necessary
- Coding: When writing react or html code make sure to use thing like &apos; instead of ". Only when necessary (e.g inside quote themselves)
```


### Principles 

- **User fanatic: focus on building what people want and making users happy.**
- Concurrency: channels > mutexes/locks
- Simplicity: avoid premature optimization. less is more. optimise for less code, less files, less dependencies, less complexity.
- Focus: avoid feature creep. focus on the core functionality and build upon it. focus on the user and their needs.
- Use numbers: if you can't measure it, you can't improve it.
- Avoid OOP: prefer functional programming.

### Issue and Pull Request Labels

This section lists the labels we use to help us track and manage issues and pull requests.

* `bug` - Issues that are bugs.
* `enhancement` - Issues that are feature requests.
* `documentation` - Issues or pull requests related to documentation.
* `good first issue` - Good for newcomers.

## Building

```bash
cargo build --release --features metal # or cuda, depending on your computer's NPU
```

## Running Tests

Before submitting a pull request, run all the tests to ensure nothing has broken:

```bash
cargo test
# on macos you need to set DYLD_LIBRARY_PATH for apple native OCR tests to run
DYLD_LIBRARY_PATH=$(pwd)/screenpipe-vision/lib cargo test
```

You can add env var to `.vscode/settings.json`:

```json
{
    "terminal.integrated.env.osx": {
        "DYLD_LIBRARY_PATH": "$(pwd)/screenpipe-vision/lib"
    }
}
```

This is @louis030195 whole `.vscode/settings.json` file:

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


## Other hacks

### Debugging memory errors

```bash
RUSTFLAGS="-Z sanitizer=address" cargo run --bin screenpipe
# or
RUSTFLAGS="-Z sanitizer=leak" cargo run --bin screenpipe
```

For performance monitoring, you can use the following command:

```bash
cargo install cargo-instruments
# tracking leaks over 60 minutes time limit
cargo instruments -t Leaks --bin screenpipe --features metal --time-limit 600000 --open
```

Then open the file in `target/release/instruments` using Xcode -> Open Developer Tool -> Instruments.


### Benchmarks

```
cargo bench
```

[Check benchmark visuals](https://mediar-ai.github.io/screenpipe/dev/bench/)

### Creating new migrations

```bash
cargo install sqlx-cli
sqlx migrate add <migration_name>
```

### Set up Azure Ubuntu VM with display & audio

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

Now you can either dev screenpipe on Linux or run screenpipe in the cloud that record your local MacOS. Make sure to configure Microsoft Remote Desktop to forward audio


## Join the Community

Say 👋 in our [public Discord channel](https://discord.gg/dU9EBuw7Uq). We discuss how to bring this lib to production, help each other with contributions, personal projects or just hang out ☕.

Thank you for contributing to Screen Pipe! 🎉

