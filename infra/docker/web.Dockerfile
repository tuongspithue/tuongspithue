# Ba app web (Flutter PWA) + Caddy làm máy chủ web, HTTPS tự động và chuyển tiếp tới API/Admin.
FROM ghcr.io/cirruslabs/flutter:3.47.9 AS flutter
WORKDIR /src/mobile
COPY mobile/ ./
ARG API_URL
RUN flutter pub get \
 && for a in customer merchant rider; do \
      (cd apps/$a && flutter build web --release --no-web-resources-cdn --dart-define=API_URL=$API_URL) || exit 1; \
    done

FROM caddy:2
COPY --from=flutter /src/mobile/apps/customer/build/web /srv/customer
COPY --from=flutter /src/mobile/apps/merchant/build/web /srv/merchant
COPY --from=flutter /src/mobile/apps/rider/build/web /srv/rider
COPY infra/Caddyfile /etc/caddy/Caddyfile
