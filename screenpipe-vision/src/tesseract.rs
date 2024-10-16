use image::DynamicImage;
use rusty_tesseract::{Args, DataOutput, Image};
use screenpipe_core::{Language, TESSERACT_LANGUAGES};
use std::collections::HashMap;

pub fn perform_ocr_tesseract(
    image: &DynamicImage,
    languages: Vec<Language>,
) -> (String, String, Option<f64>) {
    let language_string = match languages.is_empty() {
        true => "eng".to_string(),
        _ => TESSERACT_LANGUAGES
            .iter()
            .filter_map(|(key, val)| {
                if let Some(_) = languages.iter().find(|l| l == &val) {
                    Some(key.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<String>>()
            .join("+"),
    };
    let args = Args {
        lang: language_string,
        config_variables: HashMap::from([("tessedit_create_tsv".into(), "1".into())]),
        dpi: Some(600), // 150 is a balanced option, 600 seems faster surprisingly, the bigger the number the more granualar result
        psm: Some(1), // PSM 1: Automatic page segmentation with OSD. PSM 3: Automatic page segmentation with OSD
        oem: Some(1), //1: Neural nets LSTM engine only,    3: Default, based on what is available. (Default)
    };

    let ocr_image = Image::from_dynamic_image(image).unwrap();

    // Extract data output
    let data_output = rusty_tesseract::image_to_data(&ocr_image, &args).unwrap();
    // let tsv_output = data_output_to_tsv(&data_output);

    // Extract text from data output
    let text = data_output_to_text(&data_output);
    let json_output = data_output_to_json(&data_output);

    let overall_confidence = calculate_overall_confidence(&data_output);

    (text, json_output, Some(overall_confidence))
}

fn data_output_to_text(data_output: &DataOutput) -> String {
    let mut text = String::new();
    for record in &data_output.data {
        if !record.text.is_empty() {
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(&record.text);
        }
    }
    text
}

fn data_output_to_json(data_output: &DataOutput) -> String {
    let mut lines: Vec<HashMap<String, String>> = Vec::new();
    let mut current_line = String::new();
    let mut current_conf = 0.0;
    let mut word_count = 0;
    let mut last_word_num = 0;

    for record in &data_output.data {
        if record.word_num == 0 {
            if !current_line.is_empty() {
                let avg_conf = current_conf / word_count as f32;
                let mut line_data = HashMap::new();
                line_data.insert("text".to_string(), current_line.clone());
                line_data.insert("confidence".to_string(), format!("{:.2}", avg_conf));
                line_data.insert(
                    "line_position".to_string(),
                    format!(
                        "level{}page_num{}block_num{}par_num{}line_num{}",
                        record.level,
                        record.page_num,
                        record.block_num,
                        record.par_num,
                        record.line_num
                    ),
                );
                lines.push(line_data);
                current_line.clear();
                current_conf = 0.0;
                word_count = 0;
            }
        }
        if record.word_num > last_word_num {
            if !current_line.is_empty() {
                current_line.push(' ');
            }
            current_line.push_str(&record.text);
            current_conf += record.conf;
            word_count += 1;
        }
        last_word_num = record.word_num;
    }
    if !current_line.is_empty() {
        let avg_conf = current_conf / word_count as f32;
        let mut line_data = HashMap::new();
        line_data.insert("text".to_string(), current_line);
        line_data.insert("confidence".to_string(), format!("{:.2}", avg_conf));
        lines.push(line_data);
    }

    serde_json::to_string_pretty(&lines).unwrap()
}

fn calculate_overall_confidence(data_output: &DataOutput) -> f64 {
    let total_conf: f32 = data_output.data.iter().map(|record| record.conf).sum();
    let count = data_output.data.len();
    if count > 0 {
        (total_conf / count as f32) as f64
    } else {
        0.0
    }
}
