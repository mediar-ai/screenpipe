#[cfg(feature = "pipes")]
mod pipes {
    use deno_ast::MediaType;
    use deno_ast::ParseParams;
    use deno_ast::SourceTextInfo;
    use deno_core::error::AnyError;
    use deno_core::extension;
    use deno_core::op2;
    use deno_core::ModuleLoadResponse;
    use deno_core::ModuleSourceCode;
    use log::error;
    use reqwest::header::HeaderMap;
    use reqwest::header::HeaderValue;
    use reqwest::header::CONTENT_TYPE;
    use std::collections::HashMap;
    use std::env;
    use std::rc::Rc;

    use reqwest::Client;
    use serde_json::Value;

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
    ) -> anyhow::Result<String> {
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
    async fn op_read_file(#[string] path: String) -> anyhow::Result<String> {
        tokio::fs::read_to_string(&path).await.map_err(|e| {
            error!("Failed to read file '{}': {}", path, e);
            AnyError::from(e)
        })
    }

    #[op2(async)]
    #[string]
    async fn op_write_file(
        #[string] path: String,
        #[string] contents: String,
    ) -> anyhow::Result<()> {
        tokio::fs::write(&path, contents).await.map_err(|e| {
            error!("Failed to write file '{}': {}", path, e);
            AnyError::from(e)
        })
    }

    #[op2(async)]
    #[string]
    async fn op_fetch_get(#[string] url: String) -> anyhow::Result<String> {
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
    ) -> anyhow::Result<String> {
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
    async fn op_set_timeout(delay: f64) -> anyhow::Result<()> {
        tokio::time::sleep(std::time::Duration::from_millis(delay as u64)).await;
        Ok(())
    }

    #[op2(fast)]
    fn op_remove_file(#[string] path: String) -> anyhow::Result<()> {
        std::fs::remove_file(path)?;
        Ok(())
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
            op_fetch_get,
            op_fetch_post,
            op_set_timeout,
            op_fetch,
            op_get_env,
        ]
    }

    pub async fn run_js(file_path: &str) -> anyhow::Result<()> {
        let main_module = deno_core::resolve_path(file_path, env::current_dir()?.as_path())?;
        let mut js_runtime = deno_core::JsRuntime::new(deno_core::RuntimeOptions {
            module_loader: Some(Rc::new(TsModuleLoader)),
            startup_snapshot: Some(RUNTIME_SNAPSHOT),
            extensions: vec![runjs::init_ops()],
            ..Default::default()
        });

        // add all env var starting with SCREENPIPE_ to the global scope in process.env

        // first init the process.env object
        js_runtime.execute_script("main", "globalThis.process = { env: {} }")?;

        for (key, value) in env::vars() {
            if key.starts_with("SCREENPIPE_") {
                js_runtime
                    .execute_script("main", format!("process.env['{}'] = '{}'", key, value))?;
            }
        }

        let mod_id = js_runtime.load_main_es_module(&main_module).await?;
        let result = js_runtime.mod_evaluate(mod_id);
        js_runtime.run_event_loop(Default::default()).await?;
        result.await
    }
}

#[cfg(feature = "pipes")]
pub use pipes::*;
