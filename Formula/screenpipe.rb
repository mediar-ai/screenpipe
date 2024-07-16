class Screenpipe < Formula
    desc "Chat with an AI that knows everything about you."
    homepage "https://github.com/louis030195/screen-pipe"
    url "https://github.com/louis030195/screen-pipe/releases/download/v0.1.34/screenpipe-0.1.34-x86_64-apple-darwin.tar.gz"
    sha256 "f74b35531c648db63d9fe1f52720d5b406168f6aa5ef695c2b5eff99105d260d"
    version "0.1.35"
    
    depends_on "ffmpeg"
  
    def install
        bin.install "screenpipe"
    end
  
    test do
      system "#{bin}/screenpipe", "-h"
    end
  end

# push stuff
# VERSION=0.1.35
# git tag v$VERSION
# git push origin v$VERSION
# wait linux release
# then

# cargo build --release --features metal
# tar -czf screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz -C target/release screenpipe
# shasum -a 256 screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
# gh release upload v${VERSION} screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
# rm screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
# update the sha in the ruby code above
# git add Formula/screenpipe.rb
# git commit -m "chore: update brew to version ${VERSION}"
# git push

# brew tap louis030195/screen-pipe https://github.com/louis030195/screen-pipe.git
# brew install screenpipe

# todo automate this in the future, not urgent for now ..

