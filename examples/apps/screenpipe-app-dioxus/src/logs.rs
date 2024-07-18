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
