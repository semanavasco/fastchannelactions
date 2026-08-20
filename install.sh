#!/usr/bin/env bash
#
# FastChannelActions installer for Linux and macOS.
#
# Installs the plugin into a Vencord source checkout, builds it, and (for Discord
# Desktop) patches the client. Works for both Vencord and Vesktop.
#
# Usage:  ./install.sh
#
set -euo pipefail

PLUGIN_NAME="fastChannelActions"
REPO_URL="https://github.com/svasco/FastChannelActions.git"
VENCORD_REPO="https://github.com/Vendicated/Vencord.git"

bold()  { printf '\033[1m%s\033[0m\n' "$1"; }
info()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m!\033[0m  %s\n' "$1"; }
die()   { printf '\033[31mx\033[0m  %s\n' "$1" >&2; exit 1; }

bold "FastChannelActions installer"
echo

# --- Prerequisites --------------------------------------------------------------
missing=()
for cmd in git node pnpm; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done

if [ ${#missing[@]} -gt 0 ]; then
    die "Missing required tools: ${missing[*]}
    git:  https://git-scm.com/downloads
    node: https://nodejs.org/en/download/  (v22 or newer)
    pnpm: https://pnpm.io/installation
Install them, make sure they are on your PATH, then run this script again."
fi

node_major="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
[ "$node_major" -ge 22 ] || die "Node.js v22+ is required (found $(node --version))."

info "git, node $(node --version), pnpm $(pnpm --version) found"

# --- Locate or clone Vencord ----------------------------------------------------
# The script may be run from inside an existing Vencord checkout, from the plugin
# repo, or from anywhere at all.
find_vencord() {
    local dir="$PWD"
    while [ "$dir" != "/" ]; do
        if [ -f "$dir/package.json" ] && grep -q '"name": *"vencord"' "$dir/package.json" 2>/dev/null; then
            echo "$dir"; return 0
        fi
        dir="$(dirname "$dir")"
    done
    for guess in "$PWD/Vencord" "$HOME/Vencord" "$HOME/Documents/Vencord"; do
        if [ -f "$guess/package.json" ] && grep -q '"name": *"vencord"' "$guess/package.json" 2>/dev/null; then
            echo "$guess"; return 0
        fi
    done
    return 1
}

if [ -n "${VENCORD_DIR:-}" ]; then
    # Explicit override, e.g. VENCORD_DIR=~/src/Vencord ./install.sh
    [ -f "$VENCORD_DIR/package.json" ] || die "VENCORD_DIR is set but $VENCORD_DIR is not a Vencord checkout."
    info "Using Vencord checkout from VENCORD_DIR: $VENCORD_DIR"
elif VENCORD_DIR="$(find_vencord)"; then
    info "Using existing Vencord checkout: $VENCORD_DIR"
else
    # Cloning a second copy when the user already has one elsewhere would build a
    # plugin they never load, so confirm rather than assume.
    DEFAULT_DIR="$PWD/Vencord"
    warn "No Vencord checkout found nearby."
    echo "    If you already have one, re-run with:  VENCORD_DIR=/path/to/Vencord $0"
    echo
    printf 'Clone a fresh copy into %s? [y/N] ' "$DEFAULT_DIR"
    read -r reply
    case "$reply" in
        [yY]*) ;;
        *) die "Aborted. Set VENCORD_DIR to your existing checkout and run again." ;;
    esac

    VENCORD_DIR="$DEFAULT_DIR"
    info "Cloning Vencord into $VENCORD_DIR"
    git clone --depth 1 "$VENCORD_REPO" "$VENCORD_DIR"
fi

# --- Install the plugin ---------------------------------------------------------
TARGET="$VENCORD_DIR/src/userplugins/$PLUGIN_NAME"
mkdir -p "$VENCORD_DIR/src/userplugins"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -d "$TARGET" ] && [ "$(cd "$TARGET" && pwd)" = "$SCRIPT_DIR" ]; then
    info "Plugin already in place"
elif [ -f "$SCRIPT_DIR/index.tsx" ]; then
    info "Copying plugin files into $TARGET"
    rm -rf "$TARGET"
    mkdir -p "$TARGET"
    # Only the plugin sources; not the installer or repo metadata.
    for f in "$SCRIPT_DIR"/*.ts "$SCRIPT_DIR"/*.tsx "$SCRIPT_DIR"/*.css; do
        [ -e "$f" ] && cp "$f" "$TARGET/"
    done
else
    info "Cloning plugin into $TARGET"
    rm -rf "$TARGET"
    git clone --depth 1 "$REPO_URL" "$TARGET"
fi

# --- Build ----------------------------------------------------------------------
cd "$VENCORD_DIR"
info "Installing dependencies (this can take a minute)"
pnpm install --frozen-lockfile

info "Building Vencord with FastChannelActions"
pnpm build

# Vesktop validates the folder by checking for package.json alongside the built
# files. pnpm build does not emit one, and without it Vesktop decides the install is
# invalid and silently redownloads stock Vencord over the top of this build.
[ -f dist/package.json ] || echo '{}' > dist/package.json

grep -q FastChannelActions dist/vencordDesktopRenderer.js \
    || die "Build finished but the plugin is not in the output. Please report this."

echo
bold "Build complete."
echo

# --- Final step depends on the client -------------------------------------------
cat <<EOF
Last step — pick the one that matches your client:

  $(bold "Discord Desktop (Vencord)")
      cd "$VENCORD_DIR"
      pnpm inject
    Then follow the prompts and restart Discord.

  $(bold "Vesktop")
      1. Open Vesktop
      2. Settings -> Vesktop Settings -> Vencord Location -> Change
      3. Select: $VENCORD_DIR/dist
      4. Fully quit and reopen Vesktop

Then open Settings -> Plugins, search "FastChannelActions", and enable it.
EOF

if command -v flatpak >/dev/null 2>&1 && flatpak list 2>/dev/null | grep -qi vesktop; then
    echo
    warn "Vesktop flatpak detected. Grant it access to this folder, or it will not be able to read the build:"
    echo "    flatpak override --user dev.vencord.Vesktop --filesystem=\"$VENCORD_DIR\""
fi
