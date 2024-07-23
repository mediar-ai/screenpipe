class Screenpipe < Formula
    desc "Library to build personalized AI powered by what you've seen, said, or heard."
    homepage "https://github.com/louis030195/screen-pipe"
    url "https://github.com/louis030195/screen-pipe/releases/download/v0.1.38/screenpipe-0.1.38-aarch64-apple-darwin.tar.gz"
    version "0.1.38"

    on_macos do
      if Hardware::CPU.arm?
        url "https://github.com/louis030195/screen-pipe/releases/download/v#{version}/screenpipe-#{version}-aarch64-apple-darwin.tar.gz"
        sha256 "15f5dc0e296e774e55e029ad7944c93064658890c933b4db42434575a975c733" # arm64
      else
        url "https://github.com/louis030195/screen-pipe/releases/download/v#{version}/screenpipe-#{version}-x86_64-apple-darwin.tar.gz"
        sha256 "todo" # x86_64
      end
    end
    
    depends_on "ffmpeg"
    depends_on "tesseract"
  
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

# aarch64-apple-darwin
# cargo build --release --features metal --target aarch64-apple-darwin
# tar -czf screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz -C target/release screenpipe
# shasum -a 256 screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz
# gh release upload v${VERSION} screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz
# rm screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz

# x86_64-apple-darwin
# export PKG_CONFIG_PATH="/usr/local/opt/ffmpeg/lib/pkgconfig:$PKG_CONFIG_PATH"
# export PKG_CONFIG_ALLOW_CROSS=1
# cargo build --release --features metal --target x86_64-apple-darwin
# tar -czf screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz -C target/release screenpipe
# shasum -a 256 screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
# gh release upload v${VERSION} screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
# rm screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz


# update the ruby code above (version and sha256)
# git add Formula/screenpipe.rb
# git commit -m "chore: update brew to version ${VERSION}"
# git push

# brew tap louis030195/screen-pipe https://github.com/louis030195/screen-pipe.git
# brew install screenpipe

# todo automate this in the future, not urgent for now ..

