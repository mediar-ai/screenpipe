use image::DynamicImage;
use std::collections::HashMap;
use std::fs::{self, File};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::Write;
use std::path::Path;
use serde_json;
use image_compare::{Algorithm, Metric, Similarity}; // Added import for Similarity
use rusty_tesseract::{Args, Image, DataOutput}; // Added import for Args, Image, DataOutput

pub fn calculate_hash(image: &DynamicImage) -> u64 {
    let mut hasher = DefaultHasher::new();
    image.as_bytes().hash(&mut hasher);
    hasher.finish()
}

pub fn save_json_to_file(json_data: &Vec<HashMap<String, String>>, file_name: &str) {
    let folder_path = Path::new("text_json");
    if !folder_path.exists() {
        fs::create_dir(folder_path).unwrap();
    }

    let file_path = folder_path.join(file_name);
    let mut file = File::create(file_path).unwrap();
    let json_string = serde_json::to_string_pretty(json_data).unwrap();
    file.write_all(json_string.as_bytes()).unwrap();
}

pub fn compare_images_histogram(image1: &DynamicImage, image2: &DynamicImage) -> f64 {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    let result = image_compare::gray_similarity_histogram(Metric::Hellinger, &image_one, &image_two)
        .expect("Images had different dimensions");
    result
}

pub fn compare_images_ssim(image1: &DynamicImage, image2: &DynamicImage) -> f64 {
    let image_one = image1.to_luma8();
    let image_two = image2.to_luma8();
    let result: Similarity = image_compare::gray_similarity_structure(&Algorithm::MSSIMSimple, &image_one, &image_two)
        .expect("Images had different dimensions");
    result.score
}

pub fn perform_ocr(image: &DynamicImage) -> (String, DataOutput, String) {
    let args = Args {
        lang: "eng".to_string(),
        config_variables: HashMap::from([
            ("tessedit_create_tsv".into(), "1".into()),
        ]),
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

    // Extract JSON output with confidence scores
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
                        record.level, record.page_num, record.block_num, record.par_num, record.line_num
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

    // Sort lines by confidence in descending order
    // lines.sort_by(|a, b| b["confidence"].partial_cmp(&a["confidence"]).unwrap());
    let json_output = serde_json::to_string_pretty(&lines).unwrap();

    (text, data_output, json_output)
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