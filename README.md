# 🛵 Ship Quanh Tôi

> *"Cần gì có nấy — quanh bạn, có người thật lo."*
>
> **Trạng thái: Bản đặc tả v1.1 — đã rà soát và chốt để xây dựng.**

Nền tảng giao hàng **siêu địa phương**: người dùng mở app là thấy ngay các quán, tạp hoá, nhà thuốc… quanh mình, đặt các món cần thiết và được giao bởi **shipper của hệ thống** hoặc **chính quán tự giao**. **Mọi đơn đều do người thật xác nhận**: quán xác nhận món (Cổng A) và shipper đã đăng ký xác nhận chuyến (Cổng B).

## 📚 Bộ tài liệu đặc tả

| # | Tài liệu | Nội dung |
|---|----------|----------|
| 1 | [Tổng quan sản phẩm](docs/01-tong-quan-san-pham.md) | Tầm nhìn, khác biệt, các bên tham gia, nguyên tắc "Người thật xác nhận", ngành hàng, mô hình doanh thu, KPI |
| 2 | [Chức năng chi tiết](docs/02-chuc-nang-chi-tiet.md) | App Khách, App Quán, App Shipper, danh sách tối thiểu cho Admin Console (phân mức P0/P1/P2) |
| 3 | [Luồng đặt hàng & xác nhận](docs/03-luong-dat-hang-va-xac-nhan.md) | Sơ đồ luồng, máy trạng thái đơn, SLA Cổng A/B & dự phòng, thuật toán điều phối, chính sách huỷ, ngoại lệ, thông báo |
| 4 | [Giá, thanh toán & đối soát](docs/04-gia-thanh-toan-doi-soat.md) | Công thức phí ship, COD, ví, sổ cái kép, chia tiền, chi trả, khuyến mãi |
| 5 | [Kiến trúc kỹ thuật](docs/05-kien-truc-ky-thuat.md) | Công nghệ, sơ đồ hệ thống, realtime, tìm kiếm quanh tôi, độ tin cậy, hiệu năng, bảo mật, SRE, kiểm thử |
| 6 | [CSDL & API](docs/06-co-so-du-lieu-va-api.md) | ERD, lược đồ SQL (PostgreSQL + PostGIS), đặc tả REST API & WebSocket |
| 7 | [Trải nghiệm, an toàn & sáng tạo](docs/07-trai-nghiem-an-toan-va-sang-tao.md) | Nguyên tắc UX/UI, uy tín, chống gian lận, an toàn, 13 tính năng sáng tạo, CSKH |
| 8 | [Lộ trình, đội ngũ & rủi ro](docs/08-lo-trinh-doi-ngu-rui-ro.md) | Lộ trình MVP → 1.0 → tăng trưởng, đội ngũ, go-to-market, chỉ số, rủi ro, checklist ra mắt |
| 9 | [Giao diện trực quan, sinh động](docs/09-giao-dien-truc-quan-sinh-dong.md) | Design system, màu theo ý nghĩa, hiệu ứng chuyển động, trực quan hoá, chi tiết dễ dùng cho từng app, gamification, kiểm thử khả dụng, **khả năng tiếp cận** (người lớn tuổi, khuyết tật, máy yếu, không cài app) |
| 10 | [Đơn hẹn giờ](docs/10-don-hen-gio.md) | Hẹn giờ lấy/giao, chuyển đơn chờ lâu sang hẹn giờ, "Yêu cầu mở" gửi nhiều quán, bảng đơn hẹn của quán, chợ chuyến hẹn của shipper, xác nhận lại trước giờ |
| 11 | [Điểm uy tín khu vực](docs/11-diem-uy-tin-khu-vuc.md) | Công thức điểm shipper/quán, chuẩn hoá theo khu vực, chống thao túng, cấp độ & huy hiệu, nơi sử dụng uy tín, Bảng Vàng khu vực |
| 12 | [Tích hợp AI (Groq)](docs/12-tich-hop-ai.md) | 18 tính năng AI đã rà soát; tích hợp Groq qua AI Gateway, giới hạn tốc độ, dự phòng, chế độ không-AI; an toàn, chi phí — AI gợi ý, người thật quyết định |
| 13 | [Báo cáo rà soát & hoàn thiện](docs/13-bao-cao-ra-soat.md) | Những gì đã loại bỏ, bổ sung, sửa cho nhất quán; ma trận đối chiếu yêu cầu; các việc cần xác nhận trước khi xây dựng |
| 14 | [Trang quản trị Admin](docs/14-trang-quan-tri-admin.md) | Dashboard tổng quan tuỳ biến, bản đồ trực tiếp có tua lại, trung tâm sự cố, hồ sơ 360°, **trung tâm cấu hình phân tầng** (theo khu/ngành/đối tác/thời gian), Rule Builder, xem trước tác động, duyệt 4 mắt, phiên bản & hoàn tác, báo cáo kéo thả, phân quyền tuỳ chỉnh |
| 15 | [Phân quyền, xếp loại & ưu tiên](docs/15-phan-quyen-xep-loai-uu-tien.md) | Admin chủ động phân quyền chức năng từng khách/quán/shipper, đánh giá thực địa & khách bí mật, nâng/hạ/khoá cấp, nhãn phân loại, điều chỉnh mức ưu tiên theo từng tác vụ (có biên độ, thời hạn, duyệt, nhật ký, khiếu nại) |

## ⚡ Tóm tắt nhanh

- **3 ứng dụng di động:** Khách · Đối tác Quán · Tài xế — cùng **Web quản lý quán** và **Admin Console** (vận hành, CSKH, quản trị hợp nhất).
- **Bốn chế độ giao:** Hệ thống giao · Quán tự giao · Lai · Tự giao có dự phòng hệ thống.
- **Xác nhận bằng người thật:** chuông toàn màn hình → nhắc → **gọi IVR tự động** → điều phối viên gọi → huỷ & hoàn tiền nếu quá 3 phút. Shipper nhận chuyến theo các vòng tìm mở rộng, có gán tay khi cần.
- **Đơn hẹn giờ:** khách chọn giờ lấy (sau 1–3 giờ hoặc giờ cụ thể); đơn hiện trực tiếp trên tab *Đơn hẹn* của quán và *Chợ chuyến hẹn* của shipper để họ chọn nhận; xác nhận lại trước giờ.
- **Uy tín là trung tâm:** điểm 0–100 chuẩn hoá theo khu vực, cấp Kim cương/Vàng/Bạc/Đồng, quyết định thứ hạng hiển thị, ưu tiên nhận đơn/chuyến hẹn và quyền lợi.
- **AI thông minh (Groq — phản hồi rất nhanh):** trợ lý đặt hàng "Hỏi Quanh", tạo menu từ ảnh, dự báo ETA & nhu cầu, điều phối, cảnh báo đơn nguy cơ, chống gian lận, bot CSKH — **AI không bao giờ xác nhận đơn thay người**.
- **Trực quan, sinh động:** radar "quanh tôi", màu theo trạng thái, hiệu ứng xác nhận ✔, bản đồ shipper di chuyển mượt, chế độ đơn giản cho chủ quán, vuốt để xác nhận cho shipper.
- **Admin Console linh hoạt:** chỉnh gần như mọi tham số vận hành theo từng khu, ngành, đối tác, khung giờ mà không cần lập trình hay phát hành app; có xem trước tác động, duyệt, phiên bản và hoàn tác 1 nút. Dashboard kéo thả, bấm vào mọi con số để xem chi tiết tới từng đơn.
- **Admin chủ động xếp loại & ưu tiên:** điểm tự động là nền; Admin phân quyền chức năng từng người, nâng/hạ cấp, gắn nhãn, cộng/trừ ưu tiên trong điều phối, chợ chuyến hẹn, hiển thị, CSKH — trong giới hạn ±20 điểm, có thời hạn, người duyệt và quyền khiếu nại.
- **Công nghệ (đã chốt cho MVP):** Flutter · Next.js · NestJS · PostgreSQL + PostGIS · Redis (GEO, Streams, BullMQ) · WebSocket · dịch vụ cloud được quản lý · **Groq** cho AI. Mở rộng sau: Go, Kafka, OpenSearch, Kubernetes.
- **Ổn định:** máy trạng thái chặt, nhật ký sự kiện bất biến, outbox, idempotency, sổ cái kép, hẹn giờ SLA bền vững, giám sát theo SLO.


## 📖 Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Cổng A** | Bước quán xác nhận nhận đơn (còn hàng, giá, thời gian chuẩn bị) |
| **Cổng B** | Bước shipper xác nhận nhận chuyến (hoặc giữ chuyến hẹn) |
| **COD** | Khách trả tiền mặt khi nhận hàng |
| **IVR** | Cuộc gọi tự động; quán bấm phím để nhận/từ chối đơn |
| **Đơn hẹn giờ** | Đơn đặt trước, chọn giờ lấy hàng hoặc giờ nhận hàng (sớm nhất 45 phút) |
| **Chợ chuyến hẹn** | Bảng trực tiếp các chuyến hẹn để shipper tự chọn giữ chuyến |
| **Yêu cầu mở** | Khách gửi nhu cầu cho nhiều quán trong khu, các quán báo giá |
| **Cấp uy tín** | Kim cương / Vàng / Bạc / Đồng / Tân binh / Cần cải thiện (Phần 11) |
| **Cấp hiệu lực** | Cấp tự động sau khi áp dụng điều chỉnh của Admin (Phần 15) |
| **Geofence** | Vùng bán kính quanh quán/điểm giao dùng để kiểm tra vị trí |
| **Chế độ suy giảm** | Cách hệ thống tiếp tục chạy khi một dịch vụ bị lỗi (Phần 5.11) |
| **MVP / 1.0** | Bản đầu tiên (tháng 2–5) / bản hoàn thiện đầu tiên (tháng 6–8) |
