# Phần 8 — Lộ trình triển khai, Đội ngũ, Vận hành thị trường & Rủi ro

---

## 8.1. Lộ trình theo giai đoạn

### Giai đoạn 0 — Chuẩn bị (Tháng 1)
- Nghiên cứu 1 khu vực thí điểm (VD: 2–3 phường có mật độ dân cư & văn phòng cao).
- Phỏng vấn 30 quán, 20 shipper, 50 khách → xác thực giả thuyết.
- Thiết kế UX/UI (Figma) cho 3 app + prototype bấm thử.
- Thành lập pháp nhân, đăng ký **sàn giao dịch thương mại điện tử** với Bộ Công Thương, hợp đồng mẫu, chính sách bảo mật & điều khoản.
- Ký hợp đồng cổng thanh toán, SMS/ZNS, eKYC, tổng đài IVR, bản đồ.

### Giai đoạn 1 — MVP (Tháng 2–4) · *"Chạy được, có người thật xác nhận"*
- App khách: Quanh tôi (danh sách + bản đồ), tìm kiếm cơ bản, trang quán, giỏ hàng, COD + 1 ví điện tử + VietQR, **đặt hẹn giờ lấy/giao**, theo dõi đơn realtime với hiệu ứng sinh động cốt lõi, đánh giá, báo sự cố.
- Đơn hẹn giờ: tab Đơn hẹn cho quán, Chợ chuyến hẹn cho shipper, xác nhận lại trước giờ.
- Điểm uy tín phiên bản 1 (hoàn thành, đúng giờ, sao Bayes, xác nhận) + cấp độ hiển thị trên thẻ quán/shipper.
- App quán: đăng ký + duyệt, menu, **nhận/từ chối đơn (chuông lớn + IVR dự phòng)**, chuẩn bị xong, mở/đóng, chế độ giao Hệ thống / Tự giao, mời shipper của quán, doanh thu cơ bản.
- App shipper: đăng ký + eKYC, online/offline, **nhận chuyến**, quy trình 4 bước có geofence, ảnh giao hàng, thu nhập, COD.
- Web Ops/Admin: duyệt hồ sơ, bản đồ trực tiếp, hàng đợi đơn có vấn đề, gán tay, hoàn tiền, cấu hình phí & SLA.
- Backend: modular monolith, PostgreSQL+PostGIS, Redis, WebSocket, outbox, ledger.
- **Mục tiêu ra mắt thí điểm:** 150 quán, 80 shipper, 300 đơn/ngày sau 4 tuần.

### Giai đoạn 2 — Phiên bản 1.0 (Tháng 5–7) · *"Mượt và đáng tin"*
- Thêm ví/thẻ, hẹn giờ, tự đến lấy, đơn nhóm, tip, PIN nhận hàng.
- Khuyến mãi (quán & nền tảng), quảng cáo lên top, huy hiệu, điểm tin cậy.
- Yêu cầu mở (gửi nhiều quán, nhận báo giá), Bảng Vàng khu vực, khiếu nại điểm uy tín.
- AI: OCR menu, mô tả món, gợi ý món thay thế/kèm, tóm tắt đánh giá, bot CSKH, ETA học máy, cảnh báo đơn nguy cơ.
- OCR menu, máy in nhiệt, nhân viên & phân quyền, đa chi nhánh.
- Ghép đơn cho shipper, chế độ "Về nhà", thưởng mốc, bảo hiểm.
- OpenSearch cho tìm kiếm, cao điểm theo H3, chế độ mưa bão.
- Mở rộng ra toàn quận/thành phố thí điểm.

### Giai đoạn 3 — Tăng trưởng (Tháng 8–12) · *"Khác biệt"*
- Gom đơn toà nhà, Shipper quen, Đi chợ hộ, Đặt định kỳ thông minh, Cú Đêm.
- Trợ lý AI cho quán, gợi ý cá nhân hoá, bản đồ món ngon.
- Gói thành viên SQT+, điểm thưởng.
- Tách Dispatch/Location/Notification thành service riêng; mở thành phố thứ 2.

### Giai đoạn 4 — Mở rộng (Năm 2)
- Nền tảng mở (API) cho chuỗi cửa hàng tích hợp POS.
- Giao hàng liên quán (1 shipper, nhiều quán), dịch vụ tại nhà.
- Mở rộng các tỉnh thành, mô hình **đối tác nhượng quyền khu vực** vận hành shipper địa phương.

## 8.2. Đội ngũ đề xuất cho MVP

| Vai trò | Số lượng |
|---|---|
| Product Manager | 1 |
| UX/UI Designer | 1–2 |
| Mobile (Flutter/RN) | 3 |
| Backend | 3 (1 chuyên dispatch/geo) |
| Frontend Web | 1 |
| QA (manual + automation) | 2 |
| DevOps/SRE | 1 |
| Data/Analytics | 1 (từ GĐ2) |
| Vận hành: Ops/Điều phối | 3–4 (chia ca) |
| CSKH | 3–4 (chia ca) |
| Phát triển đối tác quán (BD) | 3–5 |
| Tuyển dụng & đào tạo shipper | 1–2 |
| Kế toán | 1 |

## 8.3. Chiến lược "đánh chiếm" khu vực đầu tiên (Go-to-market)
1. **Bán kính nhỏ, mật độ cao**: chỉ phục vụ 3–5 km² đầu tiên để đảm bảo giao < 25 phút → trải nghiệm xuất sắc → truyền miệng.
2. **Cung trước, cầu sau**: ký 150 quán & 80 shipper trước khi quảng bá cho khách. Miễn chiết khấu 2 tháng đầu cho quán; **thu nhập tối thiểu theo ca** cho shipper giai đoạn đầu.
3. **Đại sứ phường**: người địa phương đi từng quán, cài app, chụp menu, dán decal "Có trên Ship Quanh Tôi" + mã QR đặt hàng tại quán.
4. **Kênh khách hàng**: nhóm Zalo/Facebook cư dân chung cư, ban quản lý toà nhà, voucher khách mới, giới thiệu bạn bè (cả 2 nhận 20.000đ).
5. **Đo lường mỗi ngày**: tỷ lệ quán xác nhận, thời gian tìm shipper, đơn kẹt — họp vận hành 15 phút mỗi sáng.

## 8.4. Mô hình chỉ số & báo cáo

| Nhóm | Chỉ số |
|---|---|
| Tăng trưởng | Đơn/ngày, GMV, khách hoạt động (DAU/MAU), quán hoạt động, shipper hoạt động |
| Chất lượng xác nhận | % quán xác nhận < 1 phút / < 3 phút, % xác nhận qua IVR, % đơn huỷ do quán không phản hồi |
| Chất lượng giao | Thời gian tìm shipper p50/p90, ETA chính xác (± 5 phút), % giao trễ, % giao thất bại |
| Kinh tế đơn vị | AOV, take rate, chi phí khuyến mãi/đơn, đóng góp biên/đơn (contribution margin), CAC, LTV |
| Hài lòng | ★ TB quán/shipper, NPS, % đơn có khiếu nại, thời gian xử lý ticket |
| Đối tác | Thu nhập TB shipper/giờ online, doanh thu TB quán/tuần, tỷ lệ rời bỏ đối tác |

## 8.5. Rủi ro & phương án giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Cạnh tranh từ các ứng dụng giao đồ ăn lớn | Cao | Tập trung siêu địa phương, quán nhỏ & nhu yếu phẩm, chiết khấu thấp, "Quán tự giao", tính năng cộng đồng |
| Thiếu shipper giờ cao điểm | Cao | Thưởng cao điểm, ca đăng ký trước, "Quán tự giao" bổ sung nguồn cung, mời đơn sớm theo thời gian chuẩn bị |
| Quán không trực app → lỡ đơn | Cao | Chuông lớn + IVR + Ops gọi + tự chuyển "Tạm nghỉ" khi lỡ nhiều |
| Gian lận khuyến mãi | Trung bình | Chống lạm dụng theo thiết bị/SĐT/thanh toán, ngân sách trần |
| Thất thoát COD | Trung bình | Hạn mức COD, cấn trừ thu nhập, khoá khi quá hạn |
| Sự cố hệ thống giờ cao điểm | Trung bình | Kiểm thử tải, autoscale, feature flag, cache theo ô H3, dự phòng nhà cung cấp |
| Pháp lý (TMĐT, dữ liệu cá nhân, thuế, dược phẩm) | Trung bình | Tư vấn luật từ đầu, đăng ký sàn TMĐT, tuân thủ bảo vệ dữ liệu cá nhân, giới hạn ngành hàng nhạy cảm |
| Tai nạn của shipper | Trung bình | Bảo hiểm theo chuyến, đào tạo, giới hạn giờ, không thúc ép ETA phi thực tế |
| Chi phí bản đồ/SMS tăng khi lớn | Thấp–TB | Tự host OSRM/Valhalla, ưu tiên ZNS/OTP qua app, cache geocode |

## 8.6. Danh sách kiểm tra trước khi ra mắt (Go-live checklist)
- [ ] Máy trạng thái đơn đã kiểm thử đầy đủ, không có đơn "mồ côi" (job quét đơn kẹt mỗi phút)
- [ ] Cổng A & Cổng B có hẹn giờ bền vững + dự phòng (IVR, Ops) — diễn tập thực tế
- [ ] Sổ cái cân bằng, đối soát sandbox cổng thanh toán đạt 100%
- [ ] Kiểm thử tải ×3 lưu lượng dự kiến giờ trưa
- [ ] Pentest & sửa lỗi mức Cao/Nghiêm trọng
- [ ] Giám sát + cảnh báo + on-call, runbook xử lý sự cố (cổng thanh toán sập, SMS sập, bản đồ sập, DB chậm)
- [ ] Điều khoản sử dụng, chính sách bảo mật, chính sách huỷ/hoàn tiền công khai trong app
- [ ] Đăng ký sàn TMĐT, thông báo/đăng ký ứng dụng theo quy định
- [ ] Ops & CSKH đã đào tạo, có kịch bản xử lý 20 tình huống phổ biến
- [ ] 150 quán, 80 shipper đã kích hoạt và chạy thử đơn thật nội bộ trong 1 tuần

---

> **Tóm lại:** *Ship Quanh Tôi* thắng nhờ **gần hơn, nhanh hơn, có người thật chịu trách nhiệm cho từng đơn**, và **thân thiện với quán nhỏ** — kết hợp hai lực lượng giao hàng (shipper hệ thống và shipper của quán) trên cùng một nền tảng minh bạch, ổn định.
