use std::io::Write;
pub struct MultiWriter {
    writers: Vec<Box<dyn Write + Send>>,
}

impl MultiWriter {
    pub fn new(writers: Vec<Box<dyn Write + Send>>) -> Self {
        MultiWriter { writers }
    }
}

impl Write for MultiWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        for writer in &mut self.writers {
            writer.write_all(buf)?;
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        for writer in &mut self.writers {
            writer.flush()?;
        }
        Ok(())
    }
}

use std::fs::{File, OpenOptions};
use std::io::{self, Seek, SeekFrom};
use tracing_subscriber::fmt::writer::MakeWriter;

const MAX_LOG_SIZE: u64 = 100 * 1024 * 1024; // 100 MB

pub struct SingleFileRollingWriter {
    file: File,
    path: std::path::PathBuf,
}

impl SingleFileRollingWriter {
    pub fn new(path: impl Into<std::path::PathBuf>) -> io::Result<Self> {
        let path = path.into();
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        Ok(Self { file, path })
    }

    fn roll(&mut self) -> io::Result<()> {
        let metadata = self.file.metadata()?;
        if metadata.len() > MAX_LOG_SIZE {
            let mut content = Vec::new();
            self.file.seek(SeekFrom::Start(0))?;
            io::copy(&mut self.file, &mut content)?;

            // Truncate to half the max size
            content.truncate((MAX_LOG_SIZE / 2) as usize);

            // Rewrite the file with truncated content
            self.file = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&self.path)?;
            self.file.write_all(&content)?;
            self.file.seek(SeekFrom::End(0))?;
        }
        Ok(())
    }
}

impl Write for SingleFileRollingWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.roll()?;
        self.file.write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

impl<'a> MakeWriter<'a> for SingleFileRollingWriter {
    type Writer = Self;

    fn make_writer(&self) -> Self::Writer {
        SingleFileRollingWriter::new(&self.path).expect("Failed to create writer")
    }
}
