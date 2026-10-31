# Phần 16 — Hướng dẫn triển khai & thử nghiệm

> **Khách hàng dùng web app** (mở link là đặt, không bắt cài). **Quán và shipper dùng app cài đặt (Android trước)** để chuông kêu kịp thời kể cả khi khoá máy — điều bản web không làm được. Liên hệ Zalo/SMS/Gọi **mở app trên điện thoại**; không dùng dịch vụ trả phí (không SMS brandname, không Firebase).

---

## 16.1. Cần chuẩn bị

| Thứ | Ghi chú |
|---|---|
| 1 máy chủ (VPS) | 2 vCPU, 4 GB RAM là đủ cho thử nghiệm; cài Docker + Docker Compose |
| 1 tên miền | Tạo 3 bản ghi A trỏ về IP máy chủ: `app.` (khách), `admin.`, `api.` |
| HTTPS | Tự động (Caddy + Let's Encrypt). **Bắt buộc** để trình duyệt của khách cho dùng GPS và thông báo đẩy |
| Điện thoại Android | Cho quán và shipper thử app cài đặt (Android 8 trở lên) |

## 16.2. Triển khai máy chủ

```bash
git clone <repo> && cd <repo>
cp infra/.env.prod.example infra/.env.prod      # điền tên miền, mật khẩu, khoá
# Tạo khoá thông báo đẩy cho web app khách (chạy trên máy có Node 22 + pnpm), chép 3 dòng vào infra/.env.prod:
pnpm install && pnpm --filter @sqt/api vapid
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build

# Dữ liệu mẫu quanh khu thử nghiệm (đổi toạ độ cho đúng nơi bạn đứng thử):
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec \
  -e SEED_LAT=10.7769 -e SEED_LNG=106.7009 api node dist/src/database/seed.js
```

| Địa chỉ | Dùng cho |
|---|---|
| `https://app.<tên miền>` | Khách hàng (web app) |
| `https://admin.<tên miền>` | Admin Console (máy tính) |
| `https://api.<tên miền>` | API — app quán & shipper gọi thẳng vào đây; ảnh chụp lưu ở `/uploads` |

## 16.3. Lấy file cài app quán & shipper (APK)

1. Trên GitHub: **Settings → Secrets and variables → Actions → Variables** → tạo biến `API_URL` = `https://api.<tên miền>`.
2. Mỗi lần đẩy code, GitHub Actions tự build. Vào **Actions → lần chạy mới nhất → Artifacts**, tải `sqt-merchant-apk` (app quán) và `sqt-rider-apk` (app shipper).
3. Gửi file `app-release.apk` qua Zalo/Drive cho quán và shipper; trên máy bấm mở file → cho phép **"Cài ứng dụng không rõ nguồn"** → Cài đặt.

> Bản thử ký bằng khoá debug. Trước khi đưa lên Google Play cần tạo khoá ký riêng (keystore) và cấu hình trong `android/app/build.gradle.kts`.

## 16.4. Tài khoản thử (sau khi chạy dữ liệu mẫu)

| Vai trò | Số điện thoại |
|---|---|
| Admin | Các số trong `ADMIN_PHONES` |
| Quán | `0911000001` (Phở Cô Lan), `0911000002` (Trà Sữa Mây), `0911000003` (Tạp Hoá Cô Ba) |
| Shipper | `0933000001`, `0933000002` |
| Khách | Số bất kỳ |

**Mã OTP:** trong giai đoạn thử nghiệm (`TEST_PHASE=true`, `OTP_DEV_ECHO=true`), mã hiện ngay trên màn hình đăng nhập — chưa gửi SMS. **Phải tắt trước khi mở cho người dùng thật** (xem 16.6).

## 16.5. Lần đầu sử dụng

**Khách (web app):** mở `https://app.<tên miền>` bằng Chrome/Safari → đăng nhập số điện thoại → cho phép **vị trí** để thấy quán quanh mình. Khi theo dõi đơn có thể bấm **Bật thông báo** (không bắt buộc). Gợi ý "Thêm vào màn hình chính" chỉ là tuỳ chọn.

**Quán và shipper (app cài đặt):**
1. Đăng nhập bằng số điện thoại.
2. Cho phép **thông báo** khi được hỏi.
3. Bấm **Kiểm tra máy** (dải trên cùng) và sửa hết các mục đỏ: thông báo, vị trí (shipper chọn **"Luôn cho phép"**), **không tối ưu pin cho app**. Máy Xiaomi/Oppo/Vivo còn phải bật **"Tự khởi chạy"** trong Cài đặt.
4. Bấm **Thử chuông** rồi khoá máy ngay để chắc chắn chuông kêu khi màn hình tắt.
5. **Quán**: bật công tắc **Đang mở** → app chạy nền, chuông kêu lặp lại tới khi có người nhận đơn, hiện cả trên màn hình khoá.
6. **Shipper**: bật **Trực tuyến** → app chạy nền, kêu chuông khi có lời mời và gửi vị trí mỗi 15 giây kể cả khi đang mở Google Maps. Tắt Trực tuyến là dừng hẳn.

## 16.6. Kịch bản thử nghiệm gợi ý

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| 1 | Khách đặt 2 món, 1 món ghi chú "Không hành" + dị ứng đậu phộng, trả tiền mặt | Máy quán đổ chuông (kể cả đang khoá); thẻ đơn có dải đỏ dị ứng |
| 2 | Quán bấm Nhận nhưng không tick "đã đọc dị ứng" | Nút Nhận đơn bị khoá |
| 3 | Quán không làm gì | ~45 giây có nhắc; 90 giây đơn hiện ở Admin → Đơn hàng (có vấn đề) với nút **Gọi quán**; 180 giây tự huỷ, khách được báo |
| 4 | Quán nhận đơn, shipper đang trực tuyến gần quán | Shipper nghe chuông lời mời; bấm **Nhận chuyến** |
| 5 | Shipper bấm "Đã tới quán" khi còn ở xa | Báo đang ở xa; bấm **Chụp ảnh xác nhận** → mở camera, ảnh tải lên máy chủ, đơn được gắn cờ hậu kiểm |
| 6 | Quán bấm **Xong món**, shipper nhập mã đơn trên túi | Chuyển "Đang giao"; khách thấy cập nhật |
| 7 | Mỗi bên bấm **Gọi / SMS / Zalo** trong đơn | Mở app gọi/SMS/Zalo đúng số của bên kia; đơn xong thì nút biến mất |
| 8 | Khách đặt **hẹn giờ** | Quán thấy ở tab Đơn hẹn; shipper thấy ở Chuyến hẹn (Tân binh thấy sau 10 phút) |
| 9 | Đổi phí dịch vụ ở Admin → Cấu hình | Đơn mới áp dụng ngay; Lịch sử có bản cũ để hoàn tác |
| 10 | Khoá máy quán (hoặc mở app khác) rồi đặt đơn | Chuông vẫn kêu lặp lại và hiện trên màn hình khoá; quán bấm nhận thì chuông tắt |
| 11 | Shipper trực tuyến, chuyển sang Google Maps | Admin thấy vị trí shipper vẫn cập nhật |

## 16.7. Giới hạn đã biết

| Giới hạn | Ảnh hưởng | Cách xử lý |
|---|---|---|
| App quán/shipper hỏi máy chủ mỗi 10 giây (không dùng Firebase) | Chuông có thể trễ tối đa ~10 giây; tốn chút pin/dữ liệu | Đủ cho thử nghiệm; khi lớn có thể thêm FCM |
| Một số máy Android tự tắt app chạy nền | Quán/shipper lỡ đơn | Màn hình **Kiểm tra máy**; điều phối viên gọi quán sau 90 giây |
| Bản iPhone của app quán/shipper chưa build | iOS hạn chế chạy nền, cần APNs/tài khoản Apple Developer | Làm sau Android; cấu hình Info.plist đã sẵn |
| Khách dùng web: thông báo chỉ khi khách đã bấm cho phép | Khách có thể không biết đơn đổi trạng thái khi đóng trang | Trang đơn tự cập nhật khi mở lại; quán/shipper gọi khách qua nút Gọi/Zalo |
| OTP hiện trên màn hình | **Chỉ dùng thử nội bộ**, ai cũng đăng nhập được số bất kỳ | Trước khi mở cho người thật: chọn kênh gửi OTP (xem Phần 13.5) và đặt `TEST_PHASE=false` |
| Thanh toán online là giả lập | Chỉ thử với tiền mặt | Ký cổng thanh toán ở giai đoạn sau |

## 16.8. Cập nhật & theo dõi

```bash
git pull
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
docker compose -f infra/docker-compose.prod.yml logs -f api      # xem log API
```
Web app của khách tự cập nhật ở lần mở tiếp theo. App quán/shipper: tải APK mới từ GitHub Actions và cài đè (giữ nguyên đăng nhập).
