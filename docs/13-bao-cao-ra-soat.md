# Phần 13 — Báo cáo rà soát & hoàn thiện bản đặc tả

> Rà soát toàn bộ Phần 1–12 theo 4 tiêu chí ưu tiên: **(1) hoàn thiện**, **(2) vận hành ổn định**, **(3) phù hợp người dùng**, **(4) đúng nguyên tắc "người thật xác nhận"**. Các thay đổi dưới đây **đã được cập nhật trực tiếp** vào từng phần tương ứng.

---

## 13.1. Đã loại bỏ (không phù hợp)

| # | Chức năng cũ | Lý do loại | Thay bằng | Phần |
|---|---|---|---|---|
| 1 | **Chế độ quán tự động nhận đơn (auto-accept)** | Trái nguyên tắc cốt lõi: mọi đơn phải có người thật xác nhận | Nút **"Nhận nhanh"** 1 chạm với thời gian chuẩn bị gợi ý sẵn | 2, 6 |
| 2 | **Ví SQT có nạp tiền** | Giữ tiền khách như ví điện tử cần giấy phép của Ngân hàng Nhà nước; rủi ro pháp lý cao | **Tín dụng hoàn tiền** chỉ dùng mua hàng, không nạp/rút/chuyển; luôn cho chọn hoàn về nguồn gốc | 2, 4 |
| 3 | **Bán thuốc kê đơn** (ảnh đơn + dược sĩ xác nhận) | Quy định chặt về kinh doanh dược trực tuyến; rủi ro sức khoẻ | Chỉ thuốc không kê đơn & sản phẩm chăm sóc sức khoẻ từ nhà thuốc có phép; mã PIN khi nhận | 1, 7 |
| 4 | **Bán rượu bia** ở giai đoạn đầu | Cần xác minh tuổi khi nhận và tư vấn pháp lý | Không kinh doanh ở MVP & 1.0; cân nhắc sau | 7 |
| 5 | **Shipper hệ thống chở bình gas** | Nguy cơ an toàn cháy nổ; gas cần lắp đặt đúng kỹ thuật | Gas **chỉ do cửa hàng gas có phép tự giao** | 1, 2 |
| 6 | **Shipper ứng tiền cho quán** | Khó tìm shipper, tranh chấp tiền mặt | Hệ thống trả quán; quán dùng **"Rút tiền ngay"** | 4 |
| 7 | **Tạm giữ tiền (authorize) cho đơn hẹn** | Không phải ví/cổng VN nào cũng hỗ trợ → luồng không ổn định | Trừ tiền khi đặt, **hoàn tự động** khi bị từ chối/huỷ hợp lệ | 10 |
| 8 | **Livestream của quán** | Tốn tài nguyên, quán nhỏ ít dùng | Ảnh "món hôm nay" (P2) | 2 |
| 9 | **Gọi video chọn hàng** (Đi chợ hộ) | Tốn thời gian người bán, mạng yếu | Ảnh hàng thực tế + chat xác nhận | 7 |
| 10 | **Chấm sao/xếp hạng khách hàng** | Gây khó chịu cho khách, ít giá trị | Chỉ số đơn giản: số đơn thành công, số lần bỏ đơn COD | 10, 11 |
| 11 | **AI làm đẹp ảnh món** | Ảnh khác món thật → khiếu nại | Hướng dẫn chụp + bộ lọc ảnh cơ bản | 12 |
| 12 | **AI gợi ý giá bán cho quán** | Rủi ro bị coi là can thiệp giá | Hiển thị mặt bằng giá khu vực dạng số liệu | 12 |
| 13 | **AI tự quyết hoàn tiền / tư vấn thuốc** | Quyết định tài chính & y tế không giao cho LLM | Hoàn tiền theo quy tắc cố định; bot chỉ tìm nhà thuốc, khuyên hỏi dược sĩ | 12 |
| 14 | **Lý lịch tư pháp bắt buộc** cho shipper | Rào cản tuyển dụng lớn | Tự nguyện, có huy hiệu & ưu tiên | 2 |
| 15 | Nhiều lựa chọn công nghệ "A hoặc B" & hạ tầng nặng ngay từ MVP (Kafka, OpenSearch, Kubernetes) | Đội nhỏ vận hành nhiều thành phần → kém ổn định | **Chốt** Flutter + NestJS + PostgreSQL/PostGIS + Redis/BullMQ + dịch vụ cloud được quản lý; nâng cấp khi tải đòi hỏi | 5 |

## 13.2. Đã bổ sung (cần thiết)

| # | Bổ sung | Vì sao cần | Phần |
|---|---|---|---|
| 1 | **Groq làm nhà cung cấp AI** qua AI Gateway: cấu hình model theo tác vụ, hàng đợi chống vượt giới hạn tốc độ, xử lý lỗi `429`, timeout, circuit breaker, nhà cung cấp dự phòng | Trả lời nhanh nhưng không phụ thuộc một nhà cung cấp | 5, 12 |
| 2 | **Chế độ không-AI**: mọi tính năng AI đều có giao diện thay thế; không luồng cốt lõi nào phụ thuộc AI | Ổn định tuyệt đối khi AI lỗi | 12.5 |
| 3 | **Chế độ vận hành suy giảm** cho 8 loại sự cố (thanh toán, SMS, bản đồ, dispatch, realtime, push, AI, CSDL) + diễn tập hằng tháng | Không bao giờ "sập toàn bộ" | 5.11 |
| 4 | **Yêu cầu kho ứng dụng & hệ điều hành**: vị trí nền đúng quy định, chuông không bị Android "diệt", màn hình "Kiểm tra máy của bạn", đăng nhập Apple | Lỗi phổ biến nhất khiến quán/shipper lỡ đơn ngoài thực tế | 5.10 |
| 5 | **Xoá tài khoản trong app**, cài đặt thông báo, giờ yên lặng | Bắt buộc của App Store/Google Play & bảo vệ dữ liệu cá nhân | 2 |
| 6 | **Người nhận khác** (đặt hộ) | Nhu cầu rất phổ biến (đặt cho bố mẹ, bạn bè) | 2, 6 |
| 7 | **Phí chờ tại quán** cho shipper + được nhả chuyến khi chờ quá lâu | Công bằng với shipper, tạo động lực quán làm đúng giờ | 2, 6 |
| 8 | **Cho phép xác nhận "Đã đến" ngoài geofence kèm ảnh** | GPS trong hẻm/chung cư hay sai, không được chặn shipper | 2 |
| 9 | **Thuế khấu trừ thay hộ kinh doanh & shipper** theo quy định TMĐT; dòng tiền qua trung gian thanh toán có phép | Tuân thủ pháp luật, tránh rủi ro vận hành | 4 |
| 10 | **Hẹn giờ tối thiểu 45 phút**, giới hạn chuyến hẹn cho Tân binh & nhóm *Cần cải thiện* | Lấp các khoảng trống logic giữa Phần 10 và 11 | 10, 11 |
| 11 | **Cấp Tân binh 🌱** rõ ràng (< 30 đơn) | Đối tác mới có cơ hội công bằng | 11 |
| 12 | **Đặt định kỳ = chuỗi đơn hẹn**, mỗi lần đều cần người xác nhận | Giữ đúng nguyên tắc cốt lõi | 2 |
| 13 | **Danh mục hàng cấm/hạn chế** + kiểm duyệt món mới | Tránh vi phạm pháp luật | 2 |
| 14 | **Trang trạng thái hệ thống** & thông báo sự cố | Minh bạch với người dùng khi có sự cố | 2 |
| 15 | **Kênh Zalo Mini App** (bản 1.0) | Phần lớn người dùng Việt Nam dùng Zalo hằng ngày; đặt hàng không cần cài app | 8 |
| 16 | Ẩn danh dữ liệu "món hàng xóm hay đặt" (≥ 20 đơn, ≥ 10 khách) | Tránh lộ thông tin riêng tư | 2 |
| 17 | Che dữ liệu cá nhân trước khi gửi Groq; khai báo chuyển dữ liệu ra nước ngoài | Bảo vệ dữ liệu cá nhân | 12 |
| 18 | Bộ đánh giá tiếng Việt (≥ 300 câu, đủ vùng miền, teencode) để chọn model Groq | Chất lượng tiếng Việt giữa các model chênh lệch lớn | 12 |

## 13.3. Đã sửa cho nhất quán

| Vấn đề | Đã sửa |
|---|---|
| Tài liệu ghi "Hai chế độ giao" nhưng mô tả bốn | Thống nhất **bốn chế độ** ở Phần 1 & README |
| Đơn hẹn yêu cầu "khách uy tín ≥ Bạc" nhưng khách không có cấp | Đổi thành điều kiện đo được: ≥ 3 đơn hoàn thành, không bỏ đơn COD trong 90 ngày |
| Bảng chuyến hiển thị "Khách ★4.9" trong khi khách không bị chấm sao | Đổi thành "Khách ✔ 25 đơn" |
| Trường `accepted_channel` có giá trị `AUTO`; bảng `stores` có `auto_accept` | Xoá cả hai |
| Job hẹn giờ ghi "Temporal/BullMQ" | Chốt **BullMQ + job quét đối chiếu từ PostgreSQL** |
| Kafka/OpenSearch xuất hiện như thành phần MVP | Ghi rõ MVP dùng Redis Streams & PostGIS, nâng cấp sau |
| Chế độ lái xe khoá mọi thao tác > 10 km/h → shipper không nhận được chuyến | Giữ lại nút lớn Nhận/Bỏ qua + lệnh giọng nói |
| Hẹn giờ ở mức P1 trong khi là yêu cầu chính | Nâng lên **P0** (đã sửa ở lần trước) |
| Mô hình AI cụ thể của nhà cung cấp cũ | Thay bằng Groq, tên model đặt trong cấu hình |

## 13.4. Ma trận đối chiếu yêu cầu của chủ sản phẩm

| Yêu cầu | Đáp ứng ở | Trạng thái |
|---|---|---|
| Thấy các quán xung quanh với các món cần thiết | Phần 1.5, 2.1.2–2.1.4, 5.5, 6.3 | ✅ |
| Ship qua shipper hệ thống **hoặc** quán tự giao | Phần 2.2.4, 3.4 | ✅ |
| **Đặt hàng phải có người xác nhận trực tiếp** (quán/shipper đã đăng ký) | Phần 1.4, 3.3–3.4, 10.4–10.5; đã bỏ auto-accept | ✅ |
| Chuyên nghiệp, vận hành ổn định | Phần 3.2, 5.6–5.11, 8.6 | ✅ |
| Thuận lợi nhất cho người bán & người mua | Phần 2, 9 | ✅ |
| Trực quan, sinh động, dễ dùng nhất | Phần 9 | ✅ |
| Đặt hẹn giờ (bao nhiêu giờ lấy), hiện trực tiếp cho shipper/quán chọn nhận | Phần 10 | ✅ |
| Điểm uy tín shipper & quán khu vực đặc biệt quan trọng | Phần 11 (dùng ở 3.4, 5.5, 10.5) | ✅ |
| AI gợi ý, tư vấn, vận hành thông minh — **dùng Groq** | Phần 12 | ✅ |
| Trang admin tuỳ biến cài đặt mềm dẻo, nhìn tổng quan & chi tiết vận hành | Phần 14 | ✅ |
| Khả năng tiếp cận của mọi người dùng | Phần 9.9 | ✅ |
| Admin phân quyền chức năng người dùng, chủ động đánh giá, xếp loại, đặt mức ưu tiên trong tác vụ | Phần 15 | ✅ |

## 13.5. Việc cần xác nhận trước khi bắt đầu xây dựng

Đây là những điểm **tài liệu không thể tự chốt** — cần chủ sản phẩm hoặc chuyên gia quyết định:

1. **Pháp lý:** thủ tục đăng ký sàn TMĐT; quy định khấu trừ thuế cho hộ kinh doanh & shipper; điều kiện kinh doanh thuốc không kê đơn trực tuyến; thủ tục chuyển dữ liệu cá nhân ra nước ngoài (do Groq xử lý ở nước ngoài). → *Luật sư & chuyên gia thuế.*
2. **AI:** Admin tạo tài khoản Groq và **nhập key trên Admin Console** (Phần 12.8); kiểm tra hạn mức tốc độ, giá, chính sách lưu trữ dữ liệu của gói tài khoản; chạy bộ đánh giá tiếng Việt để chọn model mặc định cho từng tác vụ; (tuỳ chọn) thêm nhà cung cấp dự phòng.
3. **Khu vực thí điểm** đầu tiên (phường/quận cụ thể).
4. **Mức phí & chiết khấu** thực tế (các con số trong tài liệu là đề xuất ban đầu).
5. **Cổng thanh toán** sẽ ký đầu tiên (ảnh hưởng luồng hoàn tiền & chia tiền).
6. **Mô hình hợp đồng** với shipper hệ thống (đối tác tự do hay khác).

## 13.6. Đánh giá mức sẵn sàng

| Hạng mục | Mức hoàn thiện của đặc tả | Ghi chú |
|---|---|---|
| Sản phẩm & chức năng | Cao | Đủ để thiết kế UX/UI và chia đầu việc |
| Luồng đơn & xác nhận | Cao | Có máy trạng thái, SLA, ngoại lệ, dự phòng |
| Kỹ thuật & dữ liệu | Cao | Đủ để bắt đầu MVP; chi tiết API sẽ hoàn thiện bằng OpenAPI khi code |
| Vận hành & ổn định | Cao | Có chế độ suy giảm, giám sát, diễn tập |
| Pháp lý & thuế | Trung bình | Cần xác nhận chuyên gia (13.5) |
| AI (Groq) | Trung bình–Cao | Kiến trúc đã chốt; tên model & hạn mức cần xác nhận trên console Groq |

**Bước tiếp theo đề xuất:** (1) chốt 6 điểm ở 13.5 → (2) thiết kế Figma 3 app theo Phần 9 → (3) viết đặc tả OpenAPI từ Phần 6 → (4) khởi động MVP theo Phần 8.

---

## 13.7. Rà soát cuối & chốt bản đặc tả (v1.1)

Lần rà soát này đọc lại toàn bộ 15 phần theo bốn góc: **logic luồng**, **tính năng**, **nhất quán số liệu**, **khả năng tiếp cận**. Mọi chỉnh sửa đã được cập nhật trực tiếp vào từng phần.

### Logic luồng (máy trạng thái & chính sách)
| Vấn đề tìm thấy | Đã sửa | Phần |
|---|---|---|
| Đơn **khách tự đến lấy** chưa có trạng thái riêng | Thêm `CHO_KHACH_DEN_LAY` → hoàn thành khi khách đọc mã đơn; chỉ cần Cổng A | 3.2, 2.1.5, 6.4 |
| Shipper **nhả chuyến khi chờ món > 25 phút** không có đường quay lại | Thêm chuyển `SHIPPER_DEN_QUAN → DANG_TIM_SHIPPER` | 3.2 |
| **Sự cố giữa đường** (tai nạn, SOS) không có trạng thái | Thêm `DANG_GIAO → CAN_CAN_THIEP` | 3.2 |
| Hết 2 phút khách không trả lời đề xuất thay món — chưa rõ kết quả | Áp dụng lựa chọn "khi hết hàng" khách đã chọn lúc đặt; chỉ huỷ cả đơn khi mọi món đều hết | 3.2 |
| Đơn hẹn: thiếu nhánh khách huỷ, quán không xác nhận lại T−30, shipper không xác nhận T−20 | Bổ sung đủ các chuyển trạng thái | 10.6 |
| Khách **từ chối nhận hàng COD** sau khi shipper đã lấy hàng: chưa rõ ai chịu tiền | Quán & shipper vẫn được trả đủ, nền tảng chịu; khách bị ghi nhận và tắt COD sau 2 lần/90 ngày | 3.5 |
| Đơn **giá ước tính** (hàng cân) vẫn dùng "giữ tiền", mâu thuẫn chính sách không tạm giữ | Thu theo ước tính +15%, hoàn chênh tự động; COD thu giá thực | 3.6 |
| "Yêu cầu mở": chưa rõ thanh toán lúc nào, báo giá có phải là xác nhận không | Báo giá = Cổng A; khách thanh toán sau khi chọn; chỉ dùng cho đơn hẹn | 10.3 |
| Huỷ miễn phí đơn hẹn: điều kiện "hoặc" gây hiểu nhầm | Áp dụng mốc đến trước (quán bắt đầu làm / 30 phút trước giờ hẹn); sửa giờ = quán nhận lại | 10.2 |
| Thứ tự mốc thời gian Cổng A lệch (150s đứng trước 120s); 2.4 ghi "> 2 phút" | Sắp lại 0 → 45 → 90 → 120 → 150 → 180 giây; thống nhất ở 2.2.3, 2.4, 10.1 | 3.3 |
| Dispatch chưa dùng quyền chức năng & điều chỉnh ưu tiên của Phần 15 | Thêm điều kiện loại trừ theo quyền và cộng điều chỉnh ưu tiên | 3.4.1 |
| Chợ chuyến hẹn thiếu thời điểm hiển thị cho Kim cương & Tân binh | Kim cương & Vàng ngay, Bạc 5 phút, Đồng & Tân binh 10 phút, tính theo cấp hiệu lực | 10.5 |
| Trọng số điểm uy tín không còn tổng 100% khi thêm "Đánh giá của nền tảng" | Các trọng số khác co theo tỷ lệ | 11.2 |

### Tính năng & nhất quán
| Vấn đề tìm thấy | Đã sửa | Phần |
|---|---|---|
| Còn dấu vết chức năng đã bỏ: "gợi ý giá" bằng AI, "làm đẹp ảnh bằng AI", "ví", "shipper ứng tiền", "giữ tiền" | Xoá hoặc thay bằng phương án đã chốt | 3, 4, 5, 7, 9 |
| Danh sách ví điện tử khác nhau giữa các phần | MVP: COD + VietQR + MoMo; bản 1.0 thêm ZaloPay, ShopeePay, thẻ | 2.1.5, 4.3, 8 |
| Mã PIN ở mức P1 nhưng ngành thuốc nhắc như có từ đầu | Chốt **thứ tự mở ngành hàng**: thuốc & gas mở ở bản 1.0 cùng PIN | 1.5, 2.1.6, 8 |
| "Shipper hệ thống xác nhận thay quán" chưa rõ phạm vi | Chuyển sang P2, chỉ cho quán đăng ký chế độ này, ghi rõ người xác nhận | 1.4 |
| Thời gian chờ khi khách không nghe máy: "5–10 phút" và "10 phút" | Thống nhất 10 phút, cấu hình được | 2.3.4, 3.6 |
| Tham chiếu sai "chính sách huỷ (Phần 5)" | Sửa thành Phần 3.5 | 2.1.6 |
| Vai trò nội bộ còn ghi "Web vận hành / Web quản trị" | Thống nhất **Admin Console** | 1.3, 5.2 |
| Thiếu module Config, Entitlement, AI Gateway trong kiến trúc; thiếu API quyền, cài đặt, xoá tài khoản, nhả chuyến, bàn giao tự lấy | Bổ sung | 5.3, 6.4 |
| Phạm vi MVP lớn so với 3 tháng | Kéo MVP thành 4 tháng (2–5), dời 1.0 sang tháng 6–8 | 8.1 |
| "Shipper Quen", "Gom Đơn Toà Nhà" chưa gắn giai đoạn | Gắn giai đoạn Tăng trưởng | 7.3 |

### Khả năng tiếp cận (mới)
- Thêm **mục 9.9**: kênh đặt hàng cho người không cài app (Zalo Mini App, Web đặt nhanh, đặt hộ, đặt qua tổng đài); hỗ trợ khiếm thị, mù màu, khiếm thính (kể cả **shipper khiếm thính**), khó khăn vận động, nhạy cảm chuyển động; máy yếu, mạng yếu; mục tiêu **WCAG 2.1 AA** và cách kiểm chứng.
- Thêm **bảng thuật ngữ** trong README để người đọc không chuyên kỹ thuật dễ hiểu tài liệu.

### Kết luận
- Bản đặc tả **v1.1 được chốt để bắt đầu xây dựng**: đủ để thiết kế giao diện, viết đặc tả API chi tiết (OpenAPI) và lập kế hoạch MVP.
- Các điểm còn phụ thuộc bên ngoài vẫn là 6 mục ở **13.5** (pháp lý & thuế, thông tin Groq, khu vực thí điểm, mức phí, cổng thanh toán, hợp đồng shipper). Đây là quyết định kinh doanh/pháp lý, không chặn việc bắt đầu thiết kế và dựng khung kỹ thuật.
- Từ nay, mọi thay đổi đặc tả đi qua pull request và được ghi vào bảng thay đổi của Phần 13.

## 13.8. Thay đổi sau khi chốt v1.1

| Ngày | Thay đổi | Phần |
|---|---|---|
| 31/10/2026 | **Tạm gác mọi khả năng phân tích hình ảnh bằng AI** (đọc menu từ ảnh, kiểm duyệt/nhận diện ảnh…). Thay bằng nhập menu từ danh sách chữ, kiểm duyệt ảnh thủ công. eKYC của nhà cung cấp vẫn giữ | 1, 2, 6, 7, 8, 12.9 |
| 31/10/2026 | **Key, model, đường dẫn kết nối AI do Admin nhập** trên Admin Console; mặc định Groq; thêm được nhà cung cấp tương thích OpenAI làm dự phòng; key mã hoá, chỉ hiện 4 ký tự cuối, thay key cần duyệt 4 mắt | 5, 8, 12.8, 14 |
| 31/10/2026 | **Ghi chú theo sở thích cho từng món**: chip ghi chú nhanh do quán gợi ý, ô chữ/giọng nói, sở thích đã lưu tự điền, tách dòng để ghi chú khác nhau cho từng phần, ghi chú chung cả đơn, cảnh báo dị ứng có xác nhận riêng của quán; ghi chú không tự làm đổi giá | 2.1.4a, 2.2, 3, 6, 9, 11, 12 |
| 31/10/2026 | **Bắt đầu code MVP**: monorepo pnpm (`packages/domain`, `apps/api`). Việc hẹn giờ SLA ở MVP dùng bảng `scheduled_jobs` trên PostgreSQL thay cho BullMQ (ít thành phần hơn, vẫn bền vững) | 5.1, 5.6 |
| 31/10/2026 | **Bỏ dịch vụ trả phí SMS brandname, Zalo ZNS, IVR, số ẩn**: liên hệ Gọi/SMS/Zalo mở app trên máy (SĐT chỉ lộ cho các bên của đơn khi đơn đang chạy); nhắc quán bằng **Web Push miễn phí**; 90 giây quán chưa nhận thì **điều phối viên gọi quán** từ Admin Console. OTP giai đoạn thử hiện trên màn hình; kênh OTP khi chạy thật cần chủ sản phẩm chọn | 3.3, 5.1, 16 |
| 31/10/2026 | **Thử nghiệm bằng bản web (PWA) trước**, app cài đặt làm sau: yêu cầu thêm vào màn hình chính ngay lần đầu, GPS trình duyệt, chuông + giữ màn hình sáng khi trang mở, bộ triển khai Docker + HTTPS + dữ liệu mẫu | 16 |
| 31/10/2026 | **Chốt lại: khách dùng web app** (không bắt cài, gợi ý cài chỉ là tuỳ chọn); **quán & shipper dùng app cài đặt Android** để xác nhận kịp thời: dịch vụ chạy nền kêu chuông lặp lại cả khi khoá máy, thông báo toàn màn hình, shipper gửi vị trí nền, chụp ảnh xác nhận thật khi GPS yếu, màn hình "Kiểm tra máy". APK build tự động trên GitHub Actions. Bỏ bản web của quán/shipper | 2, 5, 16 |
