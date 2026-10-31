# Web app khách hàng (Flutter PWA) + Caddy làm máy chủ web, HTTPS tự động và chuyển tiếp tới API/Admin.
# App quán & shipper là app cài đặt (APK) — build ở CI, không phục vụ qua web.
FROM ghcr.io/cirruslabs/flutter:3.47.9 AS flutter
WORKDIR /src/mobile
COPY mobile/ ./
ARG API_URL
RUN flutter pub get \
 && cd apps/customer && flutter build web --release --no-web-resources-cdn --dart-define=API_URL=$API_URL

FROM caddy:2
COPY --from=flutter /src/mobile/apps/customer/build/web /srv/customer
COPY infra/Caddyfile /etc/caddy/Caddyfile
