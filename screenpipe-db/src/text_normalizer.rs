//! Text normalization for improved FTS indexing.
//!
//! This module handles splitting compound words (camelCase, number boundaries)
//! to improve full-text search recall without requiring database migrations.

use once_cell::sync::Lazy;
use regex::Regex;

// Pre-compiled regexes for minimal overhead
static CAMEL_CASE: Lazy<Regex> = Lazy::new(|| Regex::new(r"([a-z])([A-Z])").unwrap());
static NUM_TO_LETTER: Lazy<Regex> = Lazy::new(|| Regex::new(r"([0-9])([a-zA-Z])").unwrap());
static LETTER_TO_NUM: Lazy<Regex> = Lazy::new(|| Regex::new(r"([a-zA-Z])([0-9])").unwrap());

/// Normalize text for better FTS indexing by splitting compound words.
///
/// Splits on:
/// - camelCase boundaries: "ActivityPerformance" → "Activity Performance"
/// - number-to-letter: "123abc" → "123 abc"
/// - letter-to-number: "abc123" → "abc 123"
///
/// This is intentionally lightweight - just regex replacements with pre-compiled patterns.
///
/// # Example
/// ```
/// use screenpipe_db::text_normalizer::normalize_text;
///
/// assert_eq!(normalize_text("camelCase"), "camel Case");
/// assert_eq!(normalize_text("test123word"), "test 123 word");
/// assert_eq!(normalize_text("ActivityPerformance"), "Activity Performance");
/// ```
#[inline]
pub fn normalize_text(text: &str) -> String {
    // Fast path: if no uppercase letters or digits, skip processing
    if !text.bytes().any(|b| b.is_ascii_uppercase() || b.is_ascii_digit()) {
        return text.to_string();
    }

    let result = CAMEL_CASE.replace_all(text, "$1 $2");
    let result = NUM_TO_LETTER.replace_all(&result, "$1 $2");
    let result = LETTER_TO_NUM.replace_all(&result, "$1 $2");
    result.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camel_case_split() {
        assert_eq!(normalize_text("camelCase"), "camel Case");
        assert_eq!(normalize_text("CamelCase"), "Camel Case");
        assert_eq!(normalize_text("camelCaseWord"), "camel Case Word");
        assert_eq!(normalize_text("ActivityPerformance"), "Activity Performance");
        assert_eq!(normalize_text("iPhone"), "i Phone");
    }

    #[test]
    fn test_number_boundaries() {
        assert_eq!(normalize_text("test123"), "test 123");
        assert_eq!(normalize_text("123test"), "123 test");
        assert_eq!(normalize_text("test123word"), "test 123 word");
        assert_eq!(normalize_text("abc123def456"), "abc 123 def 456");
    }

    #[test]
    fn test_mixed() {
        assert_eq!(normalize_text("myVar123Test"), "my Var 123 Test");
        assert_eq!(normalize_text("0Activity20"), "0 Activity 20");
    }

    #[test]
    fn test_no_change_needed() {
        assert_eq!(normalize_text("hello world"), "hello world");
        assert_eq!(normalize_text("simple"), "simple");
        assert_eq!(normalize_text(""), "");
    }

    #[test]
    fn test_already_spaced() {
        assert_eq!(normalize_text("Hello World"), "Hello World");
        assert_eq!(normalize_text("test 123"), "test 123");
    }

    #[test]
    fn test_special_characters_preserved() {
        assert_eq!(normalize_text("hello@world.com"), "hello@world.com");
        assert_eq!(normalize_text("path/to/file"), "path/to/file");
        assert_eq!(normalize_text("user_name"), "user_name");
    }

    #[test]
    fn test_unicode_preserved() {
        assert_eq!(normalize_text("héllo"), "héllo");
        assert_eq!(normalize_text("日本語"), "日本語");
    }

    #[test]
    fn test_fast_path_lowercase_only() {
        // These should hit the fast path (no uppercase or digits)
        let text = "this is all lowercase text with no numbers";
        assert_eq!(normalize_text(text), text);
    }
}
