// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Environment the AppImage runtime exports for its own use and that must not
//! reach the processes screenpipe spawns.
//!
//! The type-2 AppImage runtime exports `ARGV0` (the AppImage path). zsh treats
//! an exported `ARGV0` as the `argv[0]` for every external command it runs, so
//! a pipe's `zsh -ilc` shell started every command under the AppImage's name.
//! Multi-call binaries then picked the wrong personality: `but completions zsh`
//! in a user's `.zshrc` opened the GitButler GUI instead of printing
//! completions. screenpipe never reads `ARGV0`, so it is removed once at
//! startup and every child inherits a clean environment.

const APPIMAGE_ONLY_VARS: &[&str] = &["ARGV0"];

pub fn configure() {
    for key in APPIMAGE_ONLY_VARS {
        std::env::remove_var(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn children_do_not_inherit_argv0() {
        std::env::set_var("ARGV0", "/tmp/screenpipe_test.AppImage");
        configure();
        assert!(std::env::var_os("ARGV0").is_none());

        let out = std::process::Command::new("sh")
            .arg("-c")
            .arg("printf %s \"${ARGV0-unset}\"")
            .output()
            .expect("spawn sh");
        assert_eq!(String::from_utf8_lossy(&out.stdout), "unset");
    }
}
