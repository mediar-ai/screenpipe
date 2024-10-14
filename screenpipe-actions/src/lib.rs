mod monitor_keystroke_commands;
mod call_ai;
mod type_and_animate;
mod screenshot;
mod run;  // This now refers to the renamed run.rs file

pub use monitor_keystroke_commands::{run_keystroke_monitor, KeystrokeCommand};
pub use call_ai::call_ai;
pub use type_and_animate::{type_slowly, delete_characters};
pub use run::run;  // Export the run function from the run module

// Remove this line
// mod main;

// Remove this line if the function doesn't exist
// pub use screenshot::capture_main_window_screenshot;
