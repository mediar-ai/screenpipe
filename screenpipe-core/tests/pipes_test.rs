#[cfg(feature = "pipes")]
#[cfg(test)]
mod tests {
    use screenpipe_core::run_js;
    use tokio::{
        fs::{remove_file, File},
        io::AsyncWriteExt,
    };

    #[tokio::test]
    async fn test_js_execution() {
        let code = r#"
            function add(a, b) {
                return a + b;
            }
            add(2, 3);
            console.log("Hello, world!");
            const response = await pipe.get("https://jsonplaceholder.typicode.com/todos/1");
            console.log(response);
            "#;

        // write code to a file
        let file_path = "test.js";
        let mut file = File::create(file_path).await.unwrap();
        file.write_all(code.as_bytes()).await.unwrap();
        file.flush().await.unwrap();
        // Test a simple JavaScript function
        let result = run_js(file_path).await;

        assert!(result.is_ok());
        println!("result: {:?}", result);
        remove_file(file_path).await.unwrap();
    }
}
