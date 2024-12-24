
use cron::Schedule;
use std::str::FromStr;

fn main() {
    let schedule = "* * * * * * *";
    match Schedule::from_str(schedule) {
        Ok(_) => println!("Valid cron expression"),
        Err(e) => println!("Invalid cron expression: {}", e),
    }
}
