# 🛵 Ship Quanh Tôi

> *"Cần gì có nấy — quanh bạn, có người thật lo."*

Nền tảng giao hàng **siêu địa phương**: người dùng mở app là thấy ngay các quán, tạp hoá, nhà thuốc… quanh mình, đặt các món cần thiết và được giao bởi **shipper của hệ thống** hoặc **chính quán tự giao**. **Mọi đơn đều do người thật xác nhận**: quán xác nhận món (Cổng A) và shipper đã đăng ký xác nhận chuyến (Cổng B).

## 📚 Bộ tài liệu đặc tả

| # | Tài liệu | Nội dung |
|---|----------|----------|
| 1 | [Tổng quan sản phẩm](docs/01-tong-quan-san-pham.md) | Tầm nhìn, khác biệt, các bên tham gia, nguyên tắc "Người thật xác nhận", ngành hàng, mô hình doanh thu, KPI |
| 2 | [Chức năng chi tiết](docs/02-chuc-nang-chi-tiet.md) | App Khách, App Quán, App Shipper, Web Vận hành, Web Quản trị (phân mức P0/P1/P2) |
| 3 | [Luồng đặt hàng & xác nhận](docs/03-luong-dat-hang-va-xac-nhan.md) | Sơ đồ luồng, máy trạng thái đơn, SLA Cổng A/B & dự phòng, thuật toán điều phối, chính sách huỷ, ngoại lệ, thông báo |
| 4 | [Giá, thanh toán & đối soát](docs/04-gia-thanh-toan-doi-soat.md) | Công thức phí ship, COD, ví, sổ cái kép, chia tiền, chi trả, khuyến mãi |
| 5 | [Kiến trúc kỹ thuật](docs/05-kien-truc-ky-thuat.md) | Công nghệ, sơ đồ hệ thống, realtime, tìm kiếm quanh tôi, độ tin cậy, hiệu năng, bảo mật, SRE, kiểm thử |
| 6 | [CSDL & API](docs/06-co-so-du-lieu-va-api.md) | ERD, lược đồ SQL (PostgreSQL + PostGIS), đặc tả REST API & WebSocket |
| 7 | [Trải nghiệm, an toàn & sáng tạo](docs/07-trai-nghiem-an-toan-va-sang-tao.md) | Nguyên tắc UX/UI, uy tín, chống gian lận, an toàn, 13 tính năng sáng tạo, CSKH |
| 8 | [Lộ trình, đội ngũ & rủi ro](docs/08-lo-trinh-doi-ngu-rui-ro.md) | Lộ trình MVP → 1.0 → tăng trưởng, đội ngũ, go-to-market, chỉ số, rủi ro, checklist ra mắt |

## ⚡ Tóm tắt nhanh

- **3 ứng dụng di động:** Khách · Đối tác Quán · Tài xế — cùng **2 web:** Vận hành/CSKH · Quản trị.
- **Hai chế độ giao:** Hệ thống giao · Quán tự giao · Lai · Tự giao có dự phòng hệ thống.
- **Xác nhận bằng người thật:** chuông toàn màn hình → nhắc → **gọi IVR tự động** → điều phối viên gọi → huỷ & hoàn tiền nếu quá 3 phút. Shipper nhận chuyến theo các vòng tìm mở rộng, có gán tay khi cần.
- **Công nghệ:** Flutter/React Native · Next.js · NestJS/Go · PostgreSQL + PostGIS · Redis GEO · Kafka · OpenSearch · WebSocket · Kubernetes.
- **Ổn định:** máy trạng thái chặt, nhật ký sự kiện bất biến, outbox, idempotency, sổ cái kép, hẹn giờ SLA bền vững, giám sát theo SLO.
