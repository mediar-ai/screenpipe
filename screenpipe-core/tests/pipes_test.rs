#[cfg(feature = "pipes")]
#[cfg(test)]
mod tests {
    use reqwest;
    use screenpipe_core::{download_pipe, run_pipe};
    use serde_json::json;
    use std::time::Duration;
    use std::{path::PathBuf, sync::Once};
    use tempfile::TempDir;
    use tokio::fs::create_dir_all;
    use tokio::time::sleep;
    use tracing::subscriber::set_global_default;
    use tracing_subscriber::fmt::Subscriber;

    static INIT: Once = Once::new();

    fn init() {
        INIT.call_once(|| {
            let subscriber = Subscriber::builder()
                .with_env_filter("debug")
                .with_test_writer()
                .finish();
            set_global_default(subscriber).expect("Failed to set tracing subscriber");
        });
    }

    async fn setup_test_pipe(temp_dir: &TempDir, pipe_name: &str, code: &str) -> PathBuf {
        init();
        let pipe_dir = temp_dir.path().join(pipe_name);
        create_dir_all(&pipe_dir).await.unwrap();
        let file_path = pipe_dir.join("pipe.ts");
        tokio::fs::write(&file_path, code).await.unwrap();
        pipe_dir
    }

    #[tokio::test]
    #[ignore]
    async fn test_simple_pipe() {
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let code = r#"
            console.log("Hello from simple pipe!");
            const result = 2 + 3;
            console.log(`Result: ${result}`);
        "#;

        let pipe_dir = setup_test_pipe(&temp_dir, "simple_pipe", code).await;

        let result = run_pipe(&pipe_dir.to_string_lossy().to_string(), screenpipe_dir).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    #[ignore] // TODO: fix this test (not implemented yet)
    async fn test_pipe_with_http_request() {
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let code = r#"
            console.log("Fetching data from API...");
            const response = await pipe.get("https://jsonplaceholder.typicode.com/todos/1");
            console.log(JSON.stringify(response, null, 2));
        "#;

        let pipe_dir = setup_test_pipe(&temp_dir, "http_pipe", code).await;

        let result = run_pipe(&pipe_dir.to_string_lossy().to_string(), screenpipe_dir).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    #[ignore] // TODO: fix this test (not implemented yet)
    async fn test_pipe_with_error() {
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let code = r#"
            console.log("This pipe will throw an error");
            throw new Error("Intentional error");
        "#;

        let pipe_dir = setup_test_pipe(&temp_dir, "error_pipe", code).await;

        let result = run_pipe(&pipe_dir.to_string_lossy().to_string(), screenpipe_dir).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    #[ignore] // TODO: fix this test (file operations work but not in this test for some reason)
    async fn test_pipe_with_file_operations() {
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let code = r#"
            console.log("Writing to a file...");
            await pipe.writeFile("output.txt", "Hello, Screenpipe!");
            const content = await pipe.readFile("output.txt");
            console.log(`File content: ${content}`);
        "#;

        let pipe_dir = setup_test_pipe(&temp_dir, "file_pipe", code).await;

        let result = run_pipe(&pipe_dir.to_string_lossy().to_string(), screenpipe_dir).await;
        assert!(result.is_ok());

        // Verify that the file was created and contains the expected content
        let output_file = pipe_dir.join("output.txt");
        assert!(output_file.exists());
        let content = tokio::fs::read_to_string(output_file).await.unwrap();
        assert_eq!(content, "Hello, Screenpipe!");
    }

    async fn setup_test_pipe_with_config(
        temp_dir: &TempDir,
        pipe_name: &str,
        code: &str,
        config: &str,
    ) -> PathBuf {
        init();
        let pipe_dir = temp_dir.path().join("pipes").join(pipe_name);
        create_dir_all(&pipe_dir).await.unwrap();

        let ts_file_path = pipe_dir.join("pipe.ts");
        tokio::fs::write(&ts_file_path, code).await.unwrap();

        let json_file_path = pipe_dir.join("pipe.json");
        tokio::fs::write(&json_file_path, config).await.unwrap();

        pipe_dir
    }

    #[tokio::test]
    async fn test_pipe_with_config() {
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let code = r#"
            (async () => {
                await pipe.loadConfig();
                console.log("Pipe config test");
                console.log(`API Key: ${pipe.config.apiKey}`);
                console.log(`Endpoint: ${pipe.config.endpoint}`);
                if (pipe.config.apiKey !== "test-api-key" || pipe.config.endpoint !== "https://api.example.com") {
                    throw new Error("Config not loaded correctly");
                }
            })();
        "#;

        let config = json!({
            "apiKey": "test-api-key",
            "endpoint": "https://api.example.com"
        })
        .to_string();

        let pipe_dir = setup_test_pipe_with_config(&temp_dir, "config_pipe", code, &config).await;

        // Change the working directory to the pipe directory
        std::env::set_current_dir(&pipe_dir).unwrap();

        let result = run_pipe("config_pipe", screenpipe_dir).await;
        assert!(result.is_ok(), "Pipe execution failed: {:?}", result);
    }

    #[tokio::test]
    #[ignore] // Github said NO
    async fn test_download_pipe_github_folder() {
        init();
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let github_url = "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-stream-ocr-text";
        let result = download_pipe(github_url, screenpipe_dir.clone()).await;

        assert!(
            result.is_ok(),
            "Failed to download GitHub folder: {:?}",
            result
        );
        let pipe_dir = result.unwrap();
        assert!(pipe_dir.exists(), "Pipe directory does not exist");

        let has_main_or_pipe_file = std::fs::read_dir(&pipe_dir).unwrap().any(|entry| {
            let file_name = entry.unwrap().file_name().into_string().unwrap();
            (file_name.starts_with("main") || file_name.starts_with("pipe"))
                && (file_name.ends_with(".ts") || file_name.ends_with(".js"))
        });

        assert!(
            has_main_or_pipe_file,
            "No main.ts, main.js, pipe.ts, or pipe.js file found"
        );
    }

    #[tokio::test]
    async fn test_download_pipe_invalid_url() {
        init();
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let invalid_url = "https://example.com/invalid/url";
        let result = download_pipe(invalid_url, screenpipe_dir.clone()).await;

        assert!(result.is_err(), "Expected an error for invalid URL");
    }

    #[tokio::test]
    #[ignore]
    async fn test_send_email() {
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();
        let to = std::env::var("EMAIL_TO").expect("EMAIL_TO not set");
        let from = std::env::var("EMAIL_FROM").expect("EMAIL_FROM not set");
        let password = std::env::var("EMAIL_PASSWORD").expect("EMAIL_PASSWORD not set");

        println!("to: {}", to);
        println!("from: {}", from);
        println!("password: {}", password);

        // Test plain text email
        let plain_text_code = format!(
            r#"
            (async () => {{
                const result = await pipe.sendEmail({{
                    to: "{to}",
                    from: "{from}",
                    password: "{password}",
                    subject: "screenpipe test - plain text",
                    body: "yo louis, this is a plain text email test!",
                    contentType: "text/plain"
                }});
                console.log("Plain text email result:", result);
                if (!result) {{
                    throw new Error("Failed to send plain text email");
                }}
            }})();
            "#
        );

        // Test HTML email
        let html_code = format!(
            r#"
            (async () => {{
                const result = await pipe.sendEmail({{
                    to: "{to}",
                    from: "{from}",
                    password: "{password}",
                    subject: "screenpipe test - html",
                    body: `
                        <html>
                            <body>
                                <h1>yo louis, you absolute madlad!</h1>
                                <p>this is an <strong>html</strong> email test from screenpipe.</p>
                                <ul>
                                    <li>item 1</li>
                                    <li>item 2</li>
                                    <li>item 3</li>
                                </ul>
                            </body>
                        </html>
                    `,
                    contentType: "text/html"
                }});
                console.log("HTML email result:", result);
                if (!result) {{
                    throw new Error("Failed to send HTML email");
                }}
            }})();
            "#
        );

        let pipe_dir = setup_test_pipe(&temp_dir, "email_test_pipe_plain", &plain_text_code).await;
        std::env::set_current_dir(&pipe_dir).unwrap();
        let result = run_pipe(
            &pipe_dir.to_string_lossy().to_string(),
            screenpipe_dir.clone(),
        )
        .await;
        assert!(result.is_ok(), "Plain text email test failed: {:?}", result);

        let pipe_dir = setup_test_pipe(&temp_dir, "email_test_pipe_html", &html_code).await;
        std::env::set_current_dir(&pipe_dir).unwrap();
        let result = run_pipe(&pipe_dir.to_string_lossy().to_string(), screenpipe_dir).await;
        assert!(result.is_ok(), "HTML email test failed: {:?}", result);
    }

    #[tokio::test]
    #[ignore] // works when run on click in cursor but not in cli so weird haha
    async fn test_directory_functions() {
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();

        let code = r#"
        (async () => {
            // Test mkdir
            await fs.mkdir('test_dir');
            console.log('Directory created');

            // Test writeFile
            await fs.writeFile('test_dir/test_file.txt', 'Hello, World!');
            console.log('File written');

            // Test readFile
            const content = await fs.readFile('test_dir/test_file.txt');
            console.log('File content:', content);
            if (content !== 'Hello, World!') {
                throw new Error('File content mismatch');
            }

            // Test readdir
            const files = await fs.readdir('test_dir');
            console.log('Directory contents:', files);
            if (!files.includes('test_file.txt')) {
                throw new Error('File not found in directory');
            }

            // Test path.join
            const joinedPath = path.join('test_dir', 'nested', 'file.txt');
            console.log('Joined path:', joinedPath);
            const expectedPath = process.env.OS === 'windows' ? 'test_dir\\nested\\file.txt' : 'test_dir/nested/file.txt';
            if (joinedPath !== expectedPath) {
                throw new Error('Path join mismatch');
            }

            console.log('All directory function tests passed');
        })();
        "#;

        let pipe_dir = setup_test_pipe(&temp_dir, "directory_functions_test", code).await;

        // Change the working directory to the pipe directory
        std::env::set_current_dir(&pipe_dir).unwrap();

        let result = run_pipe(&pipe_dir.to_string_lossy().to_string(), screenpipe_dir).await;
        assert!(result.is_ok(), "Pipe execution failed: {:?}", result);

        // Additional checks
        let test_dir = pipe_dir.join("test_dir");
        assert!(test_dir.exists(), "Test directory was not created");

        let test_file = test_dir.join("test_file.txt");
        assert!(test_file.exists(), "Test file was not created");

        let file_content = std::fs::read_to_string(test_file).unwrap();
        assert_eq!(file_content, "Hello, World!", "File content mismatch");
    }

    #[tokio::test]
    async fn test_nextjs_pipe_app_dir() {
        println!("Starting test_nextjs_pipe_app_dir");
        init();
        let temp_dir = TempDir::new().unwrap();
        let screenpipe_dir = temp_dir.path().to_path_buf();
        println!("Temp dir created: {:?}", temp_dir.path());

        // Set up a minimal Next.js project structure with App Router
        let nextjs_pipe_dir = temp_dir.path().join("pipes").join("nextjs-test-pipe");
        tokio::fs::create_dir_all(&nextjs_pipe_dir).await.unwrap();
        println!("Next.js pipe directory created: {:?}", nextjs_pipe_dir);

        // Create package.json
        let package_json = r#"{
            "name": "nextjs-test-pipe",
            "version": "1.0.0",
            "dependencies": {
                "next": "latest",
                "react": "latest",
                "react-dom": "latest"
            },
            "scripts": {
                "dev": "next dev",
                "build": "next build",
                "start": "next start -p 3000"
            }
        }"#;
        tokio::fs::write(nextjs_pipe_dir.join("package.json"), package_json)
            .await
            .unwrap();
        println!("package.json created");

        // Create app directory and a simple page.tsx
        let app_dir = nextjs_pipe_dir.join("app");
        tokio::fs::create_dir_all(&app_dir).await.unwrap();
        let page_tsx = r#"
            export default function Home() {
                return <h1>Hello from Next.js App Router pipe!</h1>
            }
        "#;
        tokio::fs::write(app_dir.join("page.tsx"), page_tsx)
            .await
            .unwrap();

        // Create layout.tsx
        let layout_tsx = r#"
            export default function RootLayout({
                children,
            }: {
                children: React.ReactNode
            }) {
                return (
                    <html lang="en">
                        <body>{children}</body>
                    </html>
                )
            }
        "#;
        tokio::fs::write(app_dir.join("layout.tsx"), layout_tsx)
            .await
            .unwrap();

        // Create pipe.json
        let pipe_json = r#"{
            "is_nextjs": true
        }"#;
        tokio::fs::write(nextjs_pipe_dir.join("pipe.json"), pipe_json)
            .await
            .unwrap();

        // Run the pipe in a separate task
        let pipe_task = tokio::spawn(run_pipe("nextjs-test-pipe", screenpipe_dir.clone()));

        // Wait for a short time to allow the server to start
        sleep(Duration::from_secs(10)).await;

        // Check if the server is running
        let client = reqwest::Client::new();
        let response = client.get("http://localhost:3000").send().await;

        assert!(response.is_ok(), "Failed to connect to Next.js server");
        let response = response.unwrap();
        assert!(response.status().is_success(), "HTTP request failed");

        let body = response.text().await.expect("Failed to get response body");
        println!("Response body: {}", body);
        assert!(
            body.contains("Generated by create next app"),
            "Unexpected response content"
        );

        // Clean up: cancel the pipe task
        pipe_task.abort();

        println!("Test completed successfully");
    }
}
