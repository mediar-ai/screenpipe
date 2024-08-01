use base64;
use deno_core::JsRuntime;
use reqwest;
use serde_json::Value;
use tokio;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // github repo details
    let owner = "louis030195";
    let repo = "experimental";
    let branch = "main";

    // github api url
    let url = format!(
        "https://api.github.com/repos/{}/{}/contents/main.js?ref={}",
        owner, repo, branch
    );

    // send request to github api
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "rust-github-js-runner")
        .send()
        .await
        .map_err(|e| format!("failed to send request: {}", e))
        .unwrap()
        .json::<Value>()
        .await
        .map_err(|e| format!("failed to parse json response: {}", e))
        .unwrap();

    // get js content
    let content = resp["content"].as_str().ok_or_else(|| {
        anyhow::anyhow!(
            "couldn't get js content: 'content' field not found or not a string. response: {:?}",
            resp
        )
    })?;

    println!("Raw content: {}", content);

    let js_code = match base64::decode(content) {
        Ok(decoded) => String::from_utf8(decoded).map_err(anyhow::Error::from)?,
        Err(e) => {
            eprintln!("base64 decode error: {}", e);
            eprintln!(
                "first 100 chars of content: {}",
                &content[..100.min(content.len())]
            );
            return Err(anyhow::Error::from(e));
        }
    };

    println!("Decoded JS code: {}", js_code);

    // run js code using deno
    let mut runtime = JsRuntime::new(Default::default());

    let result = runtime.execute_script("main.js", js_code.clone()).unwrap();

    println!("execution result: {:?}", result);
    Ok(())
}
