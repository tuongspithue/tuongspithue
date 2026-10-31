#!/usr/bin/env bash
# Chạy thử toàn bộ Ship Quanh Tôi trong GitHub Codespaces (hoặc trên máy cá nhân) — xem docs/17-chay-thu-codespaces.md.
#
#   bash scripts/codespace.sh            bật API, Admin Console, web app khách (lần đầu tự tạo dữ liệu mẫu)
#   bash scripts/codespace.sh code SĐT   cấp mã kích hoạt 8 số cho một số điện thoại (Admin, quán, shipper)
#   bash scripts/codespace.sh seed       tạo lại dữ liệu mẫu và in mã kích hoạt mới
#   bash scripts/codespace.sh logs       xem nhật ký API
#   bash scripts/codespace.sh stop       tắt tất cả
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STATE="$ROOT/.devcontainer/local"           # bí mật, nhật ký, ảnh tải lên — không đưa lên git
ENV_FILE="$STATE/env"
mkdir -p "$STATE/logs" "$STATE/uploads"
export PATH="$HOME/flutter/bin:$PATH"

# Bước cài đặt khi tạo Codespace chưa xong hoặc bị lỗi: tự cài lại trước khi chạy.
if [ ! -d node_modules ] || ! command -v pnpm >/dev/null 2>&1 || ! command -v flutter >/dev/null 2>&1; then
  echo "==> Chưa cài đủ công cụ — đang cài (một lần, ~10 phút)"
  bash .devcontainer/setup.sh
  export PATH="$HOME/flutter/bin:$PATH"
fi

# ---------- Địa chỉ công khai ----------
url_for() {
  if [ -n "${CODESPACE_NAME:-}" ]; then
    echo "https://${CODESPACE_NAME}-$1.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  else
    echo "http://localhost:$1"
  fi
}
API_URL="$(url_for 3000)"
ADMIN_URL="$(url_for 3001)"
APP_URL="$(url_for 8080)"
export DATABASE_URL="${DATABASE_URL:-postgres://sqt:sqt@localhost:5432/sqt}"

# ---------- Bí mật: tạo một lần, giữ nguyên giữa các lần chạy ----------
if [ ! -f "$ENV_FILE" ]; then
  echo "==> Tạo khoá bí mật lần đầu ($ENV_FILE)"
  secret() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
  VAPID="$(cd apps/api && node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")"
  cat > "$ENV_FILE" <<EOF
# Sửa ADMIN_PHONES thành số của bạn, SEED_LAT/SEED_LNG thành toạ độ nơi bạn đứng thử (lấy trên Google Maps),
# rồi chạy lại: bash scripts/codespace.sh seed
ADMIN_PHONES=0900000001
SEED_LAT=17.539719890428422
SEED_LNG=106.57436128536212
JWT_SECRET=$(secret)
AI_KEY_ENCRYPTION_KEY=$(secret)
VAPID_PUBLIC_KEY=${VAPID% *}
VAPID_PRIVATE_KEY=${VAPID#* }
VAPID_SUBJECT=mailto:admin@example.com
EOF
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export TEST_PHASE=true PUBLIC_API_URL="$API_URL" UPLOAD_DIR="$STATE/uploads" CORS_ORIGINS="$APP_URL,$ADMIN_URL"

api_js() { (cd apps/api && node "dist/src/database/$1.js" "${@:2}"); }

# Build lại máy chủ từ mã mới nhất (sau git pull) — seed/code/start đều chạy bản vừa build.
build_api() {
  echo "==> Build máy chủ API"
  pnpm --filter @sqt/domain build >/dev/null
  pnpm --filter @sqt/api build >/dev/null
}

stop_all() {
  for name in api admin web; do
    if [ -f "$STATE/$name.pid" ]; then
      kill -- "-$(cat "$STATE/$name.pid")" 2>/dev/null || true   # cả nhóm tiến trình
      rm -f "$STATE/$name.pid"
    fi
  done
}

start_bg() { # tên, thư mục, lệnh... — chạy nền thành nhóm tiến trình riêng để "stop" tắt được hết
  local name=$1 dir=$2
  shift 2
  pushd "$dir" >/dev/null
  setsid nohup "$@" >"$STATE/logs/$name.log" 2>&1 </dev/null &
  echo $! >"$STATE/$name.pid"
  popd >/dev/null
}

wait_http() { # địa chỉ, tên
  for _ in $(seq 1 60); do
    curl -fsS "$1" >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "!! $2 không chạy được. Xem nhật ký: $STATE/logs/" >&2
  exit 1
}

seed() {
  echo "==> Tạo dữ liệu mẫu quanh ($SEED_LAT, $SEED_LNG)"
  api_js seed | tee "$STATE/codes.txt"
  touch "$STATE/seeded"
}

case "${1:-start}" in
  stop)
    stop_all
    echo "Đã tắt."
    exit 0 ;;
  logs)
    exec tail -n 100 -f "$STATE/logs/api.log" ;;
  code)
    [ -n "${2:-}" ] || { echo "Cách dùng: bash scripts/codespace.sh code 0900000001"; exit 1; }
    build_api
    api_js activation-code "$2"
    exit 0 ;;
  seed)
    build_api
    seed
    exit 0 ;;
  start) ;;
  *)
    sed -n '2,9p' "$0"
    exit 1 ;;
esac

build_api

echo "==> Chờ cơ sở dữ liệu và áp dụng migration"
for i in $(seq 1 30); do
  api_js migrate >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "!! Không kết nối được CSDL ($DATABASE_URL)"; exit 1; }
  sleep 2
done
[ -f "$STATE/seeded" ] || seed

stop_all
echo "==> Bật API ($API_URL)"
start_bg api apps/api env PORT=3000 node dist/src/main.js
wait_http "http://localhost:3000/health" "API"

# Admin Console và web app khách gắn địa chỉ API lúc build: chỉ build lại khi địa chỉ đổi (Codespace mới).
if [ "$(cat "$STATE/admin.built" 2>/dev/null)" != "$API_URL" ] || [ ! -d apps/admin/.next ]; then
  echo "==> Build Admin Console (lần đầu ~2 phút)"
  NEXT_PUBLIC_API_URL="$API_URL" NEXT_TELEMETRY_DISABLED=1 pnpm --filter @sqt/admin build >"$STATE/logs/admin-build.log" 2>&1 \
    || { echo "!! Build Admin lỗi, xem $STATE/logs/admin-build.log"; exit 1; }
  echo "$API_URL" >"$STATE/admin.built"
fi
echo "==> Bật Admin Console ($ADMIN_URL)"
start_bg admin apps/admin env NEXT_TELEMETRY_DISABLED=1 node_modules/.bin/next start -p 3001
wait_http "http://localhost:3001/login" "Admin Console"

WEB_DIR=mobile/apps/customer/build/web
if [ "$(cat "$STATE/web.built" 2>/dev/null)" != "$API_URL" ] || [ ! -f "$WEB_DIR/index.html" ]; then
  echo "==> Build web app khách (lần đầu ~3 phút)"
  (cd mobile/apps/customer && flutter build web --release --no-web-resources-cdn --dart-define=API_URL="$API_URL") >"$STATE/logs/web-build.log" 2>&1 \
    || { echo "!! Build web app lỗi, xem $STATE/logs/web-build.log"; exit 1; }
  echo "$API_URL" >"$STATE/web.built"
fi
echo "==> Bật web app khách ($APP_URL)"
start_bg web . node scripts/serve-static.mjs "$WEB_DIR" 8080
wait_http "http://localhost:8080/" "Web app khách"

# Điện thoại chỉ vào được khi cổng ở chế độ Public.
PUBLIC_NOTE=""
if [ -n "${CODESPACE_NAME:-}" ]; then
  if gh codespace ports visibility 3000:public 3001:public 8080:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then
    PUBLIC_NOTE="Đã đặt 3 cổng ở chế độ Public."
  else
    PUBLIC_NOTE="!! Chưa tự đặt Public được: mở tab PORTS, chuột phải từng cổng 3000, 3001, 8080 → Port Visibility → Public."
  fi
fi

cat <<EOF

================ Ship Quanh Tôi đang chạy ================
  Web app khách : $APP_URL
  Admin Console : $ADMIN_URL
  API           : $API_URL
  $PUBLIC_NOTE

  Mã kích hoạt (Admin, quán, shipper mẫu): $STATE/codes.txt
  Cấp mã mới   : bash scripts/codespace.sh code <SĐT>
  App Android  : đặt biến API_URL=$API_URL trên GitHub (Settings → Variables) rồi chạy lại CI để lấy APK
  Nhật ký      : bash scripts/codespace.sh logs      Tắt: bash scripts/codespace.sh stop
==========================================================
EOF
