# Phần 17 — Chạy thử miễn phí trên GitHub Codespaces

> Không cần thuê VPS. GitHub cho mượn một máy ảo chạy trên trình duyệt; toàn bộ hệ thống (API, cơ sở dữ liệu, Admin Console, web app khách) chạy trong đó và có địa chỉ HTTPS để mở trên điện thoại.
> Hợp để **tự thử hoặc thử cùng vài người trong một buổi**. Cho quán/shipper thật dùng hằng ngày thì thuê VPS (Phần 16).

## 17.1. Giới hạn cần biết

| Giới hạn | Ảnh hưởng |
|---|---|
| Miễn phí khoảng **60 giờ chạy/tháng** với máy 2 lõi (hạn mức tài khoản cá nhân, xem GitHub → Settings → Billing) | Tắt Codespace khi không thử để tiết kiệm giờ |
| **Không ai thao tác ~30 phút thì máy tự tắt** | App quán/shipper không nhận đơn, chuông không kêu. Có thể tăng lên tối đa 4 giờ: GitHub → Settings → Codespaces → *Default idle timeout* |
| Địa chỉ đổi khi tạo Codespace **mới** | Quán/shipper bấm "Máy chủ: … · Đổi" trên màn đăng nhập và dán địa chỉ mới (không cần build lại APK). Mở lại Codespace cũ thì địa chỉ giữ nguyên, dữ liệu vẫn còn |

## 17.2. Tạo Codespace (một lần, ~10 phút)

1. Mở repo trên GitHub → chọn nhánh `claude/ship-quanh-toi-app-1v1h6y` (hoặc `main` sau khi gộp).
2. Bấm nút xanh **Code** → tab **Codespaces** → **Create codespace on …**.
3. Đợi máy ảo tự cài đặt (Node, Flutter, cơ sở dữ liệu). Thấy dòng `Xong. Chạy hệ thống bằng: bash scripts/codespace.sh` là xong.

## 17.3. Bật hệ thống

Hệ thống **tự bật** mỗi lần mở Codespace; kết quả hiện trong khung **Terminal** ở dưới (tab có tên *postAttachCommand*). Nếu không thấy, hoặc muốn bật lại, mở Terminal mới (menu ☰ → **Terminal → New Terminal**) và chạy:
```bash
bash scripts/codespace.sh
```
Lần đầu mất ~5 phút (build Admin Console và web app). Xong sẽ in ra:
```
  Web app khách : https://<tên-codespace>-8080.app.github.dev
  Admin Console : https://<tên-codespace>-3001.app.github.dev
  API           : https://<tên-codespace>-3000.app.github.dev
```
và **mã kích hoạt** cho Admin, 50 quán mẫu (10 quán mỗi ngành) và 5 shipper mẫu (lưu trong `.devcontainer/local/codes.txt`).

**Bắt buộc:** 3 cổng phải ở chế độ **Public** thì điện thoại mới vào được. Script tự đặt; nếu báo chưa đặt được: mở tab **PORTS** → chuột phải từng cổng 3000, 3001, 8080 → **Port Visibility → Public**.

## 17.4. Đổi số Admin và vị trí thử

Mở file `.devcontainer/local/env` (tạo ở lần chạy đầu, không đưa lên git):
```
ADMIN_PHONES=<số điện thoại của bạn>
SEED_LAT=16.4637        # toạ độ nơi bạn đứng thử — nhấn giữ trên Google Maps để lấy
SEED_LNG=107.5909
```
Rồi chạy `bash scripts/codespace.sh seed` để tạo quán/shipper mẫu quanh vị trí mới và in mã mới. Khởi động lại bằng `bash scripts/codespace.sh` để API nhận số Admin mới.

## 17.5. Thử trên điện thoại

| Ai | Làm gì |
|---|---|
| Admin | Mở địa chỉ **Admin Console** trên máy tính → tab **Mã kích hoạt** → nhập số + mã. Lần đầu sẽ được mời **đặt mật khẩu**; từ đó đăng nhập bằng tab **Mật khẩu**, không cần xin mã nữa |
| Khách | Mở địa chỉ **Web app khách** trên điện thoại → chọn quán, đặt hàng, nhập tên + số |
| Quán, shipper | Cài APK (17.6) → đăng nhập bằng số mẫu + mã trong `codes.txt` |

Kịch bản thử: xem Phần 16.6.

## 17.6. App Android trỏ về Codespace

1. **Actions** → lần chạy CI mới nhất → tải `sqt-merchant-apk`, `sqt-rider-apk` ở mục **Artifacts**, cài lên điện thoại như Phần 16.3.
2. Mở app lần đầu → màn **"Kết nối máy chủ"** → dán địa chỉ **API** ở 17.3 (cổng 3000, để Public; Admin Console → Tài khoản của tôi có sẵn nút Sao chép) → **Kiểm tra & lưu**.

> Tạo Codespace mới (địa chỉ đổi) hoặc chuyển sang VPS: **không cần build lại APK** — trên màn đăng nhập bấm "Máy chủ: … · Đổi" và dán địa chỉ mới.

## 17.7. Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `bash scripts/codespace.sh` | Bật (hoặc bật lại sau khi Codespace ngủ dậy) |
| `bash scripts/codespace.sh code 09xxxxxxxx` | Cấp mã kích hoạt mới cho một số |
| `bash scripts/codespace.sh seed` | Tạo lại dữ liệu mẫu, in mã mới |
| `bash scripts/codespace.sh logs` | Xem nhật ký API khi có lỗi |
| `bash scripts/codespace.sh stop` | Tắt các dịch vụ |

Khi không thử nữa: GitHub → **Codespaces** → menu ⋯ → **Stop codespace** để không tốn giờ miễn phí. **Delete** thì mất cả dữ liệu thử.
