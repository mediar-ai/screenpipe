mod env;

use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

fn main() {
    let markdown_content = generate_env_markdown();

    let mdx_file = Path::new("../content/docs-mintlify-mig-tmp/cli-reference.mdx");
    let mdx_content = fs::read_to_string(mdx_file).expect("Failed to read MDX file");

    let marker = "{/* ENVIRONMENT VARIABLES WILL AUTOMATICALLY POPULATE HERE */}";
    let replacement_block = format!("\n{marker}\n\n{markdown_content}\n\n{marker}\n");

    let updated_content = if mdx_content.contains(marker) {
        let parts: Vec<&str> = mdx_content.split(marker).collect();
        if parts.len() >= 3 {
            let joined = parts[2..].join(marker);
            let after = joined.trim_start_matches('\n');
            format!("{}{}{}", parts[0], replacement_block, after)
        } else {
            mdx_content.replacen(marker, &replacement_block, 1)
        }
    } else {
        panic!("Marker `{}` not found in file!", marker);
    };

    let mut file = File::create(mdx_file).expect("Could not open MDX file for writing");
    file.write_all(updated_content.as_bytes())
        .expect("Failed to write to MDX file");
}

fn generate_env_markdown() -> String {
    let mut markdown_content = String::new();
    let env_vars = crate::env::get_env_vars();

    let total_vars = env_vars.iter().map(|c| c.env_vars.len()).sum::<usize>();
    let mut counter = 0;

    for (i, category) in env_vars.iter().enumerate() {
        markdown_content.push_str(&format!("#### {}\n\n", category.name));

        for env_var in &category.env_vars {
            counter += 1;
            markdown_content.push_str(&format!(
                "- **`{}`** ({})\n  {}",
                env_var.name, env_var.required, env_var.description
            ));

            if counter < total_vars {
                markdown_content.push_str("\n\n");
            }
        }

        if i < env_vars.len() - 1 {
            markdown_content.push_str("---\n\n");
        }
    }

    markdown_content
}
