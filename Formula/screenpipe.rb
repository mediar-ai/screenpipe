class Screenpipe < Formula
    desc "Chat with an AI that knows everything about you."
    homepage "https://github.com/louis030195/screen-pipe"
    url "https://github.com/louis030195/screen-pipe/releases/download/v0.1.34/screenpipe-0.1.34-x86_64-apple-darwin.tar.gz"
    sha256 "f74b35531c648db63d9fe1f52720d5b406168f6aa5ef695c2b5eff99105d260d"
    version "0.1.34"
    
    depends_on "ffmpeg"
  
    def install
        bin.install "screenpipe"
    end
  
    test do
      system "#{bin}/screenpipe", "-h"
    end
  end

# push stuff
# git tag v0.1.34
# git push origin v0.1.34
# wait linux release
# then

# cargo build --release --features metal
# tar -czf screenpipe-0.1.34-x86_64-apple-darwin.tar.gz -C target/release screenpipe
# shasum -a 256 screenpipe-0.1.34-x86_64-apple-darwin.tar.gz
# gh release upload v0.1.34 screenpipe-0.1.34-x86_64-apple-darwin.tar.gz
# rm screenpipe-0.1.34-x86_64-apple-darwin.tar.gz

# brew tap louis030195/screen-pipe https://github.com/louis030195/screen-pipe.git
# brew install screenpipe

# todo automate this in the future, not urgent for now ..

