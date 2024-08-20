use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref PII_PATTERNS: Vec<(Regex, &'static str)> = vec![
        (Regex::new(r"\b(?:\d{4}[-\s]?){3}\d{4}\b").unwrap(), "[CREDIT_CARD]"),
        (Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(), "[SSN]"),
        (Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap(), "[EMAIL]"),
        // add more patterns as needed
    ];
}

pub fn remove_pii(text: &str) -> String {
    let mut sanitized = text.to_string();
    for (pattern, replacement) in PII_PATTERNS.iter() {
        sanitized = pattern.replace_all(&sanitized, *replacement).to_string();
    }
    sanitized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_pii() {
        let input =
            "My card is 1234-5678-9012-3456 and SSN is 123-45-6789. Email: test@example.com";
        let expected = "My card is [CREDIT_CARD] and SSN is [SSN]. Email: [EMAIL]";
        assert_eq!(remove_pii(input), expected);
    }
}
