use ffmpeg_next as ffmpeg;
use ffmpeg_next::sys::AVSEEK_FLAG_FRAME;
use ffmpeg_next::{format, format::Pixel, media, software::scaling, util::frame::video::Video};
use image::{DynamicImage, ImageBuffer, Rgb};
use std::collections::BTreeSet;

pub fn extract_frames_from_video(
    video_path: &str,
    frame_numbers: &[i64],
) -> Result<Vec<DynamicImage>, ffmpeg::Error> {
    ffmpeg::init()?;

    let mut images = Vec::new();
    let mut ictx = format::input(&video_path)?;
    let input_stream = ictx
        .streams()
        .best(media::Type::Video)
        .ok_or(ffmpeg::Error::StreamNotFound)?;
    let video_stream_index = input_stream.index();

    let context_decoder =
        ffmpeg::codec::context::Context::from_parameters(input_stream.parameters())?;
    let mut decoder = context_decoder.decoder().video()?;

    let mut scaler = scaling::Context::get(
        decoder.format(),
        decoder.width(),
        decoder.height(),
        Pixel::RGB24,
        decoder.width(),
        decoder.height(),
        scaling::Flags::BILINEAR,
        // scaling::Flags::LANCZOS,
    )?;

    let mut sorted_frame_numbers: BTreeSet<_> = frame_numbers.iter().copied().collect();
    let mut frame_index = 0i64;

    let now = std::time::Instant::now();
    println!("Starting at {}ms", now.elapsed().as_millis());

    'frames: while let Some(&target_frame_number) = sorted_frame_numbers.iter().next() {
        // Seek to the nearest keyframe
        seek_to_frame(&mut ictx, target_frame_number as i64)?;

        while frame_index <= target_frame_number {
            for (stream, packet) in ictx.packets() {
                if stream.index() == video_stream_index {
                    decoder.send_packet(&packet)?;
                    let mut decoded = Video::empty();
                    while decoder.receive_frame(&mut decoded).is_ok() {
                        if frame_index == target_frame_number {
                            let mut rgb_frame = Video::empty();
                            scaler.run(&decoded, &mut rgb_frame)?;
                            let frame_data = rgb_frame.data(0);
                            let img = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(
                                decoder.width() as u32,
                                decoder.height() as u32,
                                frame_data.to_vec(),
                            )
                            .ok_or_else(|| ffmpeg::Error::InvalidData)?;
                            images.push(DynamicImage::ImageRgb8(img));
                            sorted_frame_numbers.remove(&target_frame_number);
                            if sorted_frame_numbers.is_empty() {
                                break 'frames;
                            }
                        }
                        frame_index += 1;
                    }
                }
            }
        }
    }

    println!("Done in {}ms", now.elapsed().as_millis());

    Ok(images)
}

pub fn extract_all_frames_from_video(video_path: &str) -> Result<Vec<DynamicImage>, ffmpeg::Error> {
    ffmpeg::init()?;

    let mut images = Vec::new();
    let mut ictx = format::input(&video_path)?;
    let input_stream = ictx
        .streams()
        .best(media::Type::Video)
        .ok_or(ffmpeg::Error::StreamNotFound)?;
    let video_stream_index = input_stream.index();

    let context_decoder =
        ffmpeg::codec::context::Context::from_parameters(input_stream.parameters())?;
    let mut decoder = context_decoder.decoder().video()?;

    let mut scaler = scaling::Context::get(
        decoder.format(),
        decoder.width(),
        decoder.height(),
        Pixel::RGB24,
        decoder.width(),
        decoder.height(),
        scaling::Flags::BILINEAR,
    )?;

    let now = std::time::Instant::now();
    println!("All frames: Starting at {}ms", now.elapsed().as_millis());

    for (stream, packet) in ictx.packets() {
        if stream.index() == video_stream_index {
            decoder.send_packet(&packet)?;
            let mut decoded = Video::empty();
            while decoder.receive_frame(&mut decoded).is_ok() {
                let mut rgb_frame = Video::empty();
                scaler.run(&decoded, &mut rgb_frame)?;
                let frame_data = rgb_frame.data(0);
                let img = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(
                    decoder.width() as u32,
                    decoder.height() as u32,
                    frame_data.to_vec(),
                )
                .ok_or_else(|| ffmpeg::Error::InvalidData)?;
                images.push(DynamicImage::ImageRgb8(img));
            }
        }
    }

    println!("All frames: Done in {}ms", now.elapsed().as_millis());

    Ok(images)
}

fn seek_to_frame(
    ictx: &mut format::context::Input,
    frame_number: i64,
) -> Result<(), ffmpeg::Error> {
    unsafe {
        let ret = ffmpeg::sys::avformat_seek_file(
            ictx.as_mut_ptr(),
            -1,                // Stream index -1 for default stream time base
            i64::MIN,          // Minimum timestamp
            frame_number,      // Target frame number as timestamp
            i64::MAX,          // Maximum timestamp
            AVSEEK_FLAG_FRAME, // Seeking by frame number
        );

        if ret < 0 {
            Err(ffmpeg::Error::from(ret))
        } else {
            Ok(())
        }
    }
}
