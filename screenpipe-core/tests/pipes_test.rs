#[cfg(test)]
mod tests {
    use super::*;
    use deno_core::{JsRuntime, RuntimeOptions};
    use screenpipe_core::PluginSystem;

    #[tokio::test]
    async fn test_js_execution() {
        let mut runtime = JsRuntime::new(RuntimeOptions::default());

        // Test a simple JavaScript function
        let result = runtime.execute_script(
            "test.js",
            r#"
            function add(a, b) {
                return a + b;
            }
            add(2, 3);
            "#,
        );

        assert!(result.is_ok());
        println!("result: {:?}", result);
        // let result = result.unwrap();
        // assert_eq!(result.get_i32(), Some(5));
    }

    #[tokio::test]
    async fn test_plugin_system() {
        let plugin_system = PluginSystem::new();

        // Add a test plugin
        plugin_system
            .add_plugin(
                "test_plugin".to_string(),
                r#"
            console.log('Test plugin executed');
            "#
                .to_string(),
            )
            .await;

        // Run plugins
        plugin_system.run_plugins().await;

        // Assert that the plugin was added successfully
        // let plugins = plugin_system.plugins.lock().await;
        // assert_eq!(plugins.len(), 1);
        // assert_eq!(plugins[0].name, "test_plugin");
    }
}
