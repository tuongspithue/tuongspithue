# Phần 1 — Tổng quan sản phẩm "Ship Quanh Tôi"

> Phiên bản tài liệu: 1.0 · Ngày: 31/10/2026 · Trạng thái: Bản đặc tả để xây dựng

---

## 1.1. Tầm nhìn

**"Ship Quanh Tôi"** là nền tảng giao hàng **siêu địa phương** (hyperlocal): mở app ra là thấy ngay **các quán, cửa hàng, tạp hoá, nhà thuốc… trong bán kính đi bộ / vài km**, chọn món cần thiết, đặt hàng và được giao trong **15–40 phút** bởi:

- **Shipper của hệ thống** (đã đăng ký, xác minh danh tính, được đào tạo), hoặc
- **Chính quán tự giao** (nhân viên/người nhà của quán, đã đăng ký với hệ thống).

**Khẩu hiệu:** *"Cần gì có nấy — quanh bạn, có người thật lo."*

## 1.2. Điểm khác biệt cốt lõi

| # | Khác biệt | Ý nghĩa |
|---|-----------|---------|
| 1 | **Mọi đơn đều có NGƯỜI THẬT xác nhận** | Không có đơn "treo" chờ máy. Quán bấm *Nhận đơn* (hoặc gọi lại khách), shipper bấm *Nhận chuyến*. Khách luôn biết **ai** đang xử lý đơn của mình (tên, ảnh, SĐT ẩn danh). |
| 2 | **Hai chế độ giao linh hoạt** | Quán tự chọn: *Hệ thống giao*, *Quán tự giao*, hoặc *Lai* (quán giao trong bán kính X km, xa hơn chuyển cho shipper hệ thống). |
| 3 | **Siêu gần — siêu nhanh** | Ưu tiên quán ≤ 3 km, hiển thị *thời gian đến tay* thực tế (chuẩn bị + di chuyển) chứ không chỉ khoảng cách. |
| 4 | **Không chỉ đồ ăn** | Nhu yếu phẩm: nước bình, gas, đá, thuốc không kê đơn, tã sữa, văn phòng phẩm, hoa, sửa chữa nhỏ… |
| 5 | **Thân thiện với quán nhỏ** | Quán vỉa hè, tạp hoá chỉ cần 1 smartphone. Có chế độ "Menu bằng ảnh", nhập món bằng giọng nói, nhận đơn bằng cuộc gọi tự động. |
| 6 | **Minh bạch** | Phí ship, phí dịch vụ, chiết khấu quán, thu nhập shipper đều hiển thị rõ ràng cho từng bên. |

## 1.3. Các bên tham gia (Actors)

| Vai trò | Ứng dụng | Mô tả |
|---------|----------|-------|
| **Người mua (Khách)** | App *Ship Quanh Tôi* (iOS/Android) + Web đặt nhanh | Tìm quán, đặt món, thanh toán, theo dõi, đánh giá. |
| **Chủ quán (Merchant Owner)** | App *SQT Đối Tác* + Web quản trị quán | Quản lý menu, giờ mở cửa, đơn hàng, nhân viên, doanh thu, khuyến mãi. |
| **Nhân viên quán (Merchant Staff)** | App *SQT Đối Tác* (quyền giới hạn) | Nhận/xác nhận đơn, chuẩn bị món, bàn giao. |
| **Shipper của quán (Store Rider)** | App *SQT Tài Xế* (chế độ "Shipper của quán") | Người do quán đăng ký, chỉ nhận đơn của quán đó. |
| **Shipper hệ thống (Platform Rider)** | App *SQT Tài Xế* | Đối tác tự do đã xác minh, nhận chuyến từ nhiều quán. |
| **Điều phối viên (Dispatcher/Ops)** | Web vận hành | Theo dõi bản đồ thời gian thực, can thiệp đơn bị kẹt, gán tay. |
| **CSKH (Support)** | Web vận hành + tổng đài | Xử lý khiếu nại, hoàn tiền, tranh chấp. |
| **Quản trị (Admin)** | Web quản trị | Duyệt đối tác, cấu hình phí, khu vực, chính sách, báo cáo. |
| **Kế toán (Finance)** | Web quản trị | Đối soát, chi trả, hoá đơn. |

## 1.4. Nguyên tắc "Người thật xác nhận" (Human Confirmation Principle)

Đây là **xương sống** của sản phẩm theo yêu cầu: *việc đặt hàng phải có người xác nhận trực tiếp*.

1. **Không đơn nào được coi là "đã nhận" nếu chưa có một tài khoản người thật đã xác minh (quán hoặc shipper) bấm xác nhận.**
2. Mỗi đơn có **2 cổng xác nhận (gate)**:
   - **Cổng A – Quán xác nhận món:** quán xác nhận *còn hàng, giá đúng, thời gian chuẩn bị*.
   - **Cổng B – Người giao xác nhận chuyến:** shipper (hệ thống hoặc của quán) xác nhận *sẽ đến lấy và giao*.
3. Đặc biệt — **Quán không dùng app thường xuyên** (quán nhỏ, chủ lớn tuổi): hệ thống hỗ trợ **xác nhận qua cuộc gọi tự động (IVR)** — "Bấm 1 để nhận đơn, bấm 2 để từ chối" — hoặc **shipper hệ thống đến quán xác nhận thay** (mô hình "đi chợ hộ": shipper tới quán, kiểm hàng, chụp ảnh hoá đơn). Dù cách nào, **luôn có người thật chịu trách nhiệm** và được ghi nhận trong nhật ký đơn.
4. Khách thấy rõ **ai đã xác nhận, lúc mấy giờ** trên màn hình theo dõi đơn.
5. Mọi bước xác nhận đều có **giới hạn thời gian (SLA)** và **phương án dự phòng** — xem Phần 3.

## 1.5. Phạm vi các "món cần thiết" (Danh mục ngành hàng)

| Nhóm | Ví dụ | Đặc thù |
|------|-------|---------|
| 🍜 Đồ ăn | Cơm, phở, bún, bánh mì, ăn vặt | Thời gian chuẩn bị, giữ nóng |
| 🧋 Đồ uống | Trà sữa, cà phê, nước ép | Tuỳ chọn size, đá, đường |
| 🛒 Tạp hoá | Mì gói, trứng, dầu ăn, gia vị | Tồn kho, thay thế hàng |
| 💧 Nhu yếu phẩm nặng | Nước bình 20L, gas, gạo, đá cây | Phụ phí hàng nặng, shipper có xe phù hợp, thu vỏ bình |
| 💊 Nhà thuốc | Thuốc không kê đơn, khẩu trang, test nhanh | Chỉ thuốc OTC; thuốc kê đơn cần ảnh đơn & dược sĩ xác nhận |
| 👶 Mẹ & bé | Tã, sữa | Giao gấp ban đêm |
| 🌸 Hoa & quà | Hoa tươi, bánh kem | Hẹn giờ giao, lời nhắn |
| 📎 Văn phòng phẩm | In ấn, photo | Upload file in |
| 🔧 Dịch vụ nhỏ | Sửa khoá, thay bình gas, giặt ủi | Đặt lịch, báo giá trước |
| 🐶 Thú cưng | Thức ăn, cát vệ sinh | Hàng nặng |

## 1.6. Mô hình doanh thu

| Nguồn | Mô tả | Mức đề xuất ban đầu |
|-------|-------|---------------------|
| Chiết khấu đơn | % trên giá trị món của quán | 8–15% (thấp hơn thị trường để thu hút quán nhỏ); **quán tự giao: 5–8%** |
| Phí dịch vụ khách | Phí cố định mỗi đơn | 2.000–3.000đ |
| Chênh lệch phí ship | Phí ship khách trả – thu nhập shipper | 10–20% |
| Quảng cáo trong app | Quán trả tiền để lên top "Quanh bạn" | Đấu giá CPC theo khu vực |
| Gói thành viên "SQT+" | Miễn phí ship đơn ≥ X, ưu đãi riêng | 29.000đ/tháng |
| Gói phần mềm cho quán | POS, quản lý kho, báo cáo nâng cao | 99.000–199.000đ/tháng (tuỳ chọn) |

## 1.7. Chỉ số thành công (North Star & KPI)

- **North Star:** *Số đơn giao thành công đúng hẹn mỗi tuần.*
- KPI phụ:
  - Tỷ lệ quán xác nhận trong 2 phút ≥ 90%
  - Tỷ lệ tìm được shipper trong 5 phút ≥ 95%
  - Thời gian giao trung bình (đặt → nhận) ≤ 30 phút
  - Tỷ lệ huỷ đơn do phía cung (quán/shipper) ≤ 3%
  - Đánh giá trung bình ≥ 4,6★
  - Tỷ lệ khách quay lại sau 30 ngày ≥ 40%
  - Uptime hệ thống ≥ 99,9%
