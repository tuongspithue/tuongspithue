#!/usr/bin/env bash
# Chạy một lần khi tạo Codespace: cài thư viện Node, Flutter (đúng bản CI dùng) và thư viện app.
set -euo pipefail
cd "$(dirname "$0")/.."

FLUTTER_VERSION=3.47.9
FLUTTER_HOME="$HOME/flutter"

echo "==> Cài công cụ hệ thống Flutter cần"
sudo apt-get update -qq && sudo apt-get install -y -qq unzip xz-utils >/dev/null

echo "==> Cài thư viện Node (pnpm)"
corepack enable 2>/dev/null || sudo corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile

if [ ! -x "$FLUTTER_HOME/bin/flutter" ]; then
  echo "==> Cài Flutter $FLUTTER_VERSION"
  git clone --depth 1 --branch "$FLUTTER_VERSION" https://github.com/flutter/flutter.git "$FLUTTER_HOME"
fi
grep -q 'flutter/bin' "$HOME/.bashrc" || echo 'export PATH="$HOME/flutter/bin:$PATH"' >> "$HOME/.bashrc"
export PATH="$FLUTTER_HOME/bin:$PATH"
flutter config --no-analytics --enable-web >/dev/null
flutter precache --web
(cd mobile && flutter pub get)

echo "==> Xong. Chạy hệ thống bằng: bash scripts/codespace.sh"
