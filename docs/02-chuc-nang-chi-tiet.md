# Phần 2 — Chức năng chi tiết theo từng ứng dụng

Ký hiệu mức ưu tiên: **[P0]** bắt buộc cho MVP · **[P1]** bản 1.0 · **[P2]** mở rộng sau.

---

## 2.1. App Người mua — "Ship Quanh Tôi"

### 2.1.1. Đăng ký / Đăng nhập
- [P0] Đăng nhập bằng **số điện thoại + OTP** (SMS/Zalo ZNS), không cần mật khẩu.
- [P1] Đăng nhập Google / Apple / Zalo.
- [P0] Cho phép **xem quán khi chưa đăng nhập**; chỉ yêu cầu đăng nhập khi bấm *Đặt hàng*.
- [P1] Hồ sơ: tên, ảnh, ngày sinh (tặng voucher sinh nhật), sở thích ăn uống (chay, không cay, dị ứng…).

### 2.1.2. Màn hình chính "Quanh tôi"
- [P0] Xin quyền vị trí → hiển thị **địa chỉ hiện tại** trên đầu, cho phép đổi nhanh (Nhà / Công ty / địa chỉ đã lưu / ghim trên bản đồ).
- [P0] **Hai chế độ xem**, chuyển bằng 1 chạm:
  - **Danh sách**: thẻ quán gồm ảnh, tên, ★, khoảng cách, *"Đến tay ~25 phút"*, phí ship, nhãn *Quán tự giao* / *Hệ thống giao*, trạng thái *Đang mở / Sắp đóng / Đông khách*.
  - **Bản đồ**: các quán là ghim trên bản đồ; vòng tròn bán kính 1/3/5 km; vuốt bản đồ để tìm lại.
- [P0] Thanh danh mục ngang: Đồ ăn · Đồ uống · Tạp hoá · Nước & Gas · Nhà thuốc · Mẹ & bé · Hoa · Khác.
- [P0] Bộ lọc: khoảng cách, đang mở, miễn phí ship, ★ ≥ 4.5, khuyến mãi, quán tự giao, thanh toán tiền mặt.
- [P0] Sắp xếp: Gần nhất · Giao nhanh nhất · Đánh giá cao · Phổ biến.
- [P1] **"Cần gấp"** (nút đỏ nổi): chỉ hiện quán giao được trong ≤ 20 phút.
- [P1] **Gợi ý theo giờ**: sáng → bánh mì, cà phê; trưa → cơm; tối muộn → quán mở khuya, nhà thuốc 24h.
- [P1] **Gợi ý theo thời tiết**: trời mưa → lẩu, đồ nóng, nhắc "phí ship mưa có thể tăng".
- [P2] "Món hàng xóm hay đặt": món phổ biến nhất trong khu của bạn — chỉ tính theo khu vực ≥ 1 km², chỉ hiện khi có ≥ 20 đơn từ ≥ 10 khách khác nhau (không thể suy ra ai đặt gì).

### 2.1.3. Tìm kiếm
- [P0] Tìm theo tên món, tên quán, ngành hàng; có **gợi ý tự động** và **sửa lỗi chính tả không dấu** ("bun bo" → "bún bò").
- [P0] Kết quả tìm theo **món**: hiển thị *món X ở các quán gần*, so sánh giá + thời gian đến tay.
- [P1] Tìm bằng giọng nói.
- [P2] **"Tìm hộ tôi"**: khách gõ "1 bình nước Lavie 20L + 2 gói mì Hảo Hảo" → hệ thống tìm quán có đủ, hoặc tách đơn tối ưu.

### 2.1.4. Trang quán
- [P0] Ảnh bìa, giờ mở cửa, địa chỉ, khoảng cách, ★ và số đánh giá, phí ship ước tính, thời gian chuẩn bị trung bình.
- [P0] Menu theo nhóm, mỗi món: ảnh, tên, mô tả, giá, nhãn *Bán chạy / Mới / Cay / Chay*, trạng thái *Hết hàng*.
- [P0] **Tuỳ chọn món (modifier)**: size, topping, mức đá/đường, ghi chú riêng cho món.
- [P0] Giỏ hàng nổi dưới cùng: số món, tổng tiền.
- [P1] Thông tin: giấy phép ATTP (nếu có), ảnh bếp/quầy thực tế, "Quán đã xác minh ✔".
- [P1] Lịch sử đánh giá có ảnh; quán phản hồi đánh giá.
- [P2] Ảnh "món hôm nay" do quán đăng (không làm livestream — tốn tài nguyên, ít phù hợp quán nhỏ).

### 2.1.5. Giỏ hàng & Thanh toán (Checkout)
- [P0] Mỗi giỏ thuộc **1 quán** (MVP). [P2] Đơn ghép nhiều quán gần nhau, 1 shipper.
- [P0] Hiển thị **minh bạch**: Tạm tính · Phí ship · Phí dịch vụ · Phụ phí (hàng nặng, đêm khuya, mưa) · Giảm giá · **Tổng**.
- [P0] Chọn hình thức giao:
  - **Giao ngay** (mặc định)
  - [P0] **Hẹn giờ lấy/giao** (sau 1–3 giờ hoặc chọn giờ, trong 7 ngày) — đơn hiện trực tiếp cho quán & shipper để họ chọn nhận; đơn ngay chờ lâu có thể chuyển sang hẹn giờ bằng 1 chạm → xem [Phần 10](10-don-hen-gio.md)
  - [P1] **Tự đến lấy** (miễn ship, quán chuẩn bị sẵn)
- [P0] **Người nhận khác** (đặt hộ bố mẹ, bạn bè): tên + SĐT người nhận; shipper gọi người nhận, khách đặt vẫn theo dõi được.
- [P0] Địa chỉ giao + **ghi chú cho shipper** (VD: "Hẻm 45, cổng xanh, gọi trước 5 phút") + ảnh chỉ đường tuỳ chọn.
- [P0] Thanh toán: **Tiền mặt (COD)**, **Ví điện tử** (MoMo, ZaloPay, VNPay), **QR chuyển khoản (VietQR)**, [P1] thẻ ATM/Visa.
- [P0] Mã khuyến mãi / voucher.
- [P1] Dụng cụ ăn uống: *Không lấy đũa thìa* (chọn mặc định xanh).
- [P1] Tip cho shipper (trước hoặc sau giao).
- [P0] Nút **"Đặt hàng"** → chuyển sang màn hình **"Đang chờ quán xác nhận"**.

### 2.1.6. Theo dõi đơn hàng (realtime)
Thanh tiến trình rõ ràng, mỗi bước có **tên người xác nhận + giờ**:

```
[1] Đã gửi đơn ── [2] Quán đã nhận ✔ (Chị Lan · 12:03)
    ── [3] Đang chuẩn bị (~10 phút)
    ── [4] Shipper đã nhận chuyến ✔ (Anh Minh · Honda Wave · 59X1-xxx.12 · 12:05)
    ── [5] Shipper đã lấy hàng (12:14)
    ── [6] Đang giao — bản đồ trực tiếp, ETA 7 phút
    ── [7] Đã giao ✔ (ảnh xác nhận giao hàng · 12:22)
```

- [P0] Bản đồ vị trí shipper cập nhật mỗi 3–5 giây.
- [P0] **Gọi điện ẩn số** (số trung gian) và **chat trong app** với quán & shipper; có tin nhắn nhanh ("Tôi xuống ngay", "Để ở bảo vệ giúp").
- [P0] Huỷ đơn: miễn phí trước khi quán xác nhận; sau đó theo chính sách (Phần 5).
- [P1] **Mã nhận hàng 4 số (PIN)** cho đơn giá trị cao / thuốc — khách đọc PIN cho shipper mới hoàn tất.
- [P1] Chia sẻ link theo dõi cho người khác (đặt hộ bố mẹ).

### 2.1.7. Sau giao hàng
- [P0] Đánh giá **tách riêng**: Quán (món ăn) và Shipper (thái độ, đúng giờ), kèm nhãn nhanh + ảnh.
- [P0] **Báo sự cố**: thiếu món, sai món, đổ vỡ, giao trễ, không nhận được hàng → kèm ảnh → CSKH xử lý, hoàn tiền về nguồn thanh toán gốc hoặc tín dụng hoàn tiền SQT (khách chọn).
- [P0] **Đặt lại** đơn cũ bằng 1 chạm.
- [P1] Hoá đơn điện tử (gửi email theo yêu cầu).

### 2.1.8. Tiện ích khác
- [P0] Sổ địa chỉ, lịch sử đơn, voucher của tôi, **tín dụng hoàn tiền SQT** (chỉ dùng để mua hàng trên app, không nạp/rút/chuyển — tránh hoạt động như ví điện tử vốn cần giấy phép của Ngân hàng Nhà nước; khách luôn có quyền chọn hoàn về nguồn thanh toán gốc).
- [P0] Cài đặt thông báo (bật/tắt khuyến mãi, giờ yên lặng), quản lý quyền dữ liệu, **xoá tài khoản ngay trong app** (yêu cầu của App Store/Google Play và quy định bảo vệ dữ liệu cá nhân).
- [P1] Quán yêu thích, thông báo khi quán yêu thích mở cửa / có khuyến mãi.
- [P1] **Đơn nhóm (Group order)**: tạo link, đồng nghiệp tự thêm món, chia tiền tự động.
- [P2] **Đặt định kỳ**: "Mỗi thứ Hai giao 2 bình nước", "7h sáng mỗi ngày 1 cà phê sữa" — mỗi lần là **một đơn hẹn giờ riêng**, vẫn phải được quán nhận và shipper giữ chuyến như bình thường.
- [P2] Chương trình điểm thưởng "Hạt Gạo" — tích điểm đổi voucher.
- [P1] Trung tâm trợ giúp + chat CSKH (bot trả lời câu hỏi thường gặp, chuyển người thật khi cần).

---

## 2.2. App Đối tác Quán — "SQT Đối Tác" (+ Web quản trị quán)

### 2.2.1. Đăng ký & Xác minh quán (Onboarding)
- [P0] Đăng ký trong **10 phút** trên điện thoại:
  1. SĐT chủ quán + OTP
  2. Thông tin quán: tên, ngành hàng, địa chỉ (ghim bản đồ chính xác vị trí cửa), giờ mở cửa
  3. Ảnh mặt tiền + ảnh bên trong
  4. CCCD chủ quán (eKYC: chụp 2 mặt + selfie khớp khuôn mặt)
  5. [Tuỳ ngành] Giấy phép kinh doanh / Giấy chứng nhận ATTP / Giấy phép nhà thuốc
  6. Tài khoản ngân hàng nhận tiền
  7. Chọn **chế độ giao hàng** (xem 2.2.4)
  8. Ký hợp đồng điện tử (chiết khấu, chính sách)
- [P0] Trạng thái hồ sơ: *Đang duyệt → Cần bổ sung → Đã duyệt*. SLA duyệt ≤ 24h.
- [P1] Đội "Đại sứ khu vực" đến tận nơi hỗ trợ quán chụp menu, cài app.

### 2.2.2. Quản lý Menu
- [P0] Thêm/sửa món: ảnh, tên, giá, mô tả, nhóm, tuỳ chọn (size/topping), giới hạn số lượng/ngày.
- [P0] **Bật/tắt "Hết hàng"** bằng 1 chạm (công tắc lớn) — tự bật lại ngày mai (tuỳ chọn).
- [P1] **Tạo menu bằng ảnh**: chụp tờ menu giấy → AI nhận dạng (OCR) tên món + giá → quán chỉ cần kiểm tra.
- [P1] Nhập món bằng giọng nói.
- [P1] Menu theo khung giờ (sáng / trưa / tối).
- [P2] Quản lý tồn kho cho tạp hoá: nhập/xuất, cảnh báo sắp hết, quét mã vạch.

### 2.2.3. Nhận & Xác nhận đơn (Cổng A) — **chức năng quan trọng nhất**
- [P0] Đơn mới đến: **chuông lớn lặp lại + rung + màn hình toàn phần** (kể cả khi khoá máy), không tắt cho đến khi xử lý.
- [P0] Màn hình đơn mới hiển thị: danh sách món + tuỳ chọn + ghi chú, tổng tiền, hình thức thanh toán, khoảng cách tới khách, **đồng hồ đếm ngược** (mặc định 3 phút).
- [P0] Thao tác:
  - ✅ **Nhận đơn** → chọn thời gian chuẩn bị (5 / 10 / 15 / 20 / 30 phút, gợi ý theo lịch sử).
  - ✏️ **Nhận với điều chỉnh**: một món hết → đề xuất món thay thế / bỏ món → gửi khách đồng ý (khách có 2 phút, không phản hồi thì theo lựa chọn "khi hết hàng" khách chọn lúc đặt).
  - ❌ **Từ chối** → bắt buộc chọn lý do (hết hàng, quá tải, sắp đóng cửa, ngoài vùng…).
- [P0] **Không có chế độ tự động nhận đơn.** Mọi đơn phải có người bấm nhận (trên app, qua phím IVR, hoặc Ops gọi xác nhận). Để quán đông khách thao tác nhanh: **"Nhận nhanh"** — 1 chạm nhận với thời gian chuẩn bị gợi ý sẵn.
- [P0] **Dự phòng khi quán không phản hồi**: sau 90 giây chưa xử lý → **cuộc gọi tự động IVR** tới SĐT quán ("Bấm 1 nhận, 2 từ chối"); sau 3 phút → huỷ, báo khách & gợi ý quán tương tự.
- [P1] In phiếu bếp qua **máy in nhiệt Bluetooth/LAN** tự động khi nhận đơn.
- [P0] Tab **"Đơn hẹn 🟣"**: xem đơn hẹn giờ & yêu cầu mở trong khu vực theo thời gian thực, chọn Nhận / Đề xuất giờ khác / Từ chối, lịch năng lực theo khung 15 phút, xác nhận lại trước giờ → [Phần 10](10-don-hen-gio.md).
- [P0] Bấm **"Đã chuẩn bị xong"** → báo shipper & khách.
- [P0] **Bàn giao**: shipper quét **mã QR trên phiếu/app quán** hoặc nhập mã đơn 4 số → xác nhận đúng đơn, tránh nhầm lẫn.

### 2.2.4. Chế độ giao hàng của quán
| Chế độ | Mô tả | Ai xác nhận Cổng B |
|--------|-------|--------------------|
| **Hệ thống giao** | Toàn bộ đơn do shipper hệ thống giao | Shipper hệ thống bấm *Nhận chuyến* |
| **Quán tự giao** | Quán dùng shipper riêng (đã đăng ký vào app SQT Tài Xế dưới tên quán) | Shipper của quán bấm *Nhận chuyến*; hoặc chủ quán gán tay cho nhân viên |
| **Lai (Hybrid)** | Quán tự giao trong bán kính R (VD 2 km) hoặc khung giờ nhất định; ngoài ra → hệ thống | Tuỳ đơn |
| **Tự giao có dự phòng** | Ưu tiên quán tự giao; sau T phút (VD 3 phút) không có shipper quán nhận → tự động đẩy cho hệ thống | Shipper đầu tiên nhận |

- [P0] Quán quản lý **danh sách shipper của quán**: mời bằng SĐT → người đó cài app Tài Xế, xác minh CCCD → xuất hiện trong danh sách.
- [P0] Bảng điều phối mini cho quán: xem shipper nào đang rảnh / đang giao, gán đơn kéo-thả.
- [P0] Phí ship với quán tự giao: quán tự cấu hình (cố định / theo km / miễn phí từ X đồng) trong khung trần của hệ thống.

### 2.2.5. Vận hành cửa hàng
- [P0] Công tắc **Mở cửa / Tạm nghỉ** (tạm nghỉ 30 phút, 1 giờ, đến hết ngày).
- [P0] **Chế độ "Đông khách"**: tăng thời gian chuẩn bị mặc định, giới hạn số đơn đồng thời.
- [P0] Lịch nghỉ lễ, giờ mở cửa theo từng ngày.
- [P1] **Quản lý nhân viên**: thêm nhân viên, phân quyền (Nhận đơn / Sửa menu / Xem doanh thu / Quản lý shipper).
- [P1] Nhiều chi nhánh dưới một tài khoản chủ.

### 2.2.6. Doanh thu & Tài chính
- [P0] Doanh thu theo ngày/tuần/tháng; chi tiết từng đơn: giá trị món, chiết khấu, khuyến mãi quán chịu, **thực nhận**.
- [P0] Lịch thanh toán: **T+1** (mặc định) hoặc rút tiền ngay (phí nhỏ).
- [P1] Báo cáo: món bán chạy, giờ cao điểm, tỷ lệ huỷ, điểm đánh giá theo thời gian.
- [P1] Xuất Excel; hoá đơn chiết khấu từ nền tảng.

### 2.2.7. Marketing cho quán
- [P1] Tạo khuyến mãi: giảm %, giảm tiền, mua 1 tặng 1, freeship, combo, giờ vàng.
- [P1] Quảng cáo "Lên top Quanh bạn" theo bán kính & ngân sách ngày.
- [P2] Nhắn tin cho khách quen (đã đồng ý nhận tin).

---

## 2.3. App Tài xế — "SQT Tài Xế" (Shipper hệ thống & Shipper của quán)

### 2.3.1. Đăng ký & Xác minh
- [P0] SĐT + OTP → eKYC CCCD + selfie (kiểm tra người thật — liveness).
- [P0] Bằng lái xe, đăng ký xe, ảnh xe, biển số.
- [P1] Lý lịch tư pháp: **không bắt buộc** khi đăng ký (tránh rào cản); nộp thì được huy hiệu "Đã xác minh nhân thân ✔" và được ưu tiên đơn giá trị cao.
- [P0] Tài khoản ngân hàng/ví nhận tiền.
- [P0] Khoá học online ngắn (15 phút) + bài kiểm tra: quy trình giao, an toàn thực phẩm, ứng xử, an toàn giao thông.
- [P1] Nhận đồng phục / thùng giữ nhiệt (ký quỹ hoặc trả góp).
- **Shipper của quán**: chỉ cần eKYC + được chủ quán mời; không bắt buộc đồng phục; chỉ thấy đơn của quán mình.

### 2.3.2. Ca làm & Trạng thái
- [P0] Công tắc **Trực tuyến / Ngoại tuyến**.
- [P0] Bản đồ nhiệt **khu vực nhiều đơn** & hệ số giá cao điểm.
- [P1] Đăng ký ca trước (đảm bảo thu nhập tối thiểu theo ca nếu đạt điều kiện online).
- [P1] Chế độ **"Về nhà"**: chỉ nhận đơn thuận đường về địa chỉ đã đặt.
- [P0] Cài đặt loại xe: xe máy / xe máy điện / xe ba gác (hàng nặng: nước bình, gạo; **không nhận bình gas**). Bật/tắt nhận hàng nặng.

### 2.3.3. Nhận chuyến (Cổng B)
- [P0] Lời mời chuyến hiển thị: điểm lấy, điểm giao, **tổng quãng đường**, **thu nhập dự kiến**, hình thức thanh toán (có phải ứng tiền COD không), loại hàng (nặng/dễ vỡ/thuốc), đếm ngược **20 giây**.
- [P0] **Nhận chuyến** / **Bỏ qua** (bỏ qua không bị phạt nhưng ảnh hưởng nhẹ tới ưu tiên nếu bỏ quá nhiều).
- [P1] Ghép đơn: nhận thêm 1 đơn cùng quán/cùng hướng (tối đa 2–3 đơn), hệ thống tính lại lộ trình.
- [P0] Huỷ sau khi nhận: phải nêu lý do; huỷ nhiều → giảm điểm tin cậy.

- [P0] Tab **"Chuyến hẹn 🟣"** (chợ chuyến hẹn giờ realtime): xem các chuyến hẹn quán đã nhận, **Giữ chuyến**, xác nhận "Tôi sẵn sàng" trước giờ; shipper uy tín cao thấy sớm hơn → [Phần 10](10-don-hen-gio.md), [Phần 11](11-diem-uy-tin-khu-vuc.md).

### 2.3.4. Thực hiện chuyến
- [P0] Dẫn đường (mở Google Maps / bản đồ tích hợp).
- [P0] Các bước bắt buộc, có kiểm tra vị trí (geofence):
  1. **Đã đến quán** (chỉ bấm được khi trong bán kính 100 m quán)
  2. **Đã lấy hàng** — quét QR / nhập mã đơn, kiểm đủ món theo checklist, [tuỳ chọn] chụp ảnh túi hàng đã niêm phong
  3. **Đã đến điểm giao** (geofence 150 m)
  4. **Đã giao** — chụp ảnh giao hàng (bắt buộc nếu "để ở cửa"), nhập PIN (nếu có), thu COD
- [P0] **GPS yếu (hẻm sâu, chung cư):** cho phép bấm *Đã đến* ngoài vùng geofence kèm **ảnh chụp** tại chỗ; đơn được gắn cờ để hậu kiểm, không chặn shipper.
- [P0] **Phí chờ tại quán:** món chưa xong sau 10 phút kể từ giờ quán cam kết → shipper được trả phí chờ theo phút (nền tảng trả, ghi vào chỉ số đúng giờ của quán). Chờ > 25 phút → shipper được nhả chuyến không bị trừ điểm.
- [P0] Gọi ẩn số / chat với khách & quán.
- [P0] **Không liên lạc được khách**: bấm "Khách không nghe máy" → hệ thống gọi tự động + nhắn tin, chờ 5–10 phút có đếm giờ → CSKH quyết định (để lại bảo vệ, hoàn về quán…); shipper vẫn được trả phí.
- [P0] **Nút SOS** khẩn cấp: gửi vị trí tới đội an toàn + số người thân.

### 2.3.5. Thu nhập & Ví
- [P0] Thu nhập từng chuyến (cước + thưởng + tip), tổng theo ngày/tuần.
- [P0] **Số dư thu nhập** (khoản nền tảng nợ shipper, không phải ví điện tử); **hạn mức COD** (giới hạn tiền mặt đang cầm, VD 2 triệu, vượt thì phải nộp qua chuyển khoản trước khi nhận đơn COD mới).
- [P0] Rút tiền về ngân hàng (miễn phí 1 lần/ngày).
- [P1] Thưởng mốc (10/20/30 chuyến/ngày), thưởng giờ cao điểm, thưởng trời mưa.
- [P1] Bảo hiểm tai nạn theo chuyến.

---

## 2.4. Web Vận hành (Ops / Điều phối / CSKH)

- [P0] **Bản đồ trực tiếp** toàn thành phố: đơn theo màu trạng thái, shipper online, quán đang mở.
- [P0] **Hàng đợi "Đơn có vấn đề"** (tự động phát hiện):
  - Quán chưa xác nhận > 2 phút
  - Không tìm được shipper > 5 phút
  - Shipper đứng yên > 10 phút khi đang giao
  - Giao trễ > 15 phút so với ETA
  - Khách báo sự cố
- [P0] Thao tác can thiệp: gọi quán/shipper/khách, **gán shipper thủ công**, đổi quán, huỷ có bồi hoàn, cộng voucher xin lỗi.
- [P0] Tra cứu đơn / người dùng / quán / shipper; xem **nhật ký sự kiện đầy đủ** của đơn (ai, làm gì, lúc nào, ở đâu).
- [P0] Hệ thống ticket CSKH: tiếp nhận, phân loại, SLA, hoàn tiền (có phân cấp duyệt theo số tiền).
- [P1] Điều chỉnh hệ số giá theo khu vực (thời tiết xấu, sự kiện).
- [P1] Phát thông báo khẩn tới shipper trong khu vực (ngập lụt, tắc đường).

## 2.5. Web Quản trị (Admin)

- [P0] Duyệt hồ sơ quán & shipper (xem ảnh CCCD, kết quả eKYC, giấy phép), duyệt/từ chối/yêu cầu bổ sung.
- [P0] Quản lý **khu vực hoạt động** (vẽ đa giác trên bản đồ): bật/tắt dịch vụ, cấu hình phí theo vùng.
- [P0] Cấu hình **bảng phí**: phí ship cơ bản, theo km, phụ phí, hệ số cao điểm, chiết khấu theo ngành/quán.
- [P0] Cấu hình **tham số SLA** (thời gian chờ xác nhận, số vòng tìm shipper, bán kính mở rộng…).
- [P0] Quản lý khuyến mãi toàn hệ thống, ngân sách, chống lạm dụng.
- [P0] Phân quyền nội bộ (RBAC): Admin, Ops, CSKH cấp 1/2, Kế toán, Marketing — **nhật ký thao tác (audit log)** cho mọi hành động nhạy cảm.
- [P0] Đối soát & chi trả: quán (T+1), shipper (hằng ngày/tuần), nộp COD, xuất file chuyển khoản hàng loạt.
- [P1] Dashboard kinh doanh: GMV, số đơn, AOV, tỷ lệ huỷ, CAC, retention, cohort.
- [P1] Quản lý nội dung: banner, danh mục, bài viết trợ giúp, thông báo đẩy marketing.
- [P0] **Danh mục hàng cấm/hạn chế** và kiểm duyệt món mới (thuốc kê đơn, rượu bia, thuốc lá, hàng cấm theo pháp luật bị chặn tự động theo từ khoá + duyệt tay).
- [P0] **Trang trạng thái hệ thống** & công cụ gửi thông báo sự cố tới khách/quán/shipper; công tắc **chế độ vận hành suy giảm** (xem Phần 5, mục 5.11).
