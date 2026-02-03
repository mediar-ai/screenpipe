//! Text normalization and query expansion for improved FTS search.
//!
//! This module provides query-side improvements to full-text search recall
//! without requiring database migrations. It expands search queries to catch
//! compound words that OCR may have concatenated.

use once_cell::sync::Lazy;
use regex::Regex;

// Pre-compiled regexes for minimal overhead
static CAMEL_CASE: Lazy<Regex> = Lazy::new(|| Regex::new(r"([a-z])([A-Z])").unwrap());
static NUM_TO_LETTER: Lazy<Regex> = Lazy::new(|| Regex::new(r"([0-9])([a-zA-Z])").unwrap());
static LETTER_TO_NUM: Lazy<Regex> = Lazy::new(|| Regex::new(r"([a-zA-Z])([0-9])").unwrap());

/// Split compound words on camelCase and number boundaries.
///
/// Used internally for query expansion.
#[inline]
fn split_compound(text: &str) -> String {
    // Fast path: if no uppercase letters or digits, skip processing
    if !text
        .bytes()
        .any(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
    {
        return text.to_string();
    }

    let result = CAMEL_CASE.replace_all(text, "$1 $2");
    let result = NUM_TO_LETTER.replace_all(&result, "$1 $2");
    let result = LETTER_TO_NUM.replace_all(&result, "$1 $2");
    result.into_owned()
}

/// Expand a search query to improve recall on compound words.
///
/// Takes a user query and returns an expanded FTS5 query that searches for:
/// 1. The original term (with prefix matching)
/// 2. Split parts of compound words (with prefix matching)
///
/// This catches cases where OCR concatenated words like "ActivityPerformance"
/// when the user searches for "activity" or "performance".
///
/// # Example
/// ```
/// use screenpipe_db::text_normalizer::expand_search_query;
///
/// // Single word - just adds prefix matching
/// assert_eq!(expand_search_query("test"), "test*");
///
/// // Compound word - expands to catch parts
/// assert_eq!(expand_search_query("proStart"), "(proStart* OR pro* OR Start*)");
/// ```
pub fn expand_search_query(query: &str) -> String {
    let query = query.trim();
    if query.is_empty() {
        return String::new();
    }

    // Process each word in the query
    let expanded_terms: Vec<String> = query
        .split_whitespace()
        .flat_map(|word| {
            let split = split_compound(word);
            let parts: Vec<&str> = split.split_whitespace().collect();

            if parts.len() > 1 {
                // Word was split - include original and parts with prefix matching
                let mut terms = vec![format!("{}*", word)];
                for part in parts {
                    if part.len() >= 2 {
                        // Only add parts with 2+ chars to avoid noise
                        terms.push(format!("{}*", part));
                    }
                }
                terms
            } else {
                // No split needed - just add prefix matching
                vec![format!("{}*", word)]
            }
        })
        .collect();

    if expanded_terms.len() == 1 {
        expanded_terms[0].clone()
    } else {
        format!("({})", expanded_terms.join(" OR "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_compound_camel_case() {
        assert_eq!(split_compound("camelCase"), "camel Case");
        assert_eq!(split_compound("CamelCase"), "Camel Case");
        assert_eq!(
            split_compound("ActivityPerformance"),
            "Activity Performance"
        );
    }

    #[test]
    fn test_split_compound_numbers() {
        assert_eq!(split_compound("test123"), "test 123");
        assert_eq!(split_compound("123test"), "123 test");
        assert_eq!(split_compound("test123word"), "test 123 word");
    }

    #[test]
    fn test_split_compound_no_change() {
        assert_eq!(split_compound("hello"), "hello");
        assert_eq!(split_compound("hello world"), "hello world");
    }

    #[test]
    fn test_expand_simple_query() {
        assert_eq!(expand_search_query("test"), "test*");
        assert_eq!(expand_search_query("hello"), "hello*");
    }

    #[test]
    fn test_expand_compound_query() {
        assert_eq!(
            expand_search_query("proStart"),
            "(proStart* OR pro* OR Start*)"
        );
        assert_eq!(
            expand_search_query("ActivityPerformance"),
            "(ActivityPerformance* OR Activity* OR Performance*)"
        );
    }

    #[test]
    fn test_expand_number_boundary() {
        assert_eq!(
            expand_search_query("test123"),
            "(test123* OR test* OR 123*)"
        );
    }

    #[test]
    fn test_expand_multi_word_query() {
        // Each word gets expanded independently
        assert_eq!(expand_search_query("hello world"), "(hello* OR world*)");
    }

    #[test]
    fn test_expand_empty_query() {
        assert_eq!(expand_search_query(""), "");
        assert_eq!(expand_search_query("   "), "");
    }

    #[test]
    fn test_expand_filters_short_parts() {
        // Single char parts should be filtered out
        assert_eq!(expand_search_query("iPhone"), "(iPhone* OR Phone*)");
    }

    #[test]
    fn test_expand_preserves_lowercase() {
        assert_eq!(expand_search_query("simple"), "simple*");
    }
}
