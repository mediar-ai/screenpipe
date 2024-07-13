
// cargo bench 

use criterion::{criterion_group, criterion_main, Criterion};
use rand::Rng;
use screenpipe_server::{ContentType, DatabaseManager};
use tokio::runtime::Runtime;

async fn setup_large_db(size: usize) -> DatabaseManager {
    let db = DatabaseManager::new("sqlite::memory:").await.unwrap();
    let mut rng = rand::thread_rng();

    for _ in 0..size {
        let _video_id = db.insert_video_chunk("test_video.mp4").await.unwrap();
        let frame_id = db.insert_frame().await.unwrap();
        let ocr_text = format!("OCR text {}", rng.gen::<u32>());
        db.insert_ocr_text(frame_id, &ocr_text).await.unwrap();

        let audio_id = db.insert_audio_chunk("test_audio.mp3").await.unwrap();
        let audio_text = format!("Audio transcription {}", rng.gen::<u32>());
        db.insert_audio_transcription(audio_id, &audio_text, 0).await.unwrap();
    }

    db
}

fn bench_search(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();

    let db_sizes = [100, 1000, 10000];
    let content_types = [ContentType::OCR, ContentType::Audio, ContentType::All];

    for &size in &db_sizes {
        for &content_type in &content_types {
            c.bench_function(&format!("search_{:?}_db_size_{}", content_type, size), |b| {
                b.to_async(&rt).iter(|| async {
                    let db = setup_large_db(size).await;
                    db.search("text", content_type, 100, 0).await.unwrap()
                });
            });
        }
    }
}

criterion_group!(benches, bench_search);
criterion_main!(benches);