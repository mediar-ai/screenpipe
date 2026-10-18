// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Pure text burst attribution and transient delivery retention. No native calls.
use crate::events::UiEvent;
use chrono::Utc;
use std::time::Instant;

struct TextBurst {
    text: String,
    app_name: Option<String>,
    window_title: Option<String>,
    relative_ms: u64,
    timestamp: chrono::DateTime<Utc>,
}
impl TextBurst {
    fn into_event(self) -> UiEvent {
        let mut event = UiEvent::text(self.timestamp, self.relative_ms, self.text);
        event.app_name = self.app_name;
        event.window_title = self.window_title;
        event
    }
}

pub(super) struct TextBuffer {
    chars: String,
    pending: std::collections::VecDeque<TextBurst>,
    retry: Option<UiEvent>,
    rejected_characters: u64,
    app_name: Option<String>,
    window_title: Option<String>,
    relative_ms: u64,
    timestamp: chrono::DateTime<Utc>,
    last_time: Option<Instant>,
    timeout_ms: u64,
}

impl TextBuffer {
    pub(super) fn new(timeout_ms: u64) -> Self {
        Self {
            chars: String::new(),
            pending: std::collections::VecDeque::new(),
            retry: None,
            rejected_characters: 0,
            app_name: None,
            window_title: None,
            relative_ms: 0,
            timestamp: Utc::now(),
            last_time: None,
            timeout_ms,
        }
    }

    pub(super) fn push(&mut self, c: char) {
        if c == '\x08' {
            // Backspace - remove last char
            self.chars.pop();
        } else {
            self.chars.push(c);
        }
        self.last_time = Some(Instant::now());
    }

    pub(super) fn flush(&mut self) -> Option<String> {
        if self.chars.is_empty() {
            return None;
        }
        let s = std::mem::take(&mut self.chars);
        self.last_time = None;
        Some(s)
    }

    /// Keep attribution at input time. A focus/window transition splits the
    /// burst, so delayed flushing cannot relabel earlier keystrokes.
    fn push_burst(
        &mut self,
        c: char,
        app: Option<String>,
        window: Option<String>,
        relative_ms: u64,
    ) -> Option<TextBurst> {
        let previous =
            if !self.chars.is_empty() && (self.app_name != app || self.window_title != window) {
                self.flush_burst()
            } else {
                None
            };
        if self.chars.is_empty() {
            self.app_name = app;
            self.window_title = window;
            self.relative_ms = relative_ms;
            self.timestamp = Utc::now();
        }
        self.push(c);
        previous
    }

    fn flush_burst(&mut self) -> Option<TextBurst> {
        Some(TextBurst {
            text: self.flush()?,
            timestamp: self.timestamp,
            relative_ms: self.relative_ms,
            app_name: self.app_name.take(),
            window_title: self.window_title.take(),
        })
    }

    pub(super) fn flush_event(&mut self) -> Option<UiEvent> {
        self.flush_burst().map(TextBurst::into_event)
    }

    #[cfg(test)]
    pub(super) fn push_attributed(
        &mut self,
        c: char,
        app: Option<String>,
        window: Option<String>,
        relative_ms: u64,
    ) -> Option<UiEvent> {
        self.push_burst(c, app, window, relative_ms)
            .map(TextBurst::into_event)
    }

    /// Reserve a transition slot before consuming the previous burst. A stalled
    /// consumer must not evict text already accepted into this buffer.
    pub(super) fn capture(
        &mut self,
        c: char,
        app: Option<String>,
        window: Option<String>,
        relative_ms: u64,
        capacity: usize,
    ) {
        let transition =
            !self.chars.is_empty() && (self.app_name != app || self.window_title != window);
        if transition && self.pending.len() + usize::from(self.retry.is_some()) >= capacity.max(1) {
            self.rejected_characters = self.rejected_characters.saturating_add(1);
            return;
        }
        if let Some(previous) = self.push_burst(c, app, window, relative_ms) {
            self.pending.push_back(previous);
        }
    }

    /// The bool records whether PII processing already ran on a retry. Never
    /// repeatedly transform a retained event while the output channel is full.
    pub(super) fn take_ready(&mut self, force: bool) -> Option<(UiEvent, bool)> {
        if let Some(event) = self.retry.take() {
            return Some((event, true));
        }
        if let Some(event) = self.pending.pop_front() {
            return Some((event.into_event(), false));
        }
        if force || self.should_flush() {
            return self.flush_event().map(|e| (e, false));
        }
        None
    }

    pub(super) fn retain_for_retry(&mut self, event: UiEvent) {
        debug_assert!(self.retry.is_none());
        self.retry = Some(event);
    }

    pub(super) fn has_pending(&self) -> bool {
        self.retry.is_some() || !self.pending.is_empty() || !self.chars.is_empty()
    }

    pub(super) fn take_rejected_count(&mut self) -> u64 {
        std::mem::take(&mut self.rejected_characters)
    }

    pub(super) fn should_flush(&self) -> bool {
        self.last_time
            .map(|t| t.elapsed().as_millis() as u64 >= self.timeout_ms)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::EventData;
    fn content(event: &UiEvent) -> &str {
        match &event.data {
            EventData::Text { content, .. } => content,
            _ => panic!("expected text"),
        }
    }
    #[test]
    fn text_saturation_preserves_accepted_bursts_and_reports_missing_input() {
        let mut b = TextBuffer::new(0);
        b.capture('a', Some("A".into()), None, 1, 1);
        b.capture('b', Some("B".into()), None, 2, 1);
        b.capture('c', Some("C".into()), None, 3, 1);
        assert_eq!(b.take_rejected_count(), 1);
        let (a, prepared) = b.take_ready(true).unwrap();
        assert!(!prepared);
        assert_eq!(content(&a), "a");
        b.retain_for_retry(a);
        b.capture('d', Some("D".into()), None, 4, 1);
        assert_eq!(b.take_rejected_count(), 1);
        let (a, prepared) = b.take_ready(true).unwrap();
        assert!(prepared);
        assert_eq!(content(&a), "a");
        let (b_event, _) = b.take_ready(true).unwrap();
        assert_eq!(content(&b_event), "b");
        assert!(b.take_ready(true).is_none());
        b.capture('e', Some("E".into()), None, 5, 1);
        assert_eq!(content(&b.take_ready(true).unwrap().0), "e");
    }
    #[test]
    fn text_continuous_unicode_input_preserves_semantic_burst_for_redaction() {
        let mut b = TextBuffer::new(60_000);
        let expected = "🦀".repeat(6000);
        for c in expected.chars() {
            b.capture(c, Some("A".into()), None, 1, 8);
        }
        let mut actual = String::new();
        let mut chunks = 0;
        while let Some((event, _)) = b.take_ready(true) {
            actual.push_str(content(&event));
            chunks += 1;
        }
        assert_eq!(actual, expected);
        assert_eq!(chunks, 1);
        assert_eq!(b.take_rejected_count(), 0);
    }

    #[test]
    fn text_retry_keeps_order_and_does_not_redact_twice() {
        let mut b = TextBuffer::new(0);
        b.capture('a', Some("A".into()), None, 1, 4);
        let (a, _) = b.take_ready(true).unwrap();
        b.retain_for_retry(a);
        b.capture('b', Some("B".into()), None, 2, 4);
        b.capture('c', Some("C".into()), None, 3, 4);
        for expected in ["a", "b", "c"] {
            let (event, prepared) = b.take_ready(true).unwrap();
            assert_eq!(content(&event), expected);
            assert_eq!(prepared, expected == "a");
        }
        assert!(b.take_ready(true).is_none());
    }
}
