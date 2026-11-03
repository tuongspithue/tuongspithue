# Phần 9 — Giao diện trực quan, sinh động & dễ dùng nhất

> Mục tiêu: **người lần đầu dùng đặt được đơn trong < 60 giây, không cần hướng dẫn**; chủ quán 60 tuổi nhận đơn được ngay; shipper thao tác an toàn bằng một tay.

---

## 9.1. Ba nguyên tắc vàng

| Nguyên tắc | Nghĩa là | Kiểm chứng |
|---|---|---|
| **Nhìn là hiểu** | Hình ảnh, biểu tượng, màu sắc nói thay chữ; mỗi màn hình chỉ có **1 hành động chính** nổi bật | Thử với 10 người lạ: ≥ 9 người hoàn thành đặt đơn không hỏi |
| **Luôn thấy chuyện gì đang xảy ra** | Mọi trạng thái đều có hình động + tên người đang xử lý + thời gian | Không có màn hình "chờ" nào không có thông tin |
| **Chạm ít nhất** | Nhớ sẵn địa chỉ, thanh toán, món hay đặt; mặc định thông minh | Đặt lại đơn cũ: 2 chạm; đơn mới: ≤ 4 chạm |

## 9.2. Hệ thống thiết kế (Design System) "Quanh"

### Màu sắc theo ý nghĩa (semantic colors)
| Token | Màu | Dùng cho |
|---|---|---|
| `primary` | Cam ấm `#FF6B2C` | Nút hành động chính, thương hiệu |
| `confirmed` | Xanh lá `#1DB954` | **Đã có người xác nhận ✔** |
| `waiting` | Vàng hổ phách `#FFB020` | Đang chờ xác nhận, đếm ngược |
| `scheduled` | Tím `#7C5CFF` | **Đơn hẹn giờ** (nhận diện tức thì trên mọi app) |
| `danger` | Đỏ `#E5484D` | Huỷ, sự cố, SOS |
| `trust-gold / silver / bronze` | Vàng kim / bạc / đồng | Cấp độ uy tín |

Có bộ màu riêng cho **chế độ tối**; mọi cặp chữ/nền đạt tương phản WCAG AA. Trạng thái không bao giờ chỉ dựa vào màu — luôn kèm biểu tượng + chữ.

### Chữ, khoảng cách, hình
- Font hỗ trợ tiếng Việt đẹp: **Be Vietnam Pro** (thiết kế cho tiếng Việt, dấu rõ ràng).
- Cỡ chữ tối thiểu 14 sp (khách), **16 sp** (quán, shipper); tôn trọng cỡ chữ hệ thống.
- Lưới 8 dp; bo góc 16 dp cho thẻ, 999 dp cho nút viên thuốc.
- Ảnh món tỷ lệ 4:3; app quán có **khung hướng dẫn chụp** và bộ lọc sáng/cân màu cơ bản để menu quán nhỏ cũng hấp dẫn mà vẫn đúng món thật.
- Bộ **minh hoạ riêng**: nhân vật shipper "Bé Quanh" (chiếc xe máy có giỏ), dùng cho màn hình trống, lỗi, chờ, chúc mừng.

## 9.3. Sinh động: Chuyển động & phản hồi (Motion & Micro-interactions)

| Khoảnh khắc | Hiệu ứng | Mục đích |
|---|---|---|
| Mở app, định vị | **Sóng radar lan toả** từ vị trí của bạn, các quán "bật" lên lần lượt trên bản đồ | Truyền tải ý "quanh tôi" |
| Thêm món vào giỏ | Ảnh món **bay vào giỏ** + giỏ nảy nhẹ + rung nhẹ (haptic) | Xác nhận đã thêm, vui mắt |
| Bấm "Đặt hàng" | Nút biến thành **vòng tròn đếm ngược** chờ quán | Giảm lo lắng khi chờ |
| Quán xác nhận | **Dấu ✔ xanh vẽ nét** + ảnh chủ quán trượt vào + âm "ting" | Khoảnh khắc "có người thật lo" |
| Shipper nhận chuyến | Thẻ shipper lật ra (ảnh, tên, xe, ★ uy tín) | Tạo tin tưởng |
| Đang giao | Icon xe máy **di chuyển mượt** trên đường (nội suy giữa các điểm GPS), quay đầu theo hướng | Không giật cục, cảm giác thật |
| Shipper còn 500 m | Bản đồ tự zoom + thẻ "Sắp tới rồi! 🛵" | Khách chuẩn bị xuống |
| Giao thành công | Pháo giấy nhẹ (chỉ lần đầu/dịp đặc biệt) + mời đánh giá bằng **sao rơi** | Kết thúc vui vẻ |
| Đang tải | **Khung xương (skeleton)** đúng hình thẻ quán, không dùng vòng xoay trơn | Cảm giác nhanh |
| Kéo để làm mới | Bé Quanh đạp xe | Thương hiệu |

- Công cụ: **Lottie/Rive** cho hoạt hình vector nhẹ; tất cả chuyển động ≤ 300 ms, có tuỳ chọn **"Giảm chuyển động"** theo cài đặt hệ thống.
- **Âm thanh có chủ đích**: chuông đơn mới của quán là âm riêng, dễ nhận ra giữa ồn ào bếp; âm mời chuyến của shipper khác âm đơn hẹn giờ.

## 9.4. Trực quan hoá thông tin

### Thẻ quán "đọc trong 1 giây"
```
┌───────────────────────────────────────────┐
│ [Ảnh món đẹp nhất]              🏅 Vàng   │
│ Cơm Tấm Bà Sáu            ★ 4.8 (1,2k)    │
│ 🟢 Đang mở · 🛵 ~18 phút · 450 m          │
│ 💚 Xác nhận TB 25 giây · Quán tự giao     │
│ 🏷️ Freeship đơn từ 60k                    │
└───────────────────────────────────────────┘
```
- **Thời gian đến tay** to hơn khoảng cách (vì đó là điều khách quan tâm).
- Huy hiệu uy tín (Phần 11) hiển thị ngay trên thẻ và trên ghim bản đồ.

### Bản đồ "sống"
- Ghim quán có **màu theo cấp uy tín** và **nhịp đập nhẹ** khi quán đang có khuyến mãi giờ vàng.
- Cụm ghim tự gộp khi thu nhỏ; vùng xanh nhạt = khu vực giao được ≤ 20 phút.
- Lớp "Đang hot": bong bóng nhỏ "🔥 12 người vừa đặt" trên quán đông khách.

### Dòng thời gian đơn hàng
Mỗi bước là một **thẻ có avatar người xác nhận**, giờ, và thời gian còn lại dạng thanh tiến trình. Đơn hẹn giờ có **đồng hồ tím** đếm tới giờ lấy (Phần 10).

## 9.5. Dễ dùng nhất: các chi tiết làm nên khác biệt

**Khách hàng**
- **Không bắt đăng ký trước**: xem thoải mái, chỉ hỏi SĐT khi đặt.
- **Định vị thông minh**: tự nhận "Nhà/Công ty" theo giờ; hỏi xác nhận bằng ghim kéo thả trên bản đồ với ảnh vệ tinh để chỉ đúng cổng/hẻm.
- *(1.0 – Tăng trưởng)* **Đặt bằng giọng nói / chat AI**: "Cho mình 2 ly cà phê sữa đá ít đường giao lên văn phòng" → giỏ hàng được điền sẵn, khách chỉ bấm xác nhận.
- **"Như mọi lần"**: thẻ đầu trang chủ chứa 3 đơn hay đặt, 1 chạm đặt lại.
- **Nút sticky "Đặt hàng"** luôn hiển thị tổng tiền cuối cùng — không bất ngờ phí.
- **Ghi chú món bằng chip**: dưới mỗi món trong giỏ là hàng chip bấm chọn (`Không hành` `Ít đá`…) + ô gõ/micro; chip từ sở thích đã lưu hiện sẵn với dấu ✓ nhạt. Chip dị ứng màu đỏ có biểu tượng ⚠.
- **Hoàn tác (Undo)** 5 giây sau khi xoá món/huỷ thao tác.
- **Lỗi thân thiện**: "Quán vừa hết Cơm sườn 😢 — thử Cơm sườn bì chả (giá tương tự)?" kèm nút chọn ngay.

**Chủ quán**
- **Chế độ Đơn giản**: màn hình chỉ có bảng đơn dạng cột (Mới → Đang làm → Chờ lấy → Xong), mỗi đơn là thẻ lớn, **vuốt phải để nhận**, nút "Xong món" to.
- **Chế độ máy tính bảng / đặt quầy**: hiển thị như bảng bếp (Kitchen Display), chữ to, tự xoay ngang.
- **Hướng dẫn bằng video ngắn 30 giây** ngay trong app, tiếng Việt, có người thật.
- **Ghi chú nổi bật trên thẻ đơn**: ghi chú từng món in đậm ngay dưới món; dị ứng là dải đỏ trên đầu thẻ, phải vuốt *"Đã đọc"* mới nhận được đơn.
- **Đọc đơn bằng giọng nói**: "Đơn mới: 2 phở bò tái, một tô không hành, 1 trà đá, 95 nghìn" — tay đang làm bếp vẫn nghe được.

**Shipper**
- **Vuốt để xác nhận** từng bước (tránh bấm nhầm khi chạy xe), nút lớn ở nửa dưới màn hình.
- **Chế độ lái xe**: màn hình tối giản, chỉ chỉ đường + đọc thông báo bằng giọng nói; khi tốc độ > 10 km/h chỉ còn **nút lớn Nhận/Bỏ qua chuyến và lệnh giọng nói**, mọi thao tác nhập liệu khác tạm khoá.
- **Thẻ chuyến trực quan**: bản đồ mini có đường đi A → B, thu nhập in to, biểu tượng hàng nặng/dễ vỡ/hẹn giờ.

## 9.6. Hành trình làm quen (Onboarding) 3 bước
1. **Màn chào động**: radar quanh vị trí → "Có 86 quán quanh bạn" (con số thật).
2. **Chọn sở thích bằng biểu tượng** (bỏ qua được): 🍜 🧋 🛒 💊 🌸 — để cá nhân hoá trang chủ ngay lần đầu.
3. **Voucher chào mừng** hiện dạng phong bao lì xì, bấm mở có hoạt hình.

## 9.7. Trò chơi hoá nhẹ nhàng (Gamification)
- Khách: **"Bản đồ khám phá"** — mỗi quán mới thử là một ô sáng lên; đủ 10 quán nhận voucher. Chuỗi đặt hàng tuần.
- Shipper: thanh tiến độ thưởng ngày dạng vòng tròn, huy hiệu theo mốc, **bảng xếp hạng khu vực** (Phần 11).
- Quán: "Nhiệm vụ tuần": phản hồi 10 đánh giá, giữ tỷ lệ xác nhận 100% → tăng hiển thị.

## 9.8. Quy trình đảm bảo "dễ dùng nhất"
- Thiết kế trên **Figma** với design system dùng chung cho 3 app; prototype tương tác trước khi code.
- **Kiểm thử khả dụng** mỗi 2 tuần với 5–8 người thật (có chủ quán lớn tuổi, shipper đang chạy xe).
- Đo bằng dữ liệu: thời gian từ mở app → đặt hàng, tỷ lệ rời bỏ ở từng bước checkout, bản đồ nhiệt chạm (heatmap), ghi phiên ẩn danh (có đồng ý).
- **A/B test** mọi thay đổi lớn của trang chủ/checkout qua feature flag.
- Mục tiêu: **SUS (System Usability Scale) ≥ 80**, tỷ lệ hoàn tất checkout ≥ 85%.

## 9.9. Khả năng tiếp cận — ai cũng dùng được

> Mục tiêu: **người lớn tuổi, người ít dùng công nghệ, người khuyết tật, người dùng máy yếu/mạng yếu** đều đặt hàng, nhận đơn và giao hàng được. Mỗi mục có mức ưu tiên như Phần 2.

### Ai cũng tiếp cận được kênh đặt hàng
| Đối tượng | Giải pháp | Ưu tiên |
|---|---|---|
| Người không muốn cài app | **Zalo Mini App** và **Web đặt nhanh** (quét QR dán tại quán hoặc mở link) dùng chung tài khoản và API | P1 |
| Người không dùng smartphone / người cao tuổi | **Đặt hộ** bởi người thân (người nhận khác, chia sẻ link theo dõi); **đặt qua tổng đài**: CSKH tạo đơn thay khách, vẫn qua quán xác nhận như thường | P0 (đặt hộ) · P2 (tổng đài) |
| Người không có tài khoản ngân hàng / ví | Luôn có **COD** (khi đủ điều kiện) và VietQR quét từ máy người khác | P0 |
| Người ở hẻm sâu, địa chỉ khó tìm | Ghim bản đồ + ảnh chỉ đường + ghi chú; shipper gọi ẩn số | P0 |
| Quán chủ lớn tuổi, ít dùng app | Chế độ Đơn giản 3 nút, chuông lớn, **xác nhận qua cuộc gọi IVR bấm phím**, đại sứ khu vực cài đặt tận nơi | P0 |

### Người khuyết tật
| Nhu cầu | Giải pháp | Ưu tiên |
|---|---|---|
| Khiếm thị / thị lực kém | Mọi nút có nhãn cho **TalkBack/VoiceOver**; thứ tự đọc hợp lý; ảnh món có mô tả thay thế; hỗ trợ cỡ chữ hệ thống tới 200% mà không vỡ bố cục; **chế độ chữ to** cho cả app khách | P0 |
| Mù màu | Trạng thái luôn có **biểu tượng + chữ**, không chỉ màu; bảng màu đã kiểm tra với các dạng mù màu phổ biến | P0 |
| Khiếm thính | Cài đặt **"Ưu tiên nhắn tin thay gọi điện"** cho khách; với **shipper khiếm thính**, khách và quán được báo trước *"Shipper giao tiếp bằng tin nhắn"* và nút gọi chuyển thành nút nhắn; mọi âm báo đều có rung + hiển thị trên màn hình | P0 (khách) · P1 (shipper) |
| Khó khăn vận động | Vùng chạm ≥ 48 dp (≥ 56 dp ở app quán/shipper); thao tác vuốt luôn có nút thay thế; không có thao tác giới hạn thời gian quá ngắn (đếm ngược mời chuyến có thể kéo dài theo cài đặt trợ năng) | P0 |
| Nhạy cảm với chuyển động | Tôn trọng "Giảm chuyển động" của hệ thống; tắt pháo giấy và nhịp đập | P0 |
| Khó đọc chữ / ít học | Biểu tượng rõ nghĩa, câu ngắn; đọc đơn bằng giọng nói cho quán; nhập bằng giọng nói (1.0) | P0 · P1 |

### Thiết bị & mạng
- Chạy tốt trên **Android 8+ với 2 GB RAM**; app < 30 MB; chế độ tiết kiệm dữ liệu (ảnh nhỏ, tắt bản đồ trực tiếp, cập nhật định kỳ).
- Thao tác quan trọng (nhận đơn, nhận chuyến, đã giao) **hoạt động khi mạng chập chờn**: lưu tạm và gửi lại (Phần 5.6); quán còn có IVR làm kênh dự phòng.

### Ngôn ngữ
- Tiếng Việt là mặc định, văn phong dễ hiểu; nhận dạng giọng nói đủ ba miền (Phần 12.6).
- **Tiếng Anh** cho khách nước ngoài (P2). Tên món giữ tiếng Việt kèm mô tả ngắn.

### Kiểm chứng
- Đạt **WCAG 2.1 mức AA** cho app khách, Zalo Mini App, Web đặt nhanh và Admin Console.
- Mỗi đợt kiểm thử khả dụng (9.8) có ít nhất 1 người lớn tuổi và 1 người dùng trình đọc màn hình; kiểm tra tự động độ tương phản và nhãn trợ năng trong CI.
- Cài đặt trợ năng lưu theo tài khoản (`PATCH /v1/me/preferences`), đổi máy không mất.
