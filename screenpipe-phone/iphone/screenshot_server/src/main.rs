use actix_web::{web, App, HttpServer, HttpResponse};
use actix_multipart::Multipart;
use futures::{StreamExt, TryStreamExt};
use std::io::Write;
use chrono::Utc;
use std::path::Path;

async fn save_screenshot(mut payload: Multipart) -> HttpResponse {
    println!("Received a screenshot upload request");
    while let Ok(Some(mut field)) = payload.try_next().await {
        let content_type = field.content_disposition();
        let file_extension = content_type
            .get_filename()
            .and_then(|f| f.split('.').last())
            .unwrap_or("png")
            .to_string();
        
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("screenshot_{}.{}", timestamp, file_extension);
        let filepath = Path::new("./screenshots").join(&filename);
        println!("Attempting to save file: {:?}", filepath);

        match std::fs::File::create(&filepath) {
            Ok(mut f) => {
                let mut size = 0;
                while let Some(chunk) = field.next().await {
                    match chunk {
                        Ok(data) => {
                            size += data.len();
                            if let Err(e) = f.write_all(&data) {
                                eprintln!("Error writing data: {}", e);
                                return HttpResponse::InternalServerError().body(format!("Failed to save file: {}", e));
                            }
                        },
                        Err(e) => {
                            eprintln!("Error reading chunk: {}", e);
                            return HttpResponse::InternalServerError().body(format!("Failed to process upload: {}", e));
                        }
                    }
                }
                println!("File saved successfully. Size: {} bytes", size);
            },
            Err(e) => {
                eprintln!("Error creating file: {}", e);
                return HttpResponse::InternalServerError().body(format!("Failed to create file: {}", e));
            }
        }
    }
    HttpResponse::Ok().body("Screenshot saved")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Server starting...");
    let screenshots_dir = Path::new("./screenshots");
    match std::fs::create_dir_all(screenshots_dir) {
        Ok(_) => println!("Screenshots directory created or already exists"),
        Err(e) => {
            eprintln!("Failed to create screenshots directory: {}", e);
            return Err(e);
        }
    }

    HttpServer::new(|| {
        println!("Creating new app instance");
        App::new()
            .app_data(web::PayloadConfig::new(50 * 1024 * 1024)) // 50MB limit
            .route("/upload", web::post().to(save_screenshot))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}