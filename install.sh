#!/usr/bin/env bash
# Install the `yeet` CLI by downloading the right prebuilt binary for this
# machine from GitHub Releases. No Bun or Node required to run the binary.
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/yeet/main/install.sh | bash
#
# Env vars:
#   YEET_REPO     GitHub "owner/repo" to download from (default below)
#   YEET_VERSION  Release tag to install (default: latest)
#   YEET_BIN_DIR  Install location (default: /usr/local/bin, or ~/.local/bin)
set -euo pipefail

REPO="${YEET_REPO:-caelinsutch/yeet}"
VERSION="${YEET_VERSION:-latest}"

# --- detect platform ---------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
Darwin) os="darwin" ;;
Linux) os="linux" ;;
*)
	echo "Unsupported OS: $os (use the Windows binary manually)" >&2
	exit 1
	;;
esac
case "$arch" in
x86_64 | amd64) arch="x64" ;;
arm64 | aarch64) arch="arm64" ;;
*)
	echo "Unsupported architecture: $arch" >&2
	exit 1
	;;
esac
asset="yeet-${os}-${arch}"

# --- resolve download url ----------------------------------------------------
if [ "$VERSION" = "latest" ]; then
	url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
	url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
fi

# --- pick an install dir -----------------------------------------------------
if [ -n "${YEET_BIN_DIR:-}" ]; then
	bin_dir="$YEET_BIN_DIR"
elif [ -w "/usr/local/bin" ] 2>/dev/null; then
	bin_dir="/usr/local/bin"
else
	bin_dir="$HOME/.local/bin"
fi
mkdir -p "$bin_dir"
dest="$bin_dir/yeet"

echo "Downloading $asset ($VERSION) from $REPO …"
if ! curl -fsSL "$url" -o "$dest"; then
	echo "Download failed. Check that a release exists at:" >&2
	echo "  $url" >&2
	exit 1
fi
chmod +x "$dest"

echo "✓ Installed yeet to $dest"
case ":$PATH:" in
*":$bin_dir:"*) ;;
*) echo "Note: add $bin_dir to your PATH:  export PATH=\"$bin_dir:\$PATH\"" ;;
esac
echo "Run 'yeet --help' to get started."
