// use crate::core::{extract_all_frames_from_video, extract_frames_from_video};
// use image::DynamicImage;
// use lru::LruCache;
// use std::collections::HashMap;
// use std::num::NonZeroUsize;
// use std::sync::{Arc, Mutex, RwLock};
// use std::thread;
//
// pub struct FrameCache {
//     cache: Arc<RwLock<LruCache<String, CacheEntry>>>,
//     max_size: usize,
// }
//
// struct CacheEntry {
//     frames: HashMap<usize, FrameData>,
//     is_being_processed: bool,
// }
//
// struct FrameData {
//     image: DynamicImage,
// }
//
// impl FrameCache {
//     fn new(max_size: usize) -> Self {
//         let size = NonZeroUsize::new(max_size).expect("max_size must be greater than 0");
//         FrameCache {
//             cache: Arc::new(RwLock::new(LruCache::new(size))),
//             max_size,
//         }
//     }
//
//     // Function to get or load a frame
//     fn get_or_load_frame(&mut self, video_id: &str, frame_index: usize) -> FrameData {
//         let entry = { self.cache.read().unwrap().contains(video_id) };
//
//         if has_entry {
//             let cache_clone = self.cache.clone();
//             let maybe_entry = {
//                 let mut lock = cache_clone.read().unwrap();
//                 lock.get(video_id)
//             };
//             if let Some(entry) = maybe_entry {
//                 if let Some(frame) = entry.frames.get(&frame_index) {
//                     return FrameData {
//                         image: frame.image.clone(),
//                     };
//                 }
//             }
//         } else {
//             self.cache.write().unwrap().put(
//                 video_id.to_string(),
//                 CacheEntry {
//                     frames: HashMap::new(),
//                     is_being_processed: false,
//                 },
//             );
//         }
//
//         self.load_frame(&self.cache, video_id, frame_index)
//     }
//
//     fn load_frame(
//         &self,
//         cache: &Arc<RwLock<LruCache<String, CacheEntry>>>,
//         video_id: &str,
//         frame_index: usize,
//     ) -> FrameData {
//         let is_being_processed = {
//             self.cache
//                 .read()
//                 .unwrap()
//                 .get(video_id)
//                 .unwrap()
//                 .is_being_processed
//         };
//         if !is_being_processed {
//             let video_id_clone = video_id.to_string();
//
//             let cache_clone = self.cache.clone();
//             thread::spawn(move || {
//                 // Hold the write lock to say we're processing so we don't spawn multiple threads
//                 {
//                     cache_clone
//                         .write()
//                         .unwrap()
//                         .get_mut(&video_id_clone)
//                         .unwrap()
//                         .is_being_processed = true;
//                 }
//                 // Let it go as extracting frames can take a while
//
//                 // Call to the function to extract all frames
//                 let frames = extract_all_frames_from_video(&video_id_clone)
//                     .expect("Failed to extract frames");
//
//                 // Reacquire the lock to update the cache
//                 {
//                     let mut lock = cache_clone.write().unwrap();
//                     let mut_entry = lock.get_mut(&video_id_clone).unwrap();
//
//                     // Update cache with new frames
//                     for (index, frame) in frames.into_iter().enumerate() {
//                         mut_entry.frames.insert(index, FrameData { image: frame });
//                     }
//
//                     mut_entry.is_being_processed = true;
//                 }
//             });
//         }
//
//         let cache_clone = self.cache.clone();
//         // If the requested frame is already in the cache, return it.
//         // Otherwise, extract and return the specific frame.
//         let maybe_frame_data = {
//             cache_clone
//                 .read()
//                 .unwrap()
//                 .get(video_id)
//                 .unwrap()
//                 .frames
//                 .get(&frame_index)
//                 .map(|frame| FrameData {
//                     image: frame.image.clone(),
//                 })
//         };
//         // Release the read-lock and return the frame, or extract the frame
//
//         maybe_frame_data.unwrap_or_else(|| {
//             // Extract specific frame
//             let frame = extract_frames_from_video(&video_id, &[frame_index as i64])
//                 .expect("Failed to extract frame")
//                 .into_iter()
//                 .next()
//                 .unwrap();
//             FrameData { image: frame }
//         })
//     }
// }
