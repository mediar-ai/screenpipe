#[allow(clippy::module_inception)]
#[cfg(feature = "pipes")]
mod pipes {
    use deno_ast::MediaType;
    use deno_ast::ParseParams;
    use deno_ast::SourceTextInfo;
    use deno_core::error::AnyError;
    use deno_core::extension;
    use deno_core::op2;
    use deno_core::v8;
    use deno_core::ModuleLoadResponse;
    use deno_core::ModuleSourceCode;
    use lettre::message::header::ContentType;
    use regex::Regex;
    use reqwest::header::HeaderMap;
    use reqwest::header::HeaderValue;
    use reqwest::header::CONTENT_TYPE;
    use std::collections::HashMap;
    use std::env;
    use std::path::PathBuf;
    use std::rc::Rc;
    use tracing::debug;

    use reqwest::Client;
    use serde_json::Value;

    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};
    use reqwest;
    use std::path::Path;
    use tracing::{error, info};
    use url::Url;

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

    #[op2]
    #[string]
    fn op_get_env(#[string] key: String) -> Option<String> {
        env::var(&key).ok()
    }

    #[op2(async)]
    #[string]
    async fn op_fetch(
        #[string] url: String,
        #[serde] options: Option<Value>,
    ) -> anyhow::Result<String, AnyError> {
        let client = Client::new();
        let mut request = client.get(&url);

        if let Some(opts) = options {
            if let Some(method) = opts.get("method").and_then(|m| m.as_str()) {
                request = match method.to_uppercase().as_str() {
                    "GET" => client.get(&url),
                    "POST" => client.post(&url),
                    "PUT" => client.put(&url),
                    "DELETE" => client.delete(&url),
                    // Add other methods as needed
                    _ => return Err(anyhow::anyhow!("Unsupported HTTP method")),
                };
            }

            if let Some(headers) = opts.get("headers").and_then(|h| h.as_object()) {
                for (key, value) in headers {
                    if let Some(value_str) = value.as_str() {
                        request = request.header(key, value_str);
                    }
                }
            }

            if let Some(body) = opts.get("body").and_then(|b| b.as_str()) {
                request = request.body(body.to_string());
            }
        }

        let response = match request.send().await {
            Ok(resp) => resp,
            Err(e) => return Err(anyhow::anyhow!(e)),
        };

        let status = response.status();
        let headers = response.headers().clone();
        let text = match response.text().await {
            Ok(t) => t,
            Err(e) => return Err(anyhow::anyhow!(e)),
        };

        let result = serde_json::json!({
            "status": status.as_u16(),
            "statusText": status.to_string(),
            "headers": headers.iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect::<HashMap<String, String>>(),
            "text": text,
        });

        Ok(result.to_string())
    }

    #[op2(async)]
    #[string]
    async fn op_read_file(#[string] path: String) -> anyhow::Result<String, AnyError> {
        let current_dir = std::env::current_dir()?;
        let full_path = current_dir.join(path);
        tokio::fs::read_to_string(&full_path).await.map_err(|e| {
            error!("Failed to read file '{}': {}", full_path.display(), e);
            AnyError::from(e)
        })
    }

    #[op2(async)]
    #[string]
    async fn op_write_file(
        #[string] path: String,
        #[string] contents: String,
    ) -> anyhow::Result<(), AnyError> {
        tokio::fs::write(&path, contents).await.map_err(|e| {
            error!("Failed to write file '{}': {}", path, e);
            AnyError::from(e)
        })
    }

    #[op2(async)]
    #[serde]
    async fn op_readdir(#[string] path: String) -> anyhow::Result<Vec<String>, AnyError> {
        let mut entries = tokio::fs::read_dir(&path).await?;
        let mut file_names = Vec::new();
        while let Some(entry) = entries.next_entry().await? {
            if let Some(file_name) = entry.file_name().to_str() {
                file_names.push(file_name.to_string());
            }
        }
        Ok(file_names)
    }

    #[op2(async)]
    #[string]
    async fn op_fetch_get(#[string] url: String) -> anyhow::Result<String, AnyError> {
        let response = reqwest::get(&url).await?;
        let status = response.status();
        let text = response.text().await?;

        if !status.is_success() {
            error!("HTTP error status: {}, text: {}", status, text);
            return Err(AnyError::msg(format!(
                "HTTP error status: {}, text: {}",
                status, text
            )));
        }

        Ok(text)
    }

    #[op2(async)]
    #[string]
    async fn op_fetch_post(
        #[string] url: String,
        #[string] body: String,
    ) -> anyhow::Result<String, AnyError> {
        let client = reqwest::Client::new();

        // Create a HeaderMap and add the Content-Type header
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let response = client.post(&url).headers(headers).body(body).send().await?;

        let status = response.status();
        let text = response.text().await?;

        if !status.is_success() {
            error!("HTTP error status: {}, text: {}", status, text);
            return Err(AnyError::msg(format!(
                "HTTP error status: {}, text: {}",
                status, text
            )));
        }

        Ok(text)
    }

    #[op2(async)]
    async fn op_set_timeout(delay: f64) -> anyhow::Result<(), AnyError> {
        tokio::time::sleep(std::time::Duration::from_millis(delay as u64)).await;
        Ok(())
    }

    #[op2(fast)]
    fn op_remove_file(#[string] path: String) -> anyhow::Result<()> {
        std::fs::remove_file(path)?;
        Ok(())
    }

    #[op2(async)]
    #[string]
    async fn op_send_email(
        #[string] to: String,
        #[string] from: String,
        #[string] password: String,
        #[string] subject: String,
        #[string] body: String,
        #[string] content_type: String,
    ) -> anyhow::Result<String, AnyError> {
        let email = Message::builder()
            .from(from.parse()?)
            .to(to.parse()?)
            .subject(subject)
            .header(ContentType::parse(content_type.as_str())?)
            .body(body)?;

        let creds = Credentials::new(from.clone(), password);

        let mailer = SmtpTransport::relay("smtp.gmail.com")?
            .credentials(creds)
            .build();

        match mailer.send(&email) {
            Ok(_) => Ok("Email sent successfully".to_string()),
            Err(e) => Err(anyhow::anyhow!("Could not send email: {:?}", e)),
        }
    }

    #[op2(async)]
    async fn op_create_dir(#[string] path: String) -> anyhow::Result<(), AnyError> {
        tokio::fs::create_dir_all(&path).await.map_err(|e| {
            error!("Failed to create directory '{}': {}", path, e);
            AnyError::from(e)
        })
    }

    struct TsModuleLoader;

    impl deno_core::ModuleLoader for TsModuleLoader {
        fn resolve(
            &self,
            specifier: &str,
            referrer: &str,
            _kind: deno_core::ResolutionKind,
        ) -> Result<deno_core::ModuleSpecifier, AnyError> {
            deno_core::resolve_import(specifier, referrer).map_err(|e| e.into())
        }

        fn load(
            &self,
            module_specifier: &deno_core::ModuleSpecifier,
            _maybe_referrer: Option<&reqwest::Url>,
            _is_dyn_import: bool,
            _requested_module_type: deno_core::RequestedModuleType,
        ) -> ModuleLoadResponse {
            let module_specifier = module_specifier.clone();

            let module_load = Box::pin(async move {
                let path = module_specifier.to_file_path().unwrap();

                let media_type = MediaType::from_path(&path);
                let (module_type, should_transpile) = match MediaType::from_path(&path) {
                    MediaType::JavaScript | MediaType::Mjs | MediaType::Cjs => {
                        (deno_core::ModuleType::JavaScript, false)
                    }
                    MediaType::Jsx => (deno_core::ModuleType::JavaScript, true),
                    MediaType::TypeScript
                    | MediaType::Mts
                    | MediaType::Cts
                    | MediaType::Dts
                    | MediaType::Dmts
                    | MediaType::Dcts
                    | MediaType::Tsx => (deno_core::ModuleType::JavaScript, true),
                    MediaType::Json => (deno_core::ModuleType::Json, false),
                    _ => panic!("Unknown extension {:?}", path.extension()),
                };

                let code = std::fs::read_to_string(&path)?;
                let code = if should_transpile {
                    let parsed = deno_ast::parse_module(ParseParams {
                        specifier: module_specifier.clone(),
                        text_info: SourceTextInfo::from_string(code),
                        media_type,
                        capture_tokens: false,
                        scope_analysis: false,
                        maybe_syntax: None,
                    })?;
                    parsed
                        .transpile(&Default::default(), &Default::default())?
                        .into_source()
                        .text
                } else {
                    code
                };
                let module = deno_core::ModuleSource::new(
                    module_type,
                    ModuleSourceCode::String(code.into()),
                    &module_specifier,
                    None,
                );
                Ok(module)
            });

            ModuleLoadResponse::Async(module_load)
        }
    }

    static RUNTIME_SNAPSHOT: &[u8] =
        include_bytes!(concat!(env!("OUT_DIR"), "/RUNJS_SNAPSHOT.bin"));

    extension! {
        runjs,
        ops = [
            op_read_file,
            op_write_file,
            op_remove_file,
            op_readdir,
            op_create_dir,

            op_fetch_get,
            op_fetch_post,
            op_set_timeout,
            op_fetch,
            op_get_env,
            op_send_email,
        ]
    }

    pub async fn run_js(
        pipe: &str,
        file_path: &str,
        screenpipe_dir: PathBuf,
    ) -> anyhow::Result<()> {
        let main_module = deno_core::resolve_path(file_path, env::current_dir()?.as_path())?;

        // Adjust these values as needed
        let max_old_space_size = 2 * 1024 * 1024 * 1024; // 2GB
        let initial_old_space_size = 512 * 1024 * 1024; // 512MB

        let platform_params =
            v8::CreateParams::default().heap_limits(initial_old_space_size, max_old_space_size);

        let mut js_runtime = deno_core::JsRuntime::new(deno_core::RuntimeOptions {
            module_loader: Some(Rc::new(TsModuleLoader)),
            startup_snapshot: Some(RUNTIME_SNAPSHOT),
            create_params: Some(platform_params),
            extensions: vec![runjs::init_ops()],
            v8_platform: Some(v8::new_default_platform(0, false).make_shared()),
            ..Default::default()
        });

        // set some metadata on the runtime
        js_runtime.execute_script("main", "globalThis.metadata = { }")?;
        // set the pipe id
        js_runtime.execute_script("main", format!("globalThis.metadata.id = '{}'", pipe))?;

        // initialize process.env
        js_runtime.execute_script("main", "globalThis.process = { env: {} }")?;

        for (key, value) in env::vars() {
            if key.starts_with("SCREENPIPE_") {
                let escaped_value = value.replace('\\', "\\\\").replace('\"', "\\\"");
                js_runtime.execute_script(
                    "main",
                    format!(
                        "process.env[{}] = \"{}\";",
                        serde_json::to_string(&key)?,
                        escaped_value
                    ),
                )?;
            }
        }

        // set additional environment variables
        let home_dir = dirs::home_dir().unwrap_or_default();
        let current_dir = env::current_dir()?;
        let temp_dir = env::temp_dir();

        js_runtime.execute_script(
            "main",
            format!(
                r#"
            globalThis.process.env.SCREENPIPE_DIR = "{}";
            globalThis.process.env.HOME = "{}";
            globalThis.process.env.CURRENT_DIR = "{}";
            globalThis.process.env.TEMP_DIR = "{}";
            globalThis.process.env.PIPE_ID = "{}";
            globalThis.process.env.PIPE_FILE = "{}";
            globalThis.process.env.PIPE_DIR = "{}";
            globalThis.process.env.OS = "{}";
            "#,
                screenpipe_dir
                    .to_string_lossy()
                    .replace('\\', "\\\\")
                    .replace('\"', "\\\""),
                home_dir
                    .to_string_lossy()
                    .replace('\\', "\\\\")
                    .replace('\"', "\\\""),
                current_dir
                    .to_string_lossy()
                    .replace('\\', "\\\\")
                    .replace('\"', "\\\""),
                temp_dir
                    .to_string_lossy()
                    .replace('\\', "\\\\")
                    .replace('\"', "\\\""),
                pipe.replace('\"', "\\\""),
                file_path.replace('\\', "\\\\").replace('\"', "\\\""),
                screenpipe_dir
                    .join("pipes")
                    .join(pipe)
                    .to_string_lossy()
                    .replace('\\', "\\\\")
                    .replace('\"', "\\\""),
                if cfg!(target_os = "windows") {
                    "windows"
                } else {
                    "unix"
                }
            ),
        )?;

        let mod_id = js_runtime.load_main_es_module(&main_module).await?;
        let evaluate_future = js_runtime.mod_evaluate(mod_id);

        // run the event loop and handle potential errors
        match js_runtime.run_event_loop(Default::default()).await {
            Ok(_) => (),
            Err(e) => {
                error!("error in javascript runtime event loop: {}", e);
                // you can choose to return the error or handle it differently
                // return Err(anyhow::anyhow!("javascript runtime error: {}", e));
            }
        }

        // evaluate the module and handle potential errors
        match evaluate_future.await {
            Ok(_) => Ok(()),
            Err(e) => {
                error!("error evaluating javascript module: {}", e);
                // you can choose to return the error or handle it differently
                Err(anyhow::anyhow!("javascript module evaluation error: {}", e))
            }
        }
    }

    pub async fn run_pipe(pipe: String, screenpipe_dir: PathBuf) -> anyhow::Result<()> {
        debug!(
            "Running pipe: {}, screenpipe_dir: {}",
            pipe,
            screenpipe_dir.display()
        );

        let pipe_dir = match Url::parse(&pipe) {
            Ok(_) => {
                info!("Input appears to be a URL. Attempting to download...");

                PathBuf::from(&pipe)
            }
            Err(_) => {
                info!("Input appears to be a local path. Attempting to canonicalize...");
                match screenpipe_dir.join("pipes").join(&pipe).canonicalize() {
                    Ok(path) => path,
                    Err(e) => {
                        error!("Failed to canonicalize path: {}", e);
                        anyhow::bail!("Failed to canonicalize path: {}", e);
                    }
                }
            }
        };

        info!("Pipe directory: {:?}", pipe_dir);

        let main_module = find_pipe_file(&pipe_dir)?;

        info!("Executing pipe: {:?}", main_module);

        match run_js(&pipe, &main_module.to_string_lossy(), screenpipe_dir).await {
            Ok(_) => info!("JS execution completed successfully"),
            Err(error) => {
                error!("Error during JS execution: {}", error);
                anyhow::bail!("Error during JS execution: {}", error);
            }
        }

        Ok(())
    }

    pub async fn download_pipe(source: &str, screenpipe_dir: PathBuf) -> anyhow::Result<PathBuf> {
        info!("Processing pipe from source: {}", source);

        if let Ok(parsed_url) = Url::parse(source) {
            // Handle URLs
            let client = Client::new();
            match parsed_url.host_str() {
                Some("github.com") => {
                    let api_url = get_raw_github_url(source)
                        .map_err(|e| anyhow::anyhow!("Failed to parse GitHub URL: {}", e))?;
                    let pipe_name = sanitize_pipe_name(
                        Path::new(&api_url).file_name().unwrap().to_str().unwrap(),
                    );
                    download_github_folder(&client, &api_url, screenpipe_dir, &pipe_name).await
                }
                _ => anyhow::bail!("Unsupported URL format"),
            }
        } else {
            // Handle local folders
            let source_path = Path::new(source);
            if !source_path.exists() {
                anyhow::bail!("Local source path does not exist");
            }
            if !source_path.is_dir() {
                anyhow::bail!("Local source is not a directory");
            }

            let pipe_name = sanitize_pipe_name(
                source_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("unknown_pipe"),
            );
            let dest_dir = screenpipe_dir.join("pipes").join(&pipe_name);

            tokio::fs::create_dir_all(&dest_dir).await?;
            copy_local_folder(source_path, &dest_dir).await?;

            info!("Local pipe copied successfully to: {:?}", dest_dir);
            Ok(dest_dir)
        }
    }

    async fn copy_local_folder(src: &Path, dst: &Path) -> anyhow::Result<()> {
        let mut pipe_json: Value = serde_json::json!({});
        let pipe_json_path = dst.join("pipe.json");

        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let file_type = entry.file_type()?;
            let file_name = entry.file_name();

            if file_type.is_file() {
                if let Some(file_name_str) = file_name.clone().to_str() {
                    if file_name_str == "pipe.js"
                        || file_name_str == "pipe.ts"
                        || file_name_str == "pipe.json"
                        || file_name_str == "README.md"
                    {
                        let src_path = entry.path();
                        let dst_path = dst.join(file_name);
                        tokio::fs::copy(&src_path, &dst_path).await?;
                        info!("Copied: {:?} to {:?}", src_path, dst_path);

                        if file_name_str == "pipe.json" {
                            let content = tokio::fs::read_to_string(&dst_path).await?;
                            pipe_json = serde_json::from_str(&content)?;
                        }
                    }
                }
            }
        }

        // Update pipe.json with the local source path at the root level
        // pipe_json["source"] = serde_json::json!(src.to_string_lossy().to_string());

        // Write updated pipe.json
        tokio::fs::write(&pipe_json_path, serde_json::to_string_pretty(&pipe_json)?).await?;
        info!("Updated pipe.json with local source path");

        Ok(())
    }

    async fn download_github_folder(
        client: &Client,
        api_url: &str,
        screenpipe_dir: PathBuf,
        pipe_name: &str,
    ) -> anyhow::Result<PathBuf> {
        let response = client
            .get(api_url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "screenpipe")
            .send()
            .await?;

        let contents: Value = response.json().await?;

        if !contents.is_array() {
            anyhow::bail!("Invalid response from GitHub API");
        }

        let pipe_dir = screenpipe_dir.join("pipes").join(pipe_name);

        // Check if the pipe directory already exists
        if pipe_dir.exists() {
            info!("Pipe already exists: {:?}", pipe_dir);
            return Ok(pipe_dir);
        }

        tokio::fs::create_dir_all(&pipe_dir).await?;

        let mut pipe_json: Value = serde_json::json!({});

        for item in contents.as_array().unwrap() {
            let file_name = item["name"].as_str().unwrap();
            let download_url = item["download_url"].as_str().unwrap();

            if file_name == "pipe.js"
                || file_name == "pipe.ts"
                || file_name == "pipe.json"
                || file_name == "README.md"
            {
                let file_content = client.get(download_url).send().await?.bytes().await?;
                let file_path = pipe_dir.join(file_name);
                tokio::fs::write(&file_path, &file_content).await?;
                info!("Downloaded: {:?}", file_path);

                if file_name == "pipe.json" {
                    pipe_json = serde_json::from_slice(&file_content)?;
                }
            }
        }

        // Update pipe.json with the original GitHub URL at the root level
        // let github_url = api_url_to_github_url(api_url);
        // pipe_json["source"] = serde_json::json!(github_url);

        // Write updated pipe.json
        let pipe_json_path = pipe_dir.join("pipe.json");
        tokio::fs::write(&pipe_json_path, serde_json::to_string_pretty(&pipe_json)?).await?;
        info!("updated pipe.json with source url");

        info!("Pipe downloaded successfully to: {:?}", pipe_dir);
        Ok(pipe_dir)
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
        for entry in std::fs::read_dir(pipe_dir)? {
            let entry = entry?;
            let file_name = entry.file_name();
            let file_name_str = file_name.to_str().unwrap();
            if file_name_str == "pipe.js" || file_name_str == "pipe.ts" {
                return Ok(entry.path());
            }
        }
        anyhow::bail!("No pipe.js/pipe.ts found in the pipe/dist directory")
    }
}

#[cfg(feature = "pipes")]
pub use pipes::*;
