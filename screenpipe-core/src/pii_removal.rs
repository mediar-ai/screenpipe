use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

lazy_static! {
    static ref PII_PATTERNS: Vec<(Regex, &'static str)> = vec![
        (Regex::new(r"\b(?:\d{4}[-\s]?){3}\d{4}\b").unwrap(), "CREDIT_CARD"),
        (Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(), "SSN"),
        (Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap(), "EMAIL"),
        // add more patterns as needed
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
        sanitized = pattern.replace_all(&sanitized, replacement_bracketed.as_str()).to_string();
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
        let (x_px, y_px, w_px, h_px) = if left <= 1.0 && top <= 1.0 && width <= 1.0 && height <= 1.0 {
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
        assert_eq!(get_pii_type("4532-1234-5678-9012"), Some("CREDIT_CARD".to_string()));
        assert_eq!(get_pii_type("123-45-6789"), Some("SSN".to_string()));
        assert_eq!(get_pii_type("test@example.com"), Some("EMAIL".to_string()));
        assert_eq!(get_pii_type("Hello World"), None);
    }

    #[test]
    fn test_detect_pii_regions_credit_card_normalized() {
        // Simulating Apple OCR output with normalized coordinates
        let text_json = vec![
            HashMap::from([
                ("text".to_string(), "4532-1234-5678-9012".to_string()),
                ("left".to_string(), "0.1".to_string()),
                ("top".to_string(), "0.8".to_string()),  // Apple has bottom-left origin
                ("width".to_string(), "0.3".to_string()),
                ("height".to_string(), "0.05".to_string()),
            ])
        ];

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
        let text_json = vec![
            HashMap::from([
                ("text".to_string(), "test@example.com".to_string()),
                ("left".to_string(), "100".to_string()),
                ("top".to_string(), "200".to_string()),
                ("width".to_string(), "300".to_string()),
                ("height".to_string(), "50".to_string()),
            ])
        ];

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
        let text_json = vec![
            HashMap::from([
                ("text".to_string(), "Hello World".to_string()),
                ("left".to_string(), "100".to_string()),
                ("top".to_string(), "100".to_string()),
                ("width".to_string(), "200".to_string()),
                ("height".to_string(), "30".to_string()),
            ]),
        ];

        let regions = detect_pii_regions(&text_json, 1920, 1080);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_detect_pii_regions_missing_coordinates() {
        let text_json = vec![
            HashMap::from([
                ("text".to_string(), "4532-1234-5678-9012".to_string()),
                // Missing bounding box coordinates
            ]),
        ];

        let regions = detect_pii_regions(&text_json, 1920, 1080);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_detect_pii_regions_empty_input() {
        let text_json: Vec<HashMap<String, String>> = vec![];
        let regions = detect_pii_regions(&text_json, 1920, 1080);
        assert!(regions.is_empty());
    }
}
