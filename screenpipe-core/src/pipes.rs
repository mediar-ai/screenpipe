#[allow(clippy::module_inception)]
#[cfg(feature = "pipes")]
mod pipes {
    use regex::Regex;
    use std::future::Future;
    use std::path::PathBuf;
    use std::pin::Pin;
    use tokio::process::Command;

    use reqwest::Client;
    use serde_json::Value;

    use anyhow::Result;
    use reqwest;
    use std::fs;
    use std::path::Path;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tracing::{debug, error, info};
    use url::Url;
    use which::which;

    // Add these imports at the top of the file
    use serde_json::json;
    use tokio::fs::File;
    use tokio::io::AsyncWriteExt;

    use crate::pick_unused_port;

    // Update this function near the top of the file
    fn sanitize_pipe_name(name: &str) -> String {
        let re = Regex::new(r"[^a-zA-Z0-9_-]").unwrap();
        let sanitized = re.replace_all(name, "-").to_string();

        // Remove "-ref-main/" suffix if it exists
        sanitized
            .strip_suffix("-ref-main/")
            .or_else(|| sanitized.strip_suffix("-ref-main"))
            .unwrap_or(&sanitized)
            .to_string()
    }

    pub async fn run_pipe(pipe: &str, screenpipe_dir: PathBuf) -> Result<Option<u16>> {
        let pipe_dir = screenpipe_dir.join("pipes").join(pipe);
        let pipe_json_path = pipe_dir.join("pipe.json");

        // Prepare environment variables
        let mut env_vars = std::env::vars().collect::<Vec<(String, String)>>();
        env_vars.push((
            "SCREENPIPE_DIR".to_string(),
            screenpipe_dir.to_str().unwrap().to_string(),
        ));
        env_vars.push(("PIPE_ID".to_string(), pipe.to_string()));
        env_vars.push((
            "PIPE_DIR".to_string(),
            pipe_dir.to_str().unwrap().to_string(),
        ));

        if pipe_json_path.exists() {
            let pipe_json = tokio::fs::read_to_string(&pipe_json_path).await?;
            let pipe_config: Value = serde_json::from_str(&pipe_json)?;

            if pipe_config["is_nextjs"] == json!(true) {
                info!("Running Next.js pipe: {}", pipe);

                // Install dependencies
                info!("Installing dependencies for Next.js pipe");
                let install_output = Command::new("deno")
                    .arg("run")
                    .arg("-A")
                    .arg("npm:npm@latest")
                    .arg("install")
                    .current_dir(&pipe_dir)
                    .output()
                    .await?;

                if !install_output.status.success() {
                    error!(
                        "Failed to install dependencies: {}",
                        String::from_utf8_lossy(&install_output.stderr)
                    );
                    anyhow::bail!("Failed to install dependencies for Next.js pipe");
                }

                // Build the Next.js project // ! broken https://github.com/denoland/deno/issues/25359
                // info!("Building Next.js project");
                // let build_output = Command::new("deno")
                //     .arg("run")
                //     .arg("-A")
                //     .arg("npm:next@latest")
                //     .arg("build")
                //     .current_dir(&pipe_dir)
                //     .output()
                //     .await?;

                // if !build_output.status.success() {
                //     error!(
                //         "Failed to build Next.js project: {}",
                //         String::from_utf8_lossy(&build_output.stderr)
                //     );
                //     anyhow::bail!("Failed to build Next.js project");
                // }

                let port = pick_unused_port().expect("No ports free");

                // Update pipe.json with the port
                let mut updated_config = pipe_config.clone();
                updated_config["port"] = json!(port);
                let updated_pipe_json = serde_json::to_string_pretty(&updated_config)?;
                let mut file = File::create(&pipe_json_path).await?;
                file.write_all(updated_pipe_json.as_bytes()).await?;

                // Add the port to the environment variables
                env_vars.push(("PORT".to_string(), port.to_string()));

                // Run the Next.js project
                // let mut child = Command::new("deno")
                //     .arg("run")
                //     .arg("-A")
                //     .arg("npm:next@latest")
                //     .arg("start")
                //     .arg("-p")
                //     .arg(port.to_string())
                //     .current_dir(&pipe_dir)
                //     .envs(env_vars)
                //     .stdout(std::process::Stdio::piped())
                //     .stderr(std::process::Stdio::piped())
                //     .spawn()?;
                let mut child = Command::new("deno")
                    .arg("task")
                    .arg("--unstable-detect-cjs")
                    .arg("dev")
                    .arg("-p")
                    .arg(port.to_string())
                    .current_dir(&pipe_dir)
                    .envs(env_vars)
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()?;

                // Stream logs
                stream_logs(pipe, &mut child).await?;

                return Ok(Some(port));
            }
        }

        // If it's not a Next.js project, run the pipe as before
        let main_module = find_pipe_file(&pipe_dir)?;

        info!("executing pipe: {:?}", main_module);

        // Add PIPE_FILE to environment variables for non-Next.js pipes
        env_vars.push((
            "PIPE_FILE".to_string(),
            main_module.to_str().unwrap().to_string(),
        ));

        // Execute Deno
        let mut child = Command::new("deno")
            .arg("run")
            .arg("--config")
            .arg(pipe_dir.join("deno.json"))
            .arg("--allow-read")
            .arg("--allow-write")
            .arg("--allow-net")
            .arg("--allow-env")
            .arg("--reload=https://raw.githubusercontent.com/mediar-ai/screenpipe/main/screenpipe-js/main.ts")
            .arg(&main_module)
            .envs(env_vars)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        // Stream logs
        stream_logs(pipe, &mut child).await?;

        Ok(None)
    }

    async fn stream_logs(pipe: &str, child: &mut tokio::process::Child) -> Result<()> {
        let stdout = child.stdout.take().expect("failed to get stdout");
        let stderr = child.stderr.take().expect("failed to get stderr");

        let pipe_clone = pipe.to_string();

        // Spawn tasks to handle stdout and stderr
        let stdout_handle = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                info!("[pipe][info][{}] {}", pipe_clone, line);
            }
        });

        let pipe_clone = pipe.to_string();

        let stderr_handle = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.contains("Download") || line.starts_with("Task dev ") {
                    // Log download messages and task start messages as info instead of error
                    debug!("[pipe][info][{}] {}", pipe_clone, line);
                } else {
                    // Keep other messages as errors
                    error!("[pipe][error][{}] {}", pipe_clone, line);
                }
            }
        });

        // Wait for the child process to finish
        let status = child.wait().await?;

        // Wait for the output handling tasks to finish
        stdout_handle.await?;
        stderr_handle.await?;

        if !status.success() {
            anyhow::bail!("pipe execution failed with status: {}", status);
        }

        info!("pipe execution completed successfully");
        Ok(())
    }

    pub async fn download_pipe(source: &str, screenpipe_dir: PathBuf) -> anyhow::Result<PathBuf> {
        info!("Processing pipe from source: {}", source);

        let pipe_name =
            sanitize_pipe_name(Path::new(source).file_name().unwrap().to_str().unwrap());
        let dest_dir = screenpipe_dir.join("pipes").join(&pipe_name);

        debug!("Destination directory: {:?}", dest_dir);

        let pipe_json_path = dest_dir.join("pipe.json");
        let existing_pipe_json = if pipe_json_path.exists() {
            debug!("Existing pipe.json found");
            Some(tokio::fs::read_to_string(&pipe_json_path).await?)
        } else {
            debug!("No existing pipe.json found");
            None
        };

        tokio::fs::create_dir_all(&dest_dir).await?;
        debug!("Created destination directory");

        if let Ok(parsed_url) = Url::parse(source) {
            debug!("Source is a URL: {}", parsed_url);
            if parsed_url.host_str() == Some("github.com") {
                download_github_folder(&parsed_url, &dest_dir).await?;
            } else {
                anyhow::bail!("Unsupported URL format");
            }
        } else {
            debug!("Source is a local path");
            let source_path = Path::new(source);
            if !source_path.exists() {
                error!("Local source path does not exist: {:?}", source_path);
                anyhow::bail!("Local source path does not exist");
            }
            if !source_path.is_dir() {
                error!("Local source is not a directory: {:?}", source_path);
                anyhow::bail!("Local source is not a directory");
            }

            debug!(
                "Copying local folder from {:?} to {:?}",
                source_path, dest_dir
            );
            copy_dir_all(source_path, &dest_dir).await?;
            info!("Copied local folder: {:?} to {:?}", source_path, dest_dir);
        }

        // After downloading/copying the pipe, check if it's a Next.js project
        let package_json_path = dest_dir.join("package.json");
        if package_json_path.exists() {
            let package_json = tokio::fs::read_to_string(&package_json_path).await?;
            let package_data: Value = serde_json::from_str(&package_json)?;

            if package_data["dependencies"].get("next").is_some() {
                info!("Detected Next.js project, setting up for production");

                // Run npm install
                let mut install_child = Command::new("deno")
                    .arg("run")
                    .arg("-A")
                    .arg("npm:npm@latest")
                    .arg("install")
                    .current_dir(&dest_dir)
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()?;

                // Stream logs for npm install
                stream_logs("npm install", &mut install_child).await?;

                // Run next build // ! broken https://github.com/denoland/deno/issues/25359
                // let mut build_child = Command::new("deno")
                //     .arg("run")
                //     .arg("-A")
                //     .arg("npm:next@latest")
                //     .arg("build")
                //     .current_dir(&dest_dir)
                //     .stdout(std::process::Stdio::piped())
                //     .stderr(std::process::Stdio::piped())
                //     .spawn()?;

                // // Stream logs for next build
                // stream_logs("next build", &mut build_child).await?;

                // Update pipe.json to indicate it's a Next.js project
                let mut pipe_config = if let Some(existing_json) = existing_pipe_json {
                    serde_json::from_str(&existing_json)?
                } else if pipe_json_path.exists() {
                    let pipe_json = tokio::fs::read_to_string(&pipe_json_path).await?;
                    serde_json::from_str(&pipe_json)?
                } else {
                    json!({})
                };

                pipe_config["is_nextjs"] = json!(true);
                let updated_pipe_json = serde_json::to_string_pretty(&pipe_config)?;
                let mut file = File::create(&pipe_json_path).await?;
                file.write_all(updated_pipe_json.as_bytes()).await?;
            }
        }

        info!("pipe copied successfully to: {:?}", dest_dir);
        Ok(dest_dir)
    }

    async fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> anyhow::Result<()> {
        let src = src.as_ref();
        let dst = dst.as_ref();
        debug!("copy_dir_all: src={:?}, dst={:?}", src, dst);

        tokio::fs::create_dir_all(&dst).await?;
        debug!("Created destination directory: {:?}", dst);

        let mut entries = tokio::fs::read_dir(src).await?;
        debug!("Reading source directory: {:?}", src);

        while let Some(entry) = entries.next_entry().await? {
            let ty = entry.file_type().await?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());

            debug!("Processing entry: {:?}", src_path);

            if should_ignore(&entry.file_name()) {
                debug!("Skipping ignored file/directory: {:?}", entry.file_name());
                continue;
            }

            if ty.is_dir() {
                debug!("Entry is a directory, recursing: {:?}", src_path);
                copy_dir_all_boxed(src_path, dst_path).await?;
            } else {
                debug!("Copying file: {:?} to {:?}", src_path, dst_path);
                tokio::fs::copy(&src_path, &dst_path).await?;
            }
        }

        debug!("Finished copying directory: {:?}", src);
        Ok(())
    }

    fn copy_dir_all_boxed(
        src: impl AsRef<Path> + Send + 'static,
        dst: impl AsRef<Path> + Send + 'static,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send>> {
        Box::pin(copy_dir_all(src, dst))
    }

    fn should_ignore(file_name: &std::ffi::OsStr) -> bool {
        let ignore_list = [
            "node_modules",
            ".git",
            ".next",
            "dist",
            "build",
            ".DS_Store",
            "Thumbs.db",
            ".env",
            ".env.local",
            ".env.development.local",
            ".env.test.local",
            ".env.production.local",
        ];

        ignore_list.iter().any(|ignored| file_name == *ignored)
            || file_name.to_str().map_or(false, |s| s.starts_with('.'))
    }

    async fn download_github_folder(url: &Url, dest_dir: &Path) -> anyhow::Result<()> {
        let client = Client::new();
        let api_url = get_raw_github_url(url.as_str())?;

        let response = client
            .get(&api_url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "screenpipe")
            .send()
            .await?;

        let contents: Value = response.json().await?;

        if !contents.is_array() {
            anyhow::bail!("invalid response from github api");
        }

        for item in contents.as_array().unwrap() {
            let file_name = item["name"].as_str().unwrap();
            if !is_hidden_file(std::ffi::OsStr::new(file_name)) {
                let download_url = item["download_url"].as_str().unwrap();
                let file_content = client.get(download_url).send().await?.bytes().await?;
                let file_path = dest_dir.join(file_name);
                tokio::fs::write(&file_path, &file_content).await?;
                info!("downloaded: {:?}", file_path);
            } else {
                info!("skipping hidden file: {}", file_name);
            }
        }

        Ok(())
    }

    fn get_raw_github_url(url: &str) -> anyhow::Result<String> {
        info!("Attempting to get raw GitHub URL for: {}", url);
        let parsed_url = Url::parse(url)?;
        if parsed_url.host_str() == Some("github.com") {
            let path_segments: Vec<&str> = parsed_url.path_segments().unwrap().collect();
            if path_segments.len() >= 5 && path_segments[2] == "tree" {
                let (owner, repo, _, branch) = (
                    path_segments[0],
                    path_segments[1],
                    path_segments[2],
                    path_segments[3],
                );
                let raw_path = path_segments[4..].join("/");
                let raw_url = format!(
                    "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
                    owner, repo, raw_path, branch
                );
                info!("Converted to GitHub API URL: {}", raw_url);
                return Ok(raw_url);
            }
        }
        anyhow::bail!("Invalid GitHub URL format")
    }

    fn find_pipe_file(pipe_dir: &Path) -> anyhow::Result<PathBuf> {
        for entry in fs::read_dir(pipe_dir)? {
            let entry = entry?;
            let file_name = entry.file_name();
            let file_name_str = file_name.to_str().unwrap();
            if (file_name_str == "pipe.js" || file_name_str == "pipe.ts")
                && !is_hidden_file(&file_name)
            {
                return Ok(entry.path());
            }
        }
        anyhow::bail!("No pipe.js/pipe.ts found in the pipe/dist directory")
    }

    fn is_hidden_file(file_name: &std::ffi::OsStr) -> bool {
        file_name
            .to_str()
            .map(|s| s.starts_with('.') || s == "Thumbs.db")
            .unwrap_or(false)
    }

    #[cfg(not(windows))]
    const DENO_EXECUTABLE_NAME: &str = "deno";

    #[cfg(windows)]
    const DENO_EXECUTABLE_NAME: &str = "deno.exe";

    pub fn find_deno() -> Option<PathBuf> {
        debug!("starting search for deno executable");

        // check if `deno` is in the PATH environment variable
        if let Ok(path) = which(DENO_EXECUTABLE_NAME) {
            debug!("found deno in PATH: {:?}", path);
            return Some(path);
        }
        debug!("deno not found in PATH");

        // check in current working directory
        if let Ok(cwd) = std::env::current_dir() {
            debug!("current working directory: {:?}", cwd);
            let deno_in_cwd = cwd.join(DENO_EXECUTABLE_NAME);
            if deno_in_cwd.is_file() && deno_in_cwd.exists() {
                debug!("found deno in current working directory: {:?}", deno_in_cwd);
                return Some(deno_in_cwd);
            }
            debug!("deno not found in current working directory");
        }

        // check in the same folder as the executable
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_folder) = exe_path.parent() {
                debug!("executable folder: {:?}", exe_folder);
                let deno_in_exe_folder = exe_folder.join(DENO_EXECUTABLE_NAME);
                if deno_in_exe_folder.exists() {
                    debug!("found deno in executable folder: {:?}", deno_in_exe_folder);
                    return Some(deno_in_exe_folder);
                }
                debug!("deno not found in executable folder");

                // platform-specific checks
                #[cfg(target_os = "macos")]
                {
                    let resources_folder = exe_folder.join("../Resources");
                    debug!("resources folder: {:?}", resources_folder);
                    let deno_in_resources = resources_folder.join(DENO_EXECUTABLE_NAME);
                    if deno_in_resources.exists() {
                        debug!("found deno in resources folder: {:?}", deno_in_resources);
                        return Some(deno_in_resources);
                    }
                    debug!("deno not found in resources folder");
                }

                #[cfg(target_os = "linux")]
                {
                    let lib_folder = exe_folder.join("lib");
                    debug!("lib folder: {:?}", lib_folder);
                    let deno_in_lib = lib_folder.join(DENO_EXECUTABLE_NAME);
                    if deno_in_lib.exists() {
                        debug!("found deno in lib folder: {:?}", deno_in_lib);
                        return Some(deno_in_lib);
                    }
                    debug!("deno not found in lib folder");
                }
            }
        }

        error!("deno not found");
        None // return None if deno is not found
    }
}

#[cfg(feature = "pipes")]
pub use pipes::*;
