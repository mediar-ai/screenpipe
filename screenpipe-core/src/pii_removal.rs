use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

lazy_static! {
    static ref PII_PATTERNS: Vec<(Regex, &'static str)> = vec![
        // Financial
        (Regex::new(r"\b(?:\d{4}[-\s]?){3}\d{4}\b").unwrap(), "CREDIT_CARD"),

        // Government IDs
        (Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(), "SSN"),

        // Contact info
        (Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap(), "EMAIL"),

        // Phone numbers - various formats:
        // +1-234-567-8901, (234) 567-8901, 234-567-8901, 234.567.8901, 2345678901
        // Area code must start with 2-9, but exchange is lenient for PII detection
        (Regex::new(r"(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}").unwrap(), "PHONE"),

        // IP addresses (IPv4)
        (Regex::new(r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b").unwrap(), "IP_ADDRESS"),

        // API keys and tokens - common patterns:
        // sk-xxx, pk-xxx, api_key_xxx, token-xxx (20+ chars after prefix)
        (Regex::new(r"(?:sk|pk|api|key|token|secret|password|bearer)[-_][A-Za-z0-9_-]{20,}").unwrap(), "API_KEY"),

        // AWS access keys (AKIA...)
        (Regex::new(r"\bAKIA[0-9A-Z]{16}\b").unwrap(), "AWS_KEY"),

        // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
        (Regex::new(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b").unwrap(), "GITHUB_TOKEN"),
    ];
}

/// Represents a region in an image that contains PII and should be redacted
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PiiRegion {
    /// X coordinate (pixels from left)
    pub x: u32,
    /// Y coordinate (pixels from top)
    pub y: u32,
    /// Width of the region in pixels
    pub width: u32,
    /// Height of the region in pixels
    pub height: u32,
    /// Type of PII detected (e.g., "CREDIT_CARD", "SSN", "EMAIL")
    pub pii_type: String,
}

pub fn remove_pii(text: &str) -> String {
    let mut sanitized = text.to_string();
    for (pattern, replacement) in PII_PATTERNS.iter() {
        let replacement_bracketed = format!("[{}]", replacement);
        sanitized = pattern
            .replace_all(&sanitized, replacement_bracketed.as_str())
            .to_string();
    }
    sanitized
}

/// Check if a given text contains PII
pub fn contains_pii(text: &str) -> bool {
    for (pattern, _) in PII_PATTERNS.iter() {
        if pattern.is_match(text) {
            return true;
        }
    }
    false
}

/// Get the PII type for a given text, if any
pub fn get_pii_type(text: &str) -> Option<String> {
    for (pattern, pii_type) in PII_PATTERNS.iter() {
        if pattern.is_match(text) {
            return Some(pii_type.to_string());
        }
    }
    None
}

/// Detect PII regions from OCR text_json output with bounding boxes.
///
/// The text_json is expected to contain entries with:
/// - "text": the recognized text
/// - "left", "top", "width", "height": bounding box (can be normalized 0-1 or pixels)
///
/// If coordinates are normalized (0-1 range), they will be converted to pixels
/// using the provided image dimensions.
///
/// # Arguments
/// * `text_json` - Vector of HashMaps containing OCR results with bounding boxes
/// * `image_width` - Width of the image in pixels
/// * `image_height` - Height of the image in pixels
///
/// # Returns
/// Vector of PiiRegion structs representing areas to redact
pub fn detect_pii_regions(
    text_json: &[HashMap<String, String>],
    image_width: u32,
    image_height: u32,
) -> Vec<PiiRegion> {
    let mut regions = Vec::new();

    for entry in text_json {
        let text = match entry.get("text") {
            Some(t) => t,
            None => continue,
        };

        // Check if this text contains PII
        let pii_type = match get_pii_type(text) {
            Some(t) => t,
            None => continue,
        };

        // Parse bounding box coordinates
        let left = match entry.get("left").and_then(|v| v.parse::<f64>().ok()) {
            Some(v) => v,
            None => continue,
        };
        let top = match entry.get("top").and_then(|v| v.parse::<f64>().ok()) {
            Some(v) => v,
            None => continue,
        };
        let width = match entry.get("width").and_then(|v| v.parse::<f64>().ok()) {
            Some(v) => v,
            None => continue,
        };
        let height = match entry.get("height").and_then(|v| v.parse::<f64>().ok()) {
            Some(v) => v,
            None => continue,
        };

        // Determine if coordinates are normalized (0-1) or pixel values
        // Apple OCR returns normalized, Tesseract returns pixels
        let (x_px, y_px, w_px, h_px) = if left <= 1.0 && top <= 1.0 && width <= 1.0 && height <= 1.0
        {
            // Normalized coordinates (Apple OCR style)
            // Note: Apple's coordinate system has origin at bottom-left, so we need to flip Y
            let x = (left * image_width as f64) as u32;
            let y = ((1.0 - top - height) * image_height as f64) as u32;
            let w = (width * image_width as f64) as u32;
            let h = (height * image_height as f64) as u32;
            (x, y, w, h)
        } else {
            // Pixel coordinates (Tesseract style)
            (left as u32, top as u32, width as u32, height as u32)
        };

        // Add some padding around the region for better coverage
        let padding = 5u32;
        let x_padded = x_px.saturating_sub(padding);
        let y_padded = y_px.saturating_sub(padding);
        let w_padded = (w_px + padding * 2).min(image_width - x_padded);
        let h_padded = (h_px + padding * 2).min(image_height - y_padded);

        regions.push(PiiRegion {
            x: x_padded,
            y: y_padded,
            width: w_padded,
            height: h_padded,
            pii_type,
        });
    }

    regions
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

    #[test]
    fn test_contains_pii_credit_card() {
        assert!(contains_pii("4532-1234-5678-9012"));
        assert!(contains_pii("4532 1234 5678 9012"));
        assert!(contains_pii("4532123456789012"));
    }

    #[test]
    fn test_contains_pii_ssn() {
        assert!(contains_pii("123-45-6789"));
    }

    #[test]
    fn test_contains_pii_email() {
        assert!(contains_pii("test@example.com"));
        assert!(contains_pii("user.name+tag@domain.co.uk"));
    }

    #[test]
    fn test_contains_pii_negative() {
        assert!(!contains_pii("Hello World"));
        assert!(!contains_pii("1234"));
        assert!(!contains_pii("not an email"));
    }

    #[test]
    fn test_get_pii_type() {
        assert_eq!(
            get_pii_type("4532-1234-5678-9012"),
            Some("CREDIT_CARD".to_string())
        );
        assert_eq!(get_pii_type("123-45-6789"), Some("SSN".to_string()));
        assert_eq!(get_pii_type("test@example.com"), Some("EMAIL".to_string()));
        assert_eq!(get_pii_type("Hello World"), None);
    }

    #[test]
    fn test_detect_pii_regions_credit_card_normalized() {
        // Simulating Apple OCR output with normalized coordinates
        let text_json = vec![HashMap::from([
            ("text".to_string(), "4532-1234-5678-9012".to_string()),
            ("left".to_string(), "0.1".to_string()),
            ("top".to_string(), "0.8".to_string()), // Apple has bottom-left origin
            ("width".to_string(), "0.3".to_string()),
            ("height".to_string(), "0.05".to_string()),
        ])];

        let regions = detect_pii_regions(&text_json, 1920, 1080);

        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].pii_type, "CREDIT_CARD");
        // With padding of 5px, x should be (0.1 * 1920) - 5 = 192 - 5 = 187
        assert!(regions[0].x > 0);
        assert!(regions[0].width > 0);
        assert!(regions[0].height > 0);
    }

    #[test]
    fn test_detect_pii_regions_pixel_coordinates() {
        // Simulating Tesseract output with pixel coordinates
        let text_json = vec![HashMap::from([
            ("text".to_string(), "test@example.com".to_string()),
            ("left".to_string(), "100".to_string()),
            ("top".to_string(), "200".to_string()),
            ("width".to_string(), "300".to_string()),
            ("height".to_string(), "50".to_string()),
        ])];

        let regions = detect_pii_regions(&text_json, 1920, 1080);

        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].pii_type, "EMAIL");
        // With padding, x should be 100 - 5 = 95
        assert_eq!(regions[0].x, 95);
        assert_eq!(regions[0].y, 195);
    }

    #[test]
    fn test_detect_pii_regions_multiple() {
        let text_json = vec![
            HashMap::from([
                ("text".to_string(), "4532-1234-5678-9012".to_string()),
                ("left".to_string(), "100".to_string()),
                ("top".to_string(), "100".to_string()),
                ("width".to_string(), "200".to_string()),
                ("height".to_string(), "30".to_string()),
            ]),
            HashMap::from([
                ("text".to_string(), "123-45-6789".to_string()),
                ("left".to_string(), "100".to_string()),
                ("top".to_string(), "200".to_string()),
                ("width".to_string(), "150".to_string()),
                ("height".to_string(), "30".to_string()),
            ]),
            HashMap::from([
                ("text".to_string(), "Normal text here".to_string()),
                ("left".to_string(), "100".to_string()),
                ("top".to_string(), "300".to_string()),
                ("width".to_string(), "200".to_string()),
                ("height".to_string(), "30".to_string()),
            ]),
        ];

        let regions = detect_pii_regions(&text_json, 1920, 1080);

        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].pii_type, "CREDIT_CARD");
        assert_eq!(regions[1].pii_type, "SSN");
    }

    #[test]
    fn test_detect_pii_regions_no_pii() {
        let text_json = vec![HashMap::from([
            ("text".to_string(), "Hello World".to_string()),
            ("left".to_string(), "100".to_string()),
            ("top".to_string(), "100".to_string()),
            ("width".to_string(), "200".to_string()),
            ("height".to_string(), "30".to_string()),
        ])];

        let regions = detect_pii_regions(&text_json, 1920, 1080);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_detect_pii_regions_missing_coordinates() {
        let text_json = vec![HashMap::from([
            ("text".to_string(), "4532-1234-5678-9012".to_string()),
            // Missing bounding box coordinates
        ])];

        let regions = detect_pii_regions(&text_json, 1920, 1080);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_detect_pii_regions_empty_input() {
        let text_json: Vec<HashMap<String, String>> = vec![];
        let regions = detect_pii_regions(&text_json, 1920, 1080);
        assert!(regions.is_empty());
    }

    // ==================== NEW PATTERN TESTS ====================

    #[test]
    fn test_contains_pii_phone_numbers() {
        // US formats
        assert!(contains_pii("Call me at 234-567-8901"));
        assert!(contains_pii("Phone: (234) 567-8901"));
        assert!(contains_pii("Cell: 234.567.8901"));
        assert!(contains_pii("+1-234-567-8901"));
        assert!(contains_pii("2345678901"));

        // Should NOT match short numbers
        assert!(!contains_pii("Room 1234"));
        assert!(!contains_pii("Order #12345"));
    }

    #[test]
    fn test_remove_pii_phone_numbers() {
        assert_eq!(
            remove_pii("Call me at 234-567-8901"),
            "Call me at [PHONE]"
        );
        assert_eq!(
            remove_pii("Phone: (555) 123-4567"),
            "Phone: [PHONE]"
        );
        assert_eq!(
            remove_pii("Reach me at +1-800-555-1234"),
            "Reach me at [PHONE]"
        );
    }

    #[test]
    fn test_contains_pii_ip_addresses() {
        assert!(contains_pii("Server IP: 192.168.1.1"));
        assert!(contains_pii("Connect to 10.0.0.1"));
        assert!(contains_pii("8.8.8.8"));
        assert!(contains_pii("255.255.255.0"));

        // Should NOT match invalid IPs
        assert!(!contains_pii("Version 1.2.3"));
        assert!(!contains_pii("999.999.999.999")); // Invalid octets
    }

    #[test]
    fn test_remove_pii_ip_addresses() {
        assert_eq!(
            remove_pii("Server at 192.168.1.100"),
            "Server at [IP_ADDRESS]"
        );
        assert_eq!(
            remove_pii("DNS: 8.8.8.8 and 8.8.4.4"),
            "DNS: [IP_ADDRESS] and [IP_ADDRESS]"
        );
    }

    #[test]
    fn test_contains_pii_api_keys() {
        // Generic API keys
        assert!(contains_pii("sk-1234567890abcdefghij"));
        assert!(contains_pii("api_key_abcdefghijklmnopqrst"));
        assert!(contains_pii("token-abcdefghijklmnopqrstuvwx"));

        // AWS keys
        assert!(contains_pii("AKIAIOSFODNN7EXAMPLE"));

        // GitHub tokens
        assert!(contains_pii("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"));

        // Should NOT match short strings
        assert!(!contains_pii("sk-short"));
        assert!(!contains_pii("api_key"));
    }

    #[test]
    fn test_remove_pii_api_keys() {
        assert_eq!(
            remove_pii("Use key sk-proj-1234567890abcdefghijklmnop"),
            "Use key [API_KEY]"
        );
        assert_eq!(
            remove_pii("AWS: AKIAIOSFODNN7EXAMPLE"),
            "AWS: [AWS_KEY]"
        );
        assert_eq!(
            remove_pii("GitHub token: ghp_abcdefghijklmnopqrstuvwxyz1234567890"),
            "GitHub token: [GITHUB_TOKEN]"
        );
    }

    #[test]
    fn test_get_pii_type_new_patterns() {
        assert_eq!(get_pii_type("234-567-8901"), Some("PHONE".to_string()));
        assert_eq!(get_pii_type("192.168.1.1"), Some("IP_ADDRESS".to_string()));
        assert_eq!(get_pii_type("sk-abcdefghijklmnopqrst"), Some("API_KEY".to_string()));
        assert_eq!(get_pii_type("AKIAIOSFODNN7EXAMPLE"), Some("AWS_KEY".to_string()));
        assert_eq!(get_pii_type("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), Some("GITHUB_TOKEN".to_string()));
    }

    #[test]
    fn test_remove_pii_mixed_new_patterns() {
        let input = "Contact: 555-123-4567, server 10.0.0.1, key sk-abcdefghijklmnopqrstuvwxyz";
        let result = remove_pii(input);

        assert!(result.contains("[PHONE]"));
        assert!(result.contains("[IP_ADDRESS]"));
        assert!(result.contains("[API_KEY]"));
        assert!(!result.contains("555-123-4567"));
        assert!(!result.contains("10.0.0.1"));
        assert!(!result.contains("sk-"));
    }

    #[test]
    fn test_pii_removal_performance_with_new_patterns() {
        use std::time::Instant;

        // Text with all PII types
        let input = "Email john@test.com, call 555-123-4567, SSN 123-45-6789, \
                    card 4111-1111-1111-1111, IP 192.168.1.1, key sk-abcdefghij1234567890";

        let start = Instant::now();
        for _ in 0..1000 {
            let _ = remove_pii(input);
        }
        let duration = start.elapsed();

        // Should still be fast even with more patterns
        assert!(
            duration.as_millis() < 200,
            "PII removal too slow with new patterns: {:?} for 1000 iterations",
            duration
        );
    }
}
