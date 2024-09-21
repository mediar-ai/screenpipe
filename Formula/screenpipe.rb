class Screenpipe < Formula
  desc "Library to build personalized AI powered by what you've seen, said, or heard."
  homepage "https://github.com/mediar-ai/screenpipe"
  url "https://github.com/mediar-ai/screenpipe/releases/download/v0.1.88/screenpipe-0.1.88-aarch64-apple-darwin.tar.gz"
  version "0.1.88"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mediar-ai/screenpipe/releases/download/v#{version}/screenpipe-#{version}-aarch64-apple-darwin.tar.gz"
      sha256 "2899e5cb4126c2e0f8822232e066ed49c03a47baf80dca524cce4a539735968f" # arm64
    else
      url "https://github.com/mediar-ai/screenpipe/releases/download/v#{version}/screenpipe-#{version}-x86_64-apple-darwin.tar.gz"
      sha256 "e48a1a3e631edfeef0a16f96490479739d8bc3b548133ad6627f5f29a8e33c90" # x86_64
    end
  end
  
  depends_on "ffmpeg"

  def install
    bin.install Dir["bin/*"]
    lib.install Dir["lib/*"]
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
# or create release
# gh release create v$VERSION --generate-notes
# then

# aarch64-apple-darwin
=begin
cargo build --release --features metal,pipes --target aarch64-apple-darwin
tar -czf screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz -C target/release screenpipe
shasum -a 256 screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz
gh release upload v${VERSION} screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz
rm screenpipe-${VERSION}-aarch64-apple-darwin.tar.gz
=end

# x86_64-apple-darwin
=begin
export PKG_CONFIG_PATH="/usr/local/opt/ffmpeg/lib/pkgconfig:$PKG_CONFIG_PATH"
export PKG_CONFIG_ALLOW_CROSS=1
cargo build --release --features metal,pipes --target x86_64-apple-darwin
tar -czf screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz -C target/release screenpipe
shasum -a 256 screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
gh release upload v${VERSION} screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
rm screenpipe-${VERSION}-x86_64-apple-darwin.tar.gz
=end

# update the ruby code above (version and sha256)
=begin
git add Formula/screenpipe.rb
git commit -m "chore: update brew to version ${VERSION}"
git push
=end

# brew tap mediar-ai/screenpipe https://github.com/mediar-ai/screenpipe.git
# brew install screenpipe

# todo automate this in the future, not urgent for now ..