use crate::cli::PipeCommand;

/// Handle pipe subcommands.
///
/// NOTE: This is a placeholder. Pipe execution, scheduling, and management
/// will be implemented as part of the pipes system (see #2213).
/// For now, all commands print unimplemented messages.
pub async fn handle_pipe_command(command: &PipeCommand) -> anyhow::Result<()> {
    match command {
        PipeCommand::List { json: _ } => {
            eprintln!("screenpipe pipe list: not yet implemented (see #2213)");
        }
        PipeCommand::Enable { name } => {
            eprintln!(
                "screenpipe pipe enable '{}': not yet implemented (see #2213)",
                name
            );
        }
        PipeCommand::Disable { name } => {
            eprintln!(
                "screenpipe pipe disable '{}': not yet implemented (see #2213)",
                name
            );
        }
        PipeCommand::Run { name } => {
            eprintln!(
                "screenpipe pipe run '{}': not yet implemented (see #2213)",
                name
            );
        }
        PipeCommand::Logs { name, follow: _ } => {
            eprintln!(
                "screenpipe pipe logs '{}': not yet implemented (see #2213)",
                name
            );
        }
        PipeCommand::Delete { name } => {
            eprintln!(
                "screenpipe pipe delete '{}': not yet implemented (see #2213)",
                name
            );
        }
    }

    Ok(())
}
