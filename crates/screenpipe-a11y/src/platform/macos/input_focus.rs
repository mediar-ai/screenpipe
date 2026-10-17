// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! One coherent focus identity and capture decision for lock-free input reads.
use crate::config::UiCaptureConfig;

#[derive(Default)]
pub(super) struct InputFocus {
    pub pid: i32,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub allowed: bool,
}

impl InputFocus {
    pub(super) fn resolved(
        pid: i32,
        app: String,
        window: Option<String>,
        config: &UiCaptureConfig,
    ) -> Self {
        Self {
            allowed: config.should_capture_target(&app, window.as_deref()),
            pid,
            app_name: Some(app),
            window_title: window,
        }
    }
}

/// A delayed clipboard read must not inherit an earlier allowed context. Check
/// both before and after native reading, using the exact published snapshot.
pub(super) fn with_allowed_focus<T>(
    current: &arc_swap::ArcSwap<InputFocus>,
    capture: impl FnOnce(&InputFocus) -> Option<T>,
) -> Option<T> {
    let focus = current.load_full();
    if !focus.allowed {
        return None;
    }
    let result = capture(&focus)?;
    std::sync::Arc::ptr_eq(&focus, &current.load_full()).then_some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clipboard_read_discards_a_privacy_transition_during_snapshot() {
        let mut config = UiCaptureConfig::new();
        config.excluded_apps = vec!["Terminal".into()];
        config.compile_patterns();
        let shared = arc_swap::ArcSwap::from_pointee(InputFocus::resolved(
            1,
            "TextEdit".into(),
            None,
            &config,
        ));
        let result = with_allowed_focus(&shared, |_| {
            shared.store(std::sync::Arc::new(InputFocus::resolved(
                2,
                "Terminal".into(),
                None,
                &config,
            )));
            Some("must not escape")
        });
        assert!(result.is_none());
        assert!(with_allowed_focus(&shared, |_| -> Option<()> {
            panic!("excluded clipboard must not be read")
        })
        .is_none());
    }

    #[test]
    fn focus_identity_and_privacy_change_together_and_recover() {
        let mut config = UiCaptureConfig::new();
        config.excluded_apps = vec!["Terminal".into()];
        config.ignored_windows = vec!["TextEdit::private".into()];
        config.compile_patterns();
        let shared = arc_swap::ArcSwap::from_pointee(InputFocus::default());
        assert!(
            !shared.load().allowed,
            "unknown focus must not reuse an allowed identity"
        );
        for (app, window, allowed) in [
            ("TextEdit", "public", true),
            ("Terminal", "shell", false),
            ("TextEdit", "private", false),
            ("TextEdit", "public", true),
        ] {
            shared.store(std::sync::Arc::new(InputFocus::resolved(
                1,
                app.into(),
                Some(window.into()),
                &config,
            )));
            let focus = shared.load();
            assert_eq!(focus.allowed, allowed);
            assert_eq!(focus.app_name.as_deref(), Some(app));
            assert_eq!(focus.window_title.as_deref(), Some(window));
        }
    }
}
