# Phần 7 — Trải nghiệm (UX/UI), Uy tín & An toàn, Tính năng sáng tạo

---

## 7.1. Nguyên tắc thiết kế giao diện

| Nguyên tắc | Áp dụng |
|---|---|
| **3 chạm để đặt** | Mở app → chọn món → Đặt hàng (địa chỉ & thanh toán nhớ sẵn) |
| **Luôn biết ai đang lo đơn** | Ảnh + tên người xác nhận ở mọi bước, không có trạng thái mơ hồ "Đang xử lý" |
| **Thân thiện người lớn tuổi (app quán)** | Nút to ≥ 56 dp, chữ ≥ 16 sp, màu tương phản cao, ít chữ nhiều biểu tượng, chế độ "Đơn giản" chỉ 3 nút: *Nhận – Từ chối – Xong món* |
| **Một tay khi lái xe (app shipper)** | Thao tác chính ở nửa dưới màn hình, vuốt để xác nhận (tránh bấm nhầm), đọc thông báo bằng giọng nói |
| **Hoạt động trên máy yếu, mạng yếu** | App < 30 MB, ảnh nén WebP, tải dần, cache menu, chế độ tiết kiệm dữ liệu |
| **Tiếng Việt chuẩn, thân thiện** | Văn phong "bạn – mình", thông báo lỗi kèm cách khắc phục; [P2] hỗ trợ tiếng Anh |
| **Tiếp cận (Accessibility)** | Hỗ trợ TalkBack/VoiceOver, cỡ chữ hệ thống, không chỉ dùng màu để truyền tải trạng thái |
| **Chế độ tối** | Cho cả 3 app (shipper chạy đêm nhiều) |

**Bộ nhận diện gợi ý:** màu chủ đạo **cam ấm** (#FF6B2C – năng động, đồ ăn) + **xanh lá tin cậy** (#1DB954 cho trạng thái "đã xác nhận ✔"); biểu tượng: ghim bản đồ có hình chiếc giỏ, vòng sóng lan toả quanh = "quanh tôi".

### Các màn hình chính cần thiết kế
- **App khách (≈ 25 màn):** Onboarding, Chọn vị trí, Trang chủ (danh sách/bản đồ), Danh mục, Tìm kiếm, Trang quán, Chi tiết món, Giỏ hàng, Checkout, Thanh toán, Chờ xác nhận, Theo dõi đơn, Chat, Đánh giá, Báo sự cố, Lịch sử, Tín dụng hoàn tiền, Voucher, Địa chỉ, Hồ sơ, Trợ giúp, Đơn nhóm.
- **App quán (≈ 20 màn):** Đăng ký 8 bước, Bảng đơn (Mới / Đang làm / Chờ shipper / Đang giao / Xong), Chi tiết đơn, Popup đơn mới toàn màn hình, Menu, Sửa món, OCR menu, Cài đặt cửa hàng, Shipper của quán, Doanh thu, Khuyến mãi, Nhân viên, Đánh giá.
- **App shipper (≈ 18 màn):** Đăng ký & eKYC, Khoá học, Trang chủ bản đồ nhiệt, Popup mời chuyến, Dẫn đường, Checklist lấy hàng, Xác nhận giao, Thu nhập & COD, Lịch sử, Thưởng, SOS, Hỗ trợ.

> Chi tiết giao diện sinh động xem [Phần 9](09-giao-dien-truc-quan-sinh-dong.md).

## 7.2. Hệ thống uy tín (Trust & Safety)

> Công thức đầy đủ, cấp độ, Bảng Vàng khu vực xem [Phần 11](11-diem-uy-tin-khu-vuc.md).

### Điểm tin cậy
| Đối tượng | Thành phần điểm |
|---|---|
| Quán | Tỷ lệ xác nhận đơn, thời gian xác nhận TB, tỷ lệ huỷ, chuẩn bị đúng giờ, đánh giá, khiếu nại sai/thiếu món |
| Shipper | Tỷ lệ nhận chuyến, tỷ lệ huỷ, đúng giờ, đánh giá, khiếu nại, tuân thủ quy trình (ảnh giao, geofence) |
| Khách | Chỉ dùng nội bộ, không xếp hạng: số đơn hoàn thành, số lần bỏ đơn COD, khiếu nại ảo, lạm dụng voucher |

Điểm ảnh hưởng: thứ hạng hiển thị (quán), ưu tiên nhận chuyến & thưởng (shipper), quyền dùng COD (khách).

### Huy hiệu
- Quán: **"Xác nhận siêu tốc"** (TB < 30s), **"Đã xác minh ✔"**, **"Bếp sạch"** (ảnh bếp được kiểm duyệt), **"Quán quen của khu"**.
- Shipper: **"Shipper 5 sao"**, **"Người hùng mưa bão"**, **"1.000 chuyến"**.

### Chống gian lận (Fraud)
| Hành vi | Phát hiện | Xử lý |
|---|---|---|
| Đơn ảo để ăn thưởng/voucher | Khách – quán – shipper trùng thiết bị/vị trí/IP; đơn hoàn thành bất thường nhanh | Huỷ thưởng, khoá tài khoản |
| Giả GPS | Mock location, nhảy vị trí, tốc độ > 80 km/h trong phố | Cảnh báo, khoá chuyến |
| Bom hàng COD | Từ chối nhận nhiều lần | Tắt COD cho khách |
| Shipper "giao" nhưng không giao | Không vào geofence điểm giao, khách báo không nhận | Bắt buộc ảnh/PIN, khấu trừ, khoá |
| Quán tăng giá trên app so với tại quán | Khảo sát, khiếu nại | Cảnh báo; chính sách *"giá app có thể chênh tối đa X%, phải công khai"* |
| Tài khoản đánh giá ảo | Chỉ đơn đã hoàn thành mới đánh giá; mô hình phát hiện bất thường | Ẩn đánh giá |

### An toàn
- Shipper: nút SOS, bảo hiểm tai nạn theo chuyến, ẩn SĐT, cảnh báo khu vực nguy hiểm (do cộng đồng báo cáo), giới hạn giờ online liên tục (nhắc nghỉ sau 10 giờ).
- Khách: thông tin shipper đầy đủ trước khi giao, chia sẻ hành trình, ẩn địa chỉ sau giao, kênh báo cáo hành vi không phù hợp 24/7.
- Thực phẩm: túi niêm phong (tem dán "Đã niêm phong bởi quán"), hướng dẫn ATTP cho quán, thùng giữ nhiệt cho shipper.
- Thuốc: chỉ nhà thuốc có giấy phép, chỉ thuốc không kê đơn & sản phẩm chăm sóc sức khoẻ; **không bán thuốc kê đơn**; đơn có thuốc bắt buộc mã PIN khi nhận; tuân thủ quy định về kinh doanh dược (cần tư vấn pháp lý trước khi mở ngành hàng).
- Hàng cấm/hạn chế: **không kinh doanh rượu bia ở MVP và bản 1.0** (chỉ cân nhắc sau khi có xác minh tuổi khi nhận và tư vấn pháp lý); chặn thuốc lá, thuốc lá điện tử, bình gas qua shipper hệ thống, hàng cấm theo pháp luật.

## 7.3. Tính năng sáng tạo — "Chất riêng" của Ship Quanh Tôi

1. **🔔 "Chuông Xóm" — Quán xác nhận bằng một cú gọi**
   Quán nhỏ không quen app vẫn tham gia được: hệ thống gọi điện đọc đơn, chủ quán bấm phím để nhận. Shipper đến lấy hàng, chụp ảnh hoá đơn. *Mở rộng thị trường tới hàng trăm nghìn quán vỉa hè, tạp hoá.*

2. **🛵 "Shipper Quen" — Shipper của khu phố** *(giai đoạn Tăng trưởng)*
   Khách có thể **ghim shipper yêu thích**; khi đặt, shipper quen được mời trước nếu đang ở gần. Shipper xây dựng tệp khách riêng → thu nhập ổn định, dịch vụ ấm áp như "người nhà".

3. **🏘️ "Gom Đơn Toà Nhà" — Đặt chung, ship rẻ** *(giai đoạn Tăng trưởng)*
   Trong cùng toà nhà/ngõ, đơn từ cùng quán trong 10 phút được **gom một chuyến**, phí ship chia đều (rẻ hơn tới 50%). Hiện banner: *"3 người ở toà A đang đặt Cơm tấm Bụi — vào chung để giảm 8.000đ ship!"*.

4. **⏱️ "Đồng hồ thật" — ETA trung thực**
   Hiển thị thời gian đến tay dựa trên dữ liệu thực của quán (tốc độ chuẩn bị từng món) và mật độ shipper; nếu trễ hơn cam kết > 15 phút do phía nền tảng → **tự động tặng voucher**, không cần khiếu nại.

5. **🌧️ "Chế độ Mưa Bão"**
   Tự động phát hiện thời tiết xấu: báo khách trước phí tăng, gợi ý quán gần hơn, tăng thưởng shipper, nhắc shipper an toàn, hiển thị huy hiệu "Người hùng mưa bão".

6. **🌙 "Cú Đêm" — Danh mục 22h–6h**
   Tập hợp quán mở khuya, nhà thuốc 24h, tạp hoá 24h, với cam kết luôn có shipper trực.

7. **🧺 "Đi chợ hộ"**
   Khách gửi danh sách tự do (chữ/ảnh/giọng nói) cho chợ hoặc tạp hoá; người bán **chụp ảnh hàng thực tế + chat xác nhận** (rau, thịt), báo giá thực, khách duyệt rồi mới giao. *(Bỏ gọi video: tốn thời gian người bán, mạng yếu khó dùng.)*

8. **💬 "Hỏi quán trước khi đặt"**
   Nút chat nhanh: "Hôm nay có bánh mì pate không?", "Làm ít cay được không?" — quán trả lời trong app; tăng tỷ lệ chuyển đổi cho quán nhỏ có menu thay đổi theo ngày.

9. **📍 "Bản đồ món ngon quanh tôi"**
   Bản đồ dạng nhiệt hiển thị món đang được đặt nhiều quanh bạn trong 1 giờ qua — gợi tò mò, khám phá quán mới.

10. **🔁 "Đặt định kỳ thông minh"**
    Hệ thống nhận thấy bạn đặt nước bình mỗi 7–9 ngày → nhắc trước 1 ngày: *"Sắp hết nước? Đặt 1 bình như mọi lần?"* — 1 chạm.

11. **🤝 "Quán tự giao — Phí thân thiện"**
    Quán tự giao trả chiết khấu thấp hơn, được gắn nhãn *"Quán tự giao – ship gần rẻ"*, giúp quán giữ quan hệ trực tiếp với khách quen.

12. **🤖 Trợ lý AI cho quán** *(chi tiết toàn bộ ứng dụng AI: [Phần 12](12-tich-hop-ai.md))*
    Tạo menu từ ảnh, viết mô tả món hấp dẫn, gợi ý tên combo, hiển thị mặt bằng giá khu vực dạng số liệu (AI không khuyên giá), cảnh báo "Hôm nay mưa — nên chuẩn bị thêm món nóng", tóm tắt đánh giá khách tuần qua.

13. **🎁 "Treo món" — Lan toả yêu thương** *(giai đoạn sau, P2)*
    Khách có thể "treo" một suất cơm/ly nước cho shipper hoặc người khó khăn trong khu vực; quán và nền tảng đồng góp. Xây dựng hình ảnh thương hiệu nhân văn.

## 7.4. Hỗ trợ khách hàng (CSKH)
- Kênh: chat trong app (bot + người thật), hotline 24/7 giờ cao điểm, email.
- **SLA phản hồi:** chat < 1 phút (bot), < 3 phút (người), sự cố đơn đang giao: ưu tiên cao nhất.
- **Hoàn tiền tự động** cho trường hợp rõ ràng (quán huỷ, không tìm được shipper, trễ quá cam kết) — không cần chờ CSKH.
- Phân cấp duyệt hoàn tiền: ≤ 200.000đ CSKH cấp 1; ≤ 1.000.000đ cấp 2; lớn hơn: trưởng ca.
- Bộ câu trả lời mẫu (macro), phân loại lý do để cải tiến sản phẩm hằng tuần.
