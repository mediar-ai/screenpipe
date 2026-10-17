// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Manual acceptance on a disposable, separately mounted <=256 MiB volume.
//! Never point this at a user's data volume. The harness requires an exact
//! opt-in mount path and a task-created marker, and writes at most 256 MiB.
use screenpipe_config::{DbConfig, DeviceTier};
use screenpipe_db::DatabaseManager;
use std::io::Write;

#[tokio::test]
#[ignore = "requires a disposable Mac VM and /Volumes/ScreenpipeFaultFixture"]
async fn physical_disk_full_retires_writer_and_recovers_existing_database() {
    assert_eq!(
        std::env::var("SCREENPIPE_ISOLATED_VM_TEST").as_deref(),
        Ok("1")
    );
    let root = std::path::Path::new("/Volumes/ScreenpipeFaultFixture");
    assert!(root.join(".screenpipe-disposable-volume").is_file());
    let dir = tempfile::tempdir_in(root).unwrap();
    let path = dir.path().join("db.sqlite");
    let config = DbConfig::for_tier(DeviceTier::Low);
    let db = DatabaseManager::new(path.to_str().unwrap(), config.clone())
        .await
        .unwrap();
    db.insert_audio_chunk("/fixture/before-full", None)
        .await
        .unwrap();
    let filler_path = dir.path().join("capacity-filler");
    let mut filler = std::fs::File::create_new(&filler_path).unwrap();
    let block = vec![0x5a; 1024 * 1024];
    let mut exhausted = false;
    for _ in 0..256 {
        if let Err(error) = filler.write_all(&block) {
            assert_eq!(
                error.raw_os_error(),
                Some(28),
                "expected real ENOSPC: {error}"
            );
            exhausted = true;
            break;
        }
    }
    assert!(
        exhausted,
        "fixture is not a small full volume; refusing further writes"
    );
    let _ = filler.sync_all();
    let mut failed = false;
    for index in 0..16 {
        let large_path = format!("/fixture/full-{index}/{}", "x".repeat(128 * 1024));
        match db.insert_audio_chunk(&large_path, None).await {
            Ok(_) => continue,
            Err(error) => {
                eprintln!("physical capacity failure: {error}");
                failed = true;
                break;
            }
        }
    }
    assert!(failed, "writes must stop at real capacity exhaustion");
    assert!(
        db.write_queue_health().is_hard_faulted(),
        "full disk must retire admission"
    );
    assert_eq!(
        screenpipe_sqlite_coordinator::registered_sqlite_hard_fault(&path),
        Some(13),
        "the coordinator must identify SQLITE_FULL"
    );
    drop(filler);
    std::fs::remove_file(&filler_path).unwrap();
    db.close().await;
    let resumed = DatabaseManager::new(path.to_str().unwrap(), config.clone())
        .await
        .unwrap();
    resumed
        .insert_audio_chunk("/fixture/after-capacity-returned", None)
        .await
        .unwrap();
    resumed.close().await;
    // Verify across another close/reopen, not from the writer's own live pool.
    let verified = DatabaseManager::new(path.to_str().unwrap(), config)
        .await
        .unwrap();
    assert!(verified
        .find_audio_chunk_id("/fixture/before-full")
        .await
        .unwrap()
        .is_some());
    assert!(verified
        .find_audio_chunk_id("/fixture/after-capacity-returned")
        .await
        .unwrap()
        .is_some());
    verified.close().await;
    eprintln!("verified: ENOSPC, hard-faulted writer, existing rows preserved, new durable write after recovery");
}
