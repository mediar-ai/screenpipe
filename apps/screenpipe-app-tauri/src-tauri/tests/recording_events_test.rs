// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

#![cfg(feature = "enterprise-build")]

#[path = "../src/recording/recovery_log.rs"]
pub(crate) mod recovery_log;

mod recording {
    pub(crate) use crate::recovery_log;
}

#[path = "../src/enterprise/recording_events.rs"]
mod recording_events;
