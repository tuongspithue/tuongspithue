# Phần 16 — Hướng dẫn triển khai & thử nghiệm bản web

> Giai đoạn thử nghiệm dùng **bản web cài lên màn hình chính** (PWA) cho cả khách, quán và shipper. Liên hệ Zalo/SMS/Gọi **mở app trên điện thoại**, thông báo dùng **Web Push miễn phí** — không cần dịch vụ trả phí. App cài đặt (Android/iOS) làm ở giai đoạn sau.

---

## 16.1. Cần chuẩn bị

| Thứ | Ghi chú |
|---|---|
| 1 máy chủ (VPS) | 2 vCPU, 4 GB RAM là đủ cho thử nghiệm; cài Docker + Docker Compose |
| 1 tên miền | Tạo 5 bản ghi A trỏ về IP máy chủ: `app.`, `quan.`, `taixe.`, `admin.`, `api.` |
| HTTPS | Tự động (Caddy + Let's Encrypt). **Bắt buộc** để điện thoại cho dùng GPS và thông báo đẩy |

## 16.2. Triển khai

```bash
git clone <repo> && cd <repo>
cp infra/.env.prod.example infra/.env.prod      # điền tên miền, mật khẩu, khoá
# Tạo khoá thông báo đẩy (chạy trên máy có Node 22 + pnpm), chép 3 dòng vào infra/.env.prod:
pnpm install && pnpm --filter @sqt/api vapid
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build

# Dữ liệu mẫu quanh khu thử nghiệm (đổi toạ độ cho đúng nơi bạn đứng thử):
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec \
  -e SEED_LAT=10.7769 -e SEED_LNG=106.7009 api node dist/src/database/seed.js
```

Sau khi chạy:

| Địa chỉ | Dùng cho |
|---|---|
| `https://app.<tên miền>` | Khách hàng |
| `https://quan.<tên miền>` | Quán |
| `https://taixe.<tên miền>` | Shipper |
| `https://admin.<tên miền>` | Admin Console (máy tính) |

## 16.3. Tài khoản thử (sau khi chạy dữ liệu mẫu)

| Vai trò | Số điện thoại |
|---|---|
| Admin | Các số trong `ADMIN_PHONES` |
| Quán | `0911000001` (Phở Cô Lan), `0911000002` (Trà Sữa Mây), `0911000003` (Tạp Hoá Cô Ba) |
| Shipper | `0933000001`, `0933000002` |
| Khách | Số bất kỳ |

**Mã OTP:** trong giai đoạn thử nghiệm (`TEST_PHASE=true`, `OTP_DEV_ECHO=true`), mã hiện ngay trên màn hình đăng nhập — chưa gửi SMS. **Phải tắt trước khi mở cho người dùng thật** (xem 16.6).

## 16.4. Lần đầu mở trên điện thoại

| Máy | Cách cài | Ghi chú |
|---|---|---|
| **iPhone** | Mở bằng **Safari** → nút Chia sẻ → **Thêm vào MH chính** → mở từ biểu tượng | iOS 16.4 trở lên mới có thông báo đẩy; chỉ hoạt động khi mở từ màn hình chính |
| **Android** | Mở bằng **Chrome** → bấm **Cài vào màn hình chính** (hoặc menu ⋮ → Cài đặt ứng dụng) | Thông báo đẩy hoạt động cả khi chưa cài, nhưng nên cài |

App tự hiện màn hình hướng dẫn này khi mở bằng trình duyệt trên điện thoại. Sau đó:
1. Đăng nhập bằng số điện thoại.
2. Bấm **BẬT** ở dải "Bật thông báo…" và **Cho phép**.
3. Cho phép **vị trí** khi được hỏi (khách: tìm quán quanh mình; shipper: gửi vị trí).
4. **Quán**: bật công tắc **"Chuông báo đơn mới"** — chuông kêu lặp lại và màn hình luôn sáng khi trang đang mở; nên đặt 1 máy ở quầy.
5. **Shipper**: bật **Trực tuyến** — app giữ màn hình sáng và gửi vị trí mỗi 15 giây khi đang mở.

## 16.5. Kịch bản thử nghiệm gợi ý

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| 1 | Khách đặt 2 món, 1 món ghi chú "Không hành" + dị ứng đậu phộng, trả tiền mặt | Quán nghe chuông + nhận thông báo; thẻ đơn có dải đỏ dị ứng |
| 2 | Quán bấm Nhận nhưng không tick "đã đọc dị ứng" | Nút Nhận đơn bị khoá |
| 3 | Quán không làm gì | ~45 giây có nhắc; 90 giây đơn hiện ở Admin → Đơn hàng (có vấn đề) với nút **Gọi quán**; 180 giây tự huỷ, khách được báo |
| 4 | Quán nhận đơn, shipper đang trực tuyến gần quán | Shipper nghe chuông lời mời; bấm **Nhận chuyến** |
| 5 | Shipper bấm "Đã tới quán" khi còn ở xa | Báo đang ở xa; có lựa chọn xác nhận kèm ảnh |
| 6 | Quán bấm **Xong món**, shipper nhập mã đơn trên túi | Chuyển "Đang giao"; khách thấy cập nhật |
| 7 | Mỗi bên bấm **Gọi / SMS / Zalo** trong đơn | Mở app gọi/SMS/Zalo đúng số của bên kia; đơn xong thì nút biến mất |
| 8 | Khách đặt **hẹn giờ** | Quán thấy ở tab Đơn hẹn; shipper thấy ở Chuyến hẹn (Tân binh thấy sau 10 phút) |
| 9 | Đổi phí dịch vụ ở Admin → Cấu hình | Đơn mới áp dụng ngay; Lịch sử có bản cũ để hoàn tác |
| 10 | Khoá app/tắt màn hình máy quán rồi đặt đơn | Vẫn có thông báo đẩy; **chuông lặp lại chỉ kêu khi trang đang mở** (giới hạn của bản web) |

## 16.6. Giới hạn của bản web (đã biết)

| Giới hạn | Ảnh hưởng | Cách xử lý trong giai đoạn thử |
|---|---|---|
| Không lấy được vị trí khi app chạy nền / khoá máy | Vị trí shipper ngừng cập nhật khi chuyển sang Google Maps | Giữ app mở khi chạy; hệ thống vẫn kiểm tra vị trí ở từng bước (tới quán, tới nơi) |
| Thông báo đẩy chỉ kêu 1 tiếng | Quán có thể lỡ đơn khi không mở app | Bật chuông ở quầy; điều phối viên gọi quán sau 90 giây |
| iPhone cần thêm vào màn hình chính mới có thông báo | Người dùng iPhone phải cài | App hướng dẫn ngay lần đầu mở |
| OTP hiện trên màn hình | **Chỉ dùng thử nội bộ**, ai cũng đăng nhập được số bất kỳ | Trước khi mở cho người thật: chọn kênh gửi OTP (xem Phần 13.5) và đặt `TEST_PHASE=false` |
| Thanh toán online là giả lập | Chỉ thử với tiền mặt | Ký cổng thanh toán ở giai đoạn sau |

## 16.7. Cập nhật & theo dõi

```bash
git pull
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
docker compose -f infra/docker-compose.prod.yml logs -f api      # xem log API
```
App web tự cập nhật ở lần mở tiếp theo (service worker không lưu đệm bản cũ).
