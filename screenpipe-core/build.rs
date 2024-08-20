fn main() {
    #[cfg(feature = "pipes")]
    {
        use deno_core::extension;
        use std::env;
        use std::path::PathBuf;

        extension!(runjs, js = ["src/deno/runtime.js",]);

        let out_dir = PathBuf::from(env::var_os("OUT_DIR").unwrap());
        let snapshot_path = out_dir.join("RUNJS_SNAPSHOT.bin");

        let snapshot = deno_core::snapshot::create_snapshot(
            deno_core::snapshot::CreateSnapshotOptions {
                cargo_manifest_dir: env!("CARGO_MANIFEST_DIR"),
                startup_snapshot: None,
                skip_op_registration: false,
                extensions: vec![runjs::init_ops_and_esm()],
                with_runtime_cb: None,
                extension_transpiler: None,
            },
            None,
        )
        .unwrap();

        std::fs::write(snapshot_path, snapshot.output).unwrap();
    }
}
