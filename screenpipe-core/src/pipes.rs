pub use anyhow::Result;
use deno_core::{op2, FsModuleLoader, ModuleSpecifier};
use deno_runtime::{
    deno_permissions::{Permissions, PermissionsContainer},
    worker::WorkerOptions,
};
use log::info;
use std::{path::Path, rc::Rc};

pub struct Pipe;

#[op2(fast)]
fn op_info(#[string] text: &str) {
    info!("{}", text);
}

#[op2(fast)]
pub fn op_fetch(#[string] url: String) -> String {
    let client = reqwest::blocking::Client::new();
    let response = client.get(&url).send().unwrap();
    let body = response.text().unwrap();
    body
}

deno_core::extension!(
    info_runtime,
    ops = [op_info],
      esm_entry_point = "ext:info_runtime/bootstrap.js",
      esm = [dir "src/extensions", "bootstrap.js"]
);

deno_core::extension!(
    fetch_runtime,
    ops = [op_fetch],
      esm_entry_point = "ext:fetch_runtime/bootstrap.js",
      esm = [dir "src/extensions", "bootstrap.js"]
);

impl Pipe {
    pub fn new() -> Self {
        Pipe
    }

    pub async fn run(&self, path_to_main_module: &Path) -> Result<()> {
        let main_module = ModuleSpecifier::from_file_path(path_to_main_module).map_err(|_| {
            anyhow::anyhow!(
                "Failed to create module specifier from path: {:?}",
                path_to_main_module
            )
        })?;

        let mut main_worker = deno_runtime::worker::MainWorker::bootstrap_from_options(
            main_module.clone(),
            PermissionsContainer::new(Permissions::allow_all()),
            WorkerOptions {
                module_loader: Rc::new(FsModuleLoader),
                extensions: vec![
                    info_runtime::init_ops_and_esm(),
                    fetch_runtime::init_ops_and_esm(),
                ],
                ..Default::default()
            },
        );
        main_worker.execute_main_module(&main_module).await?;
        Ok(())
    }
}
