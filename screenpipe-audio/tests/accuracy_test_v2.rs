// cargo test --package screenpipe-audio --test accuracy_test_v2 --features test-utils --features metal --features test-utils -- tests --show-output --nocapture


// Add this at the end of the file
#[cfg(feature = "test-utils")]
#[cfg(test)]
pub mod tests {
    use rand::seq::SliceRandom;
    use rand::thread_rng;
    use screenpipe_audio::{
        constants::{Config, TRANSCRIPTION_PROCESSING_URL},
        create_whisper_channel, record_and_transcribe,
        vad_engine::{SileroVad, VadEngine},
        AudioStream, AudioTranscriptionEngine,
    };
    use screenpipe_core::Language;
    use std::{
        collections::HashMap,
        fs,
        path::PathBuf,
        process::{Command, Stdio},
        sync::{Arc, Mutex},
    };
    use strsim::levenshtein;
    use tempfile::tempdir;

    async fn download_test_samples() -> anyhow::Result<Vec<(String, String)>> {
        let test_data_dir = std::env::current_dir()?.join("test_data");
        fs::create_dir_all(&test_data_dir)?;

        // LibriSpeech samples - larger set to choose from
        let samples = vec![
            // Dev-clean samples
            ("https://www.openslr.org/resources/12/dev-clean/1272/128104/1272-128104-0000.wav", 
             "mister quilter is the apostle of the middle classes and we are glad to welcome his gospel"),
            ("https://www.openslr.org/resources/12/dev-clean/1272/128104/1272-128104-0001.wav",
             "nor is mister quilter's manner less interesting than his matter"),
            ("https://www.openslr.org/resources/12/dev-clean/1272/128104/1272-128104-0002.wav",
             "he tells us that at this very moment there are people silly enough to practice art for art's sake"),
            // Dev-other samples (more challenging)
            ("https://www.openslr.org/resources/12/dev-other/116/288045/116-288045-0000.wav",
             "the time of the year at which this circuit is most practicable is from the beginning of february to the end of march"),
            ("https://www.openslr.org/resources/12/dev-other/116/288045/116-288045-0001.wav",
             "i shall take the liberty to make a few observations on the nature of the land in the above circuit"),
            // Test-clean samples
            ("https://www.openslr.org/resources/12/test-clean/1089/134686/1089-134686-0000.wav",
             "she had a fine genius for poetry combined with real business talent"),
            ("https://www.openslr.org/resources/12/test-clean/1089/134686/1089-134686-0001.wav",
             "and she was always ready to give of these to the full measure of her ability"),
            // Female speakers
            ("https://www.openslr.org/resources/12/test-clean/2277/149896/2277-149896-0000.wav",
             "there was a man in our town and he was wondrous wise"),
            ("https://www.openslr.org/resources/12/test-clean/2277/149896/2277-149896-0001.wav",
             "he jumped into a bramble bush and scratched out both his eyes"),
            // Different accents
            ("https://www.openslr.org/resources/12/test-other/2428/83699/2428-83699-0000.wav",
             "once upon a time there were four little rabbits"),
            ("https://www.openslr.org/resources/12/test-other/2428/83699/2428-83699-0001.wav",
             "their names were flopsy mopsy cottontail and peter"),
            // More challenging samples
            ("https://www.openslr.org/resources/12/test-other/3752/6415/3752-6415-0000.wav",
             "the scientific name of the black widow spider is latrodectus mactans"),
            ("https://www.openslr.org/resources/12/test-other/3752/6415/3752-6415-0001.wav",
             "in the winter they hibernate in dark sheltered places"),
            // Add more samples as needed...
        ];

        let client = reqwest::Client::new();
        let mut downloaded_samples = Vec::new();

        // Randomly shuffle the samples
        let mut rng = thread_rng();
        let mut shuffled_samples = samples.clone();
        shuffled_samples.shuffle(&mut rng);

        // Take first 5 samples (or however many you want to test with)
        for (i, (url, transcript)) in shuffled_samples.iter().take(5).enumerate() {
            let wav_path = test_data_dir.join(format!("accuracy{}.wav", i + 1));

            // Download only if file doesn't exist
            if !wav_path.exists() {
                println!("downloading sample {} from {}", i + 1, url);
                let response = client.get(*url).send().await?;
                let bytes = response.bytes().await?;
                fs::write(&wav_path, bytes)?;
            }

            downloaded_samples.push((
                wav_path.to_str().unwrap().to_string(),
                transcript.to_string(),
            ));
        }

        Ok(downloaded_samples)
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 8)]
    async fn test_transcription_accuracy_direct() {
        let start_time = std::time::Instant::now();

        // ?% accuracy 1, 4000, 2.0, 1.0, 700, 1500
        let test_config = Config {
            overlap_seconds: 1,
            chunk_duration_ms: 4000.0,
            pre_speech_buffer_duration_secs: 2.0,
            vad_buffer_duration_secs: 1.0,
            speech_threshold_duration_ms: 700,
            silence_threshold_duration_ms: 1500,

            ..Config::new("test_config".to_string())
        }
        .set_as_active();

        println!(
            "starting transcription accuracy test with config: {}",
            test_config.name
        );

        // Download test samples
        // let downloaded_samples = download_test_samples()
        //     .await
        //     .expect("Failed to download test samples");

        // Setup test cases
        let mut test_cases: Vec<(String, &str)> = vec![
            ("test_data/accuracy1.wav", r#"yo louis, here's the tldr of that mind-blowing meeting:
        - bob's cat walked across his keyboard 3 times. productivity increased by 200%.
        - sarah's virtual background glitched, revealing she was actually on a beach. no one noticed.
        - you successfully pretended to be engaged while scrolling twitter. achievement unlocked!
        - 7 people said "you're on mute" in perfect synchronization. new world record.
        - meeting could've been an email. shocking.
        key takeaway: we're all living in a simulation, and the devs are laughing.
        peace out, llama3.2:3b-instruct-q4_K_M"#),
            ("test_data/accuracy2.wav", r#"bro - got some good stuff from screenpipe here's the lowdown on your day, you productivity ninja:
        - absolutely demolished that 2-hour coding sesh on the new feature. the keyboard is still smoking, bro!
        - crushed 3 client calls like a boss. they're probably writing love letters to you as we speak, make sure to close john tomorrow 8.00 am according to our notes, let the cash flow in!
        - spent 45 mins on slack. 90% memes, 10% actual work. perfectly balanced, as all things should be
        - watched a rust tutorial. way to flex those brain muscles, you nerd!
        overall, you're killing it! 80% of your time on high-value tasks. the other 20%? probably spent admiring your own reflection, you handsome devil.
        PS: seriously, quit tiktok. your FBI agent is getting bored watching you scroll endlessly.
        what's the plan for tomorrow? more coding? more memes? world domination?
        generated by your screenpipe ai assistant (who's definitely not planning to take over the world... yet)"#),
            ("test_data/accuracy3.wav", r#"again, screenpipe allows you to get meeting summaries, locally, without leaking data to OpenAI, with any apps, like WhatsApp, Meet, Zoom, etc. and it's open source at github.com/mediar-ai/screenpipe"#),
            ("test_data/accuracy4.wav", r#"Eventually but, I mean, I feel like but, I mean, first, I mean, you think your your vision smart will be interesting because, yeah, you install once. You pay us, you install once. That that yours. So, basically, all the time Microsoft explained, you know, MS Office, long time ago, you just buy the the the software that you can using there forever unless you wanna you wanna update upgrade is the better version. Right? So it's a little bit, you know"#),
            ("test_data/accuracy5.wav", r#"Thank you. Yeah. So I cannot they they took it, refresh because of my one set top top time. And, also, second thing is, your byte was stolen. By the time?"#),
            ("test_data/accuracy6.wav", r#"To tell you basically what this is about is when I was watching Harvey Mackay at one of Harv Eker's things, he said he just finished the Boston marathon and you know, the guy is 76 and I went holy crap, you know, that is amazing. He looked so fit and he is so quick minded and so on I thought, all of a sudden it occurred to me I bet the way you eat, you know, is different. I bet you don't just eat a bunch of garbage and that started this thought. So, the basic three questions will be and I am recording it for you as well if I transcribe these for the book, but then I write about it and what has really been neat about it is that what started out as three same questions to everybody, everybody had kind of a different angle on it and I realized that they were creating the chapters for this book and of course Marci Shimoff read me right [???], I am not doing something where I did all the work and you are just transcribing it, but if you actually write in the book, I will do it. So I made her that promise and it was a hard promise, but it was a good one to make because it made me think more, you know.

Got you.

So, what I would do is I basically introduce you and then you can add anything that you think is important to that introduction and let me get my history up here because I have you on here. So, how is Robby doing?

Good, hangin' in there.

Yeah, did you guys have a nice holiday?

Well, we actually kind of had a [???] holiday, her father who is very old got sick and ended up passing away.

Oh I am sorry to hear that.

But, you know, stuff happens, what are you going to do?

So I am going to – is your best website, at the end I am going to ask you, you know, about your website and stuff, is rickfrishman.com the best one to go to or -

Yeah probably just for most stuff that is probably the best way to go yeah.

You had a really good bio on one of your websites.

It is up there, there is one, you know, in most of them. I also have rickfrishmanblog.com, you know.

Let me check that out, okay so the -

There is a bio on that one, but it is also a bio on just rickfrishman.com.

There we go about Rick, yeah.

Sure.

So you know, one of the things that I will bring up is, you know, you always talk about how you have the biggest Rolodex and I thought that was a really cool angle too because part of success is who you know and you know, I think that is important. I don't know what your angle is going to be on this, but you know, the questions will be do you think that that hypothesis is true that, you know, food affects your ability to succeed on some level and then if you -

Food affects your ability to -

You know, if it plays into your level of success. In other words, you know, I know there are successful people who eat crappy food, but so far kind of the consensus has been, you know, it has run the gamut of extremes, but so far people seem to say, you know, they can't keep up their energy if you speak a lot. You do a lot of speaking so you know, and you have a hectic schedule, so I imagine that if you are, you know, full of two pizzas, you probably don't have the energy on stage that you normally would.

Right, it is true.

So, that's kind of the angle, but..."#),
            ("test_data/post-agi-kapil.wav", r#"Bro, like, ever since AGI took over, I've been, like, searching for the ultimate truth, you know? I mean, sure, we have infinite resources and all, but what about the soul, man? So, I decided to burn my last NFT as a symbolic gesture, hoping to connect with the cosmic blockchain of the universe.

As the flames consumed the digital art, I felt a surge of enlightenment. It was like the universe whispered, 'Dude, chill. The answer is within.' And just like that, I realized: the true scarcity is not in resources, but in vibes.

So here I am, meditating in my virtual Zen garden, sipping on a kombucha made by AI monks, pondering the mysteries of existence. Remember, fellow techbros, in this post-AGI era, it's not about the tech we create, but the peace we cultivate. Namaste"#),
            // Add more test cases as needed
        ].into_iter()
            .map(|(path, text)| {
                let absolute_path = std::env::current_dir()
                    .unwrap()
                    .join(path)
                    .to_str()
                    .unwrap()
                    .to_string();
                (absolute_path, text)
            })
            .collect();

        // Add downloaded samples
        // test_cases.extend(
        //     downloaded_samples
        //         .iter()
        //         .map(|(path, transcript)| (path.clone(), transcript.as_str())),
        // );

        // Shuffle test cases
        let mut rng = thread_rng();
        test_cases.shuffle(&mut rng);
        println!("shuffled {} test cases", test_cases.len());

        // Create temp dir for merged wav
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let merged_wav_path = temp_dir.path().join("merged.wav");

        // Create file list for ffmpeg
        let file_list_path = temp_dir.path().join("files.txt");
        // Create a silent WAV file
        let silence_path = temp_dir.path().join("silence.wav");
        let silence_status = Command::new("ffmpeg")
            .args([
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=44100:cl=stereo",
                "-t",
                "1", // 1 second of silence
                silence_path.to_str().unwrap(),
            ])
            .stderr(Stdio::null())
            .stdout(Stdio::null())
            .status()
            .expect("Failed to create silence file");

        assert!(silence_status.success(), "Failed to create silence file");

        // Create file list with silence between files
        let file_list_content = test_cases
            .iter()
            .enumerate()
            .map(|(i, (path, _))| {
                if i == test_cases.len() - 1 {
                    format!("file '{}'", path)
                } else {
                    format!("file '{}'\nfile '{}'", path, silence_path.to_str().unwrap())
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(&file_list_path, file_list_content.clone())
            .expect("Failed to write file list");

        println!("ffmpeg file list content:\n{}", file_list_content);

        // Merge WAV files using ffmpeg
        let status = Command::new("ffmpeg")
            .args([
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                file_list_path.to_str().unwrap(),
                "-c",
                "copy",
                merged_wav_path.to_str().unwrap(),
            ])
            .stderr(Stdio::null())
            .stdout(Stdio::null())
            .status()
            .expect("Failed to execute ffmpeg");

        assert!(status.success(), "Failed to merge WAV files");

        // Collect expected transcriptions in order
        let expected_transcription = test_cases
            .iter()
            .map(|(_, text)| text.to_string())
            .collect::<Vec<_>>()
            .join("\n\n");

        println!("expected transcription: \n\n{}", expected_transcription);

        let engine = Arc::new(AudioTranscriptionEngine::WhisperLargeV3Turbo);
        println!("using engine: {}", engine);

        // Create channels
        println!("creating whisper channel");
        let (whisper_sender, whisper_receiver, _shutdown) =
            create_whisper_channel(engine.clone(), None, vec![Language::English])
                .await
                .expect("Failed to create whisper channel");
        println!("whisper channel created successfully");

        let data_dir = Arc::new(PathBuf::from("/tmp/sp-test"));
        println!("using data directory: {:?}", data_dir);

        println!("initializing vad engine");
        let vad = Arc::new(Mutex::new(
            Box::new(SileroVad::new().await.unwrap()) as Box<dyn VadEngine + Send>
        ));
        println!("vad engine initialized");

        // Create audio stream from merged WAV
        println!(
            "creating audio stream from merged file: {:?}",
            merged_wav_path
        );
        let audio_stream = Arc::new(
            AudioStream::from_wav_file(merged_wav_path.to_str().unwrap(), vad.clone())
                .await
                .expect("Failed to create audio stream"),
        );
        println!("audio stream created successfully");

        let whisper_sender_clone = whisper_sender.clone();
        let handle = tokio::spawn(async move {
            match record_and_transcribe(audio_stream.clone(), whisper_sender_clone, data_dir).await
            {
                Ok(_) => println!("record_and_transcribe completed successfully"),
                Err(e) => println!("record_and_transcribe error: {}", e),
            }
        });

        let mut full_transcription = String::new();
        println!("collecting transcriptions from broadcast channel");

        let mut device_transcripts: HashMap<String, (String, Option<i64>)> = HashMap::new();
        let mut buffer_frames: HashMap<String, (Vec<String>, Vec<f32>)> = HashMap::new();
        let mut last_transcription_time = std::time::Instant::now();
        // ! very crappy way to detect if the test ended 
        const IDLE_TIMEOUT: tokio::time::Duration = tokio::time::Duration::from_secs(180); 

        loop {
            while let Ok(mut transcription) = whisper_receiver.try_recv() {
                last_transcription_time = std::time::Instant::now();
                println!(
                    "device {} received transcription {:?}",
                    transcription.input.device, transcription.transcription
                );

                let device_id = transcription.input.device.to_string();
                let (previous_transcript, _) = device_transcripts
                    .entry(device_id.clone())
                    .or_insert((String::new(), None));

                let mut current_transcript: Option<String> = transcription.transcription.clone();
                // println!("current_transcript: {:?}", current_transcript);
                if let Some((_, current)) = if TRANSCRIPTION_PROCESSING_URL.is_empty() {
                    transcription.cleanup_overlap(previous_transcript.clone())
                } else {
                    transcription
                        .cleanup_overlap_llm(previous_transcript.clone())
                        .await
                        .unwrap()
                } {
                    current_transcript = Some(current);
                }
                // println!("current_transcript after cleanup: {:?}", current_transcript);

                transcription.transcription = current_transcript.clone();
                *previous_transcript = current_transcript.unwrap_or_default();

                let frames = buffer_frames
                    .entry(device_id.clone())
                    .or_insert((Vec::new(), Vec::new()));

                if let Some(transcript) = transcription.transcription {
                    frames.0.push(transcript);
                }
                frames.1.extend(
                    transcription
                        .input
                        .data
                        .iter()
                        .flat_map(|segment| segment.frames.iter())
                        .copied(),
                );

                // ignore warning non used frames
                // #![allow(unused)]
                let total_frames = frames.1.len();
                // #![allow(unused)]
                let frames_per_chunk = (tokio::time::Duration::from_secs(3).as_secs_f32()
                    * transcription.input.sample_rate as f32)
                    as usize;

                // keep commented code as it should reflect prod with encoding to disk & db
                // if total_frames < frames_per_chunk {
                //     println!(
                //         "buffering frames until encoding & saving to db: {}/{}",
                //         total_frames, frames_per_chunk
                //     );
                //     continue;
                // }

                let (mut buffered_transcripts, mut frames_to_process) = buffer_frames
                    .get_mut(&device_id)
                    .map(|f| (std::mem::take(&mut f.0), std::mem::take(&mut f.1)))
                    .unwrap_or_default();

                // let remainder_frames = frames_to_process.split_off(frames_per_chunk);
                // let remainder_transcript = if !remainder_frames.is_empty() {
                //     buffered_transcripts.pop()
                // } else {
                //     None
                // };

                // if !remainder_frames.is_empty() || remainder_transcript.is_some() {
                //     if let Some(buffer) = buffer_frames.get_mut(&device_id) {
                //         if let Some(transcript) = remainder_transcript {
                //             buffer.0.push(transcript);
                //         }
                //         buffer.1 = remainder_frames;
                //     }
                // }

                let combined_transcript = buffered_transcripts.join(" ");
                full_transcription.push_str(&combined_transcript);
                full_transcription.push(' ');
            }

            if last_transcription_time.elapsed() > IDLE_TIMEOUT {
                // no data for x seconds, end
                println!(
                    "no new transcriptions for {} seconds, finishing",
                    IDLE_TIMEOUT.as_secs()
                );
                break;
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        // Wait a bit longer to ensure all transcriptions are processed
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        println!("waiting for recording task to complete");
        handle.abort();

        let distance = levenshtein(&expected_transcription, &full_transcription);
        let accuracy = 1.0 - (distance as f64 / expected_transcription.len() as f64);

        println!("=== Test Results ===");
        let elapsed = start_time.elapsed();

        println!("Expected: {}", expected_transcription);
        println!("Actual: {}", full_transcription);

        println!("Expected length: {}", expected_transcription.len());
        println!("Actual length: {}", full_transcription.len());
        println!("Levenshtein distance: {}", distance);
        println!("Accuracy: {:.2}%", accuracy * 100.0);
        println!("Total test duration: {:.2?}", elapsed);

        // Calculate real-time factor (RTF)
        let audio_duration = test_cases.len() as f64 * 3.0; // Assuming each test case is ~3 seconds
        let rtf = elapsed.as_secs_f64() / audio_duration;
        println!("Real-time factor (RTF): {:.2}x", rtf);

        assert!(accuracy > 0.3, "Accuracy below 30%, {}", accuracy);
    }
}


// cargo test --package screenpipe-audio --test accuracy_test_v2 --features test-utils --features metal --features test-utils -- tests --show-output --nocapture

