// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use crate::core::DatabaseManager;
use core::{start_recording, CaptureHandles};
use std::{
    fs,
    sync::{Arc, Mutex},
};

use tokio::sync::oneshot;

mod core;
mod server;

async fn start_server(local_data_dir: String, db: Arc<Mutex<Option<DatabaseManager>>>) {
    println!("starting server...");
    let (tx, rx) = oneshot::channel();
    tokio::spawn(async move {
        server::start_frame_server(tx, local_data_dir.to_string(), db.clone()).await;
    });
    // Wait for the server to start
    let _ = rx.await;
    println!("started server...");
}

fn ensure_local_data_dir() -> Result<String, ()> {
    let local_data_dir = Option::Some("./data");
    if let Some(dir) = local_data_dir.clone() {
        if let Ok(()) = fs::create_dir_all(dir) {
            return Ok(dir.to_string());
        }
    }
    Err(())
}

fn setup_db(local_data_dir: String, db: Arc<Mutex<Option<DatabaseManager>>>) {
    let mut db = db.lock().unwrap();
    let db_ = DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir)).unwrap();
    *db = Some(db_);
}

#[tokio::main]
async fn main() {
    println!("starting app...");
    let is_capturing = Arc::new(Mutex::new(false));
    let handles: Arc<Mutex<Option<CaptureHandles>>> = Arc::new(Mutex::new(None));
    let db: Arc<Mutex<Option<DatabaseManager>>> = Arc::new(Mutex::new(None));

    let db_setup_ref = db.clone();

    let path = ensure_local_data_dir().unwrap_or_else(|_| {
        panic!("Failed to create local data dir");
    });
    setup_db(path.clone(), db_setup_ref.clone());
    toggle_recording(db, is_capturing, handles).unwrap();

    start_server(path.clone(), db_setup_ref.clone()).await;

    // toggle_recording(db, is_capturing, handles).unwrap();
    // start_recording(path, db);
}

fn stop_recording(
    is_capturing: Arc<Mutex<bool>>,
    handles: Arc<Mutex<Option<CaptureHandles>>>,
) -> Result<bool, ()> {
    let mut is_capturing = is_capturing.lock().unwrap();
    let mut handles = handles.lock().unwrap();
    if *is_capturing {
        if let Some(ref mut handles) = *handles {
            handles.stop_recording()
        }
        *is_capturing = false;
        return Ok(true);
    }
    Ok(false)
}

fn toggle_recording(
    db: Arc<Mutex<Option<DatabaseManager>>>,
    is_capturing: Arc<Mutex<bool>>,
    handles: Arc<Mutex<Option<CaptureHandles>>>,
) -> Result<(), ()> {
    if !stop_recording(is_capturing.clone(), handles.clone()).unwrap_or(false) {
        let local_data_dir = Option::Some("./data");
        if let Some(dir) = local_data_dir.clone() {
            let path = dir.to_string();

            let mut is_capturing = is_capturing.lock().unwrap();
            let mut handles = handles.lock().unwrap();
            *handles = Some(start_recording(path, db));
            *is_capturing = true;
        }
    }

    Ok(())
}
