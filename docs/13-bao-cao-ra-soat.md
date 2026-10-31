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

## 13.5. Việc cần xác nhận trước khi bắt đầu xây dựng

Đây là những điểm **tài liệu không thể tự chốt** — cần chủ sản phẩm hoặc chuyên gia quyết định:

1. **Pháp lý:** thủ tục đăng ký sàn TMĐT; quy định khấu trừ thuế cho hộ kinh doanh & shipper; điều kiện kinh doanh thuốc không kê đơn trực tuyến; thủ tục chuyển dữ liệu cá nhân ra nước ngoài (do Groq xử lý ở nước ngoài). → *Luật sư & chuyên gia thuế.*
2. **Groq:** kiểm tra trên console Groq danh sách model hiện hành, hạn mức tốc độ của gói tài khoản, giá, và chính sách lưu trữ dữ liệu; chạy bộ đánh giá tiếng Việt để chọn model cho từng tác vụ; chọn nhà cung cấp LLM dự phòng.
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
