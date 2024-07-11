class Screenpipe < Formula
    desc "Chat with an AI that knows everything about you."
    homepage "https://github.com/louis030195/screen-pipe"
    url "https://github.com/louis030195/screen-pipe/releases/download/v0.1.34/screenpipe-0.1.34-x86_64-apple-darwin.tar.gz"
    sha256 "269e9c8149b9b6a12050e936ca7d811dbe58179d75cb5e754ada8052af7999cb"
    version "0.1.34"
    
    depends_on "ffmpeg"
  
    def install
        bin.install "screenpipe"
    end
  
    test do
      system "#{bin}/screenpipe", "-h"
    end
  end

# cargo build --release --features metal
# tar -czf screenpipe-0.1.34-x86_64-apple-darwin.tar.gz -C target/release screenpipe
# shasum -a 256 screenpipe-0.1.34-x86_64-apple-darwin.tar.gz
# gh release upload v0.1.34 screenpipe-0.1.34-x86_64-apple-darwin.tar.gz
# rm screenpipe-0.1.34-x86_64-apple-darwin.tar.gz

# brew tap louis030195/screen-pipe https://github.com/louis030195/screen-pipe.git
# brew install screenpipe
