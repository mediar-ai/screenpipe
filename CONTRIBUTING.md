# Contributing to Screen Pipe

First off, thank you for considering contributing to Screen Pipe! It's people like you that make Screen Pipe such a great tool.

I'd love to personnally onboard you to the project. Let's [schedule a call](https://cal.com/louis030195/screenpipe).

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

### Creating new migrations

```bash
cargo install sqlx-cli
sqlx migrate add <migration_name>
```




## Join the Community

Say 👋 in our [public Discord channel](https://discord.gg/dU9EBuw7Uq). We discuss how to bring this lib to production, help each other with contributions, personal projects or just hang out ☕.

Thank you for contributing to Screen Pipe! 🎉

