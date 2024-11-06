mod call_ai;
mod monitor_keystroke_commands;
mod run;
mod screenshot;
pub mod type_and_animate; 

pub use call_ai::call_ai;
pub use monitor_keystroke_commands::{run_keystroke_monitor, KeystrokeCommand};
pub use run::run;
pub use type_and_animate::{delete_characters, trigger_keyboard_permission, type_slowly}; // Export the run function from the run module
