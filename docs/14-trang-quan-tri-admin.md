# Phần 14 — Trang Quản trị (Admin Console): tuỳ biến linh hoạt & nhìn thấu vận hành

> Mục tiêu: **(1) Thay đổi gần như mọi cài đặt vận hành mà không cần lập trình viên, không cần phát hành app mới**; **(2) Nhìn tổng quan toàn hệ thống trong 5 giây, và đi sâu tới từng đơn, từng quán, từng shipper trong 3 cú nhấp**; **(3) Linh hoạt nhưng an toàn**: mọi thay đổi đều được kiểm tra, xem trước, duyệt, ghi nhật ký và hoàn tác được.

Trang này thay thế và mở rộng mục 2.4 (Web Vận hành) và 2.5 (Web Quản trị) ở Phần 2: hai trang được hợp nhất thành **một Admin Console** duy nhất. Mỗi người chỉ thấy các khu vực mà vai trò của mình được phép xem.

---

## 14.1. Bố cục tổng thể

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🔍 Tìm mọi thứ (Ctrl+K): mã đơn, SĐT, tên quán, shipper, cài đặt…   🔔 3  👤 │
├───────────────┬──────────────────────────────────────────────────────────┤
│ 📊 Tổng quan    │                                                          │
│ 🗺️ Bản đồ trực tiếp │       NỘI DUNG CHÍNH                                     │
│ 🚨 Sự cố & cảnh báo │  (thanh lọc dùng chung: Thành phố ▸ Quận ▸ Khu vực ▸     │
│ 📦 Đơn hàng      │   Khoảng thời gian ▸ Ngành hàng ▸ Chế độ giao)           │
│ 🏪 Quán          │                                                          │
│ 🛵 Shipper       │                                                          │
│ 👥 Khách hàng     │                                                          │
│ 🎧 CSKH & Ticket │                                                          │
│ 💰 Tài chính      │                                                          │
│ 🏷️ Khuyến mãi     │                                                          │
│ ⭐ Uy tín         │                                                          │
│ 🤖 AI (Groq)     │                                                          │
│ ⚙️ Trung tâm cấu hình │                                                       │
│ 📈 Báo cáo        │                                                          │
│ 🔐 Phân quyền & Nhật ký │                                                    │
└───────────────┴──────────────────────────────────────────────────────────┘
```

**Nguyên tắc giao diện:**
- **Thanh lọc phạm vi dùng chung**: chọn một lần (VD *TP.HCM ▸ Quận 7 ▸ Hôm nay*), mọi trang con đều áp dụng phạm vi đó.
- **Mọi con số đều bấm được**: bấm "37 đơn trễ" sẽ ra danh sách 37 đơn đó, bấm tiếp vào một đơn sẽ ra toàn bộ dòng thời gian của đơn.
- **Tìm kiếm toàn cục (Ctrl+K)**: gõ mã đơn, SĐT, biển số, tên quán, hoặc tên một cài đặt ("thời gian chờ quán") là nhảy thẳng tới nơi cần xem.
- **Dữ liệu cập nhật trực tiếp** qua WebSocket, có ghi chú "cập nhật 2 giây trước".
- Hỗ trợ **màn hình lớn ở phòng điều hành** (chế độ TV toàn màn hình, tự xoay vòng các bảng) và **điện thoại** cho quản lý khi đi thị trường.
- Có chế độ sáng/tối; màu trạng thái thống nhất với app (Phần 9).

---

## 14.2. Tổng quan hệ thống (Dashboard) — nhìn trong 5 giây

### Dòng 1 — "Sức khoẻ ngay lúc này"
| Thẻ | Nội dung | Màu |
|---|---|---|
| 🟢 **Trạng thái hệ thống** | Tình trạng của API, thanh toán, SMS, bản đồ, Groq, realtime; chế độ suy giảm nào đang bật | Xanh/vàng/đỏ |
| 📦 **Đơn đang chạy** | Tổng đơn đang chạy, chia theo trạng thái (chờ quán · tìm shipper · đang giao), có sparkline 60 phút | |
| ⏱️ **Xác nhận của quán** | % đơn được quán nhận trong 1 phút / 3 phút, so với cùng giờ tuần trước | Đỏ nếu < 85% |
| 🛵 **Cung – cầu shipper** | Shipper online / đang rảnh / đơn chờ; tỷ lệ cung/cầu từng khu | Đỏ nếu thiếu |
| 🚨 **Đơn có vấn đề** | Số đơn kẹt, trễ, có khiếu nại; bấm để xử lý | Nhấp nháy khi tăng đột biến |
| 🟣 **Đơn hẹn sắp tới** | Đơn hẹn trong 2 giờ tới, số đơn chưa có shipper giữ | |

### Dòng 2 — Kinh doanh hôm nay (so sánh với hôm qua / tuần trước / mục tiêu)
Gồm số đơn, GMV, giá trị đơn trung bình, doanh thu nền tảng, tỷ lệ huỷ (tách theo khách / quán / shipper / hệ thống), thời gian giao trung bình, ★ trung bình, số khách mới.

### Dòng 3 — Biểu đồ
- Đơn theo giờ (hôm nay so với đường dự báo của AI), giúp thấy sớm khi lượng đơn lệch dự báo.
- **Phễu đơn hàng**: đặt → quán nhận → có shipper → giao thành công, kèm tỷ lệ rơi ở từng bước.
- **Bản đồ nhiệt mini** theo khu: màu thể hiện chỉ số đang chọn (đơn, thiếu shipper, trễ, uy tín TB).
- **Top 5** khu cần chú ý, quán lỡ đơn nhiều nhất, shipper huỷ nhiều nhất.

### Tuỳ biến dashboard
- **Kéo thả widget**, đổi kích thước, thêm hoặc bớt. Mỗi người tự lưu **bố cục riêng**, và có **mẫu theo vai trò** (Điều phối, CSKH, Kinh doanh, Kế toán, Lãnh đạo).
- **Thư viện widget**: hơn 40 chỉ số dựng sẵn (KPI, biểu đồ, bảng, bản đồ). Người dùng có thể tạo **widget từ chỉ số tự định nghĩa** (14.8).
- Mỗi widget có thể **đặt ngưỡng màu và cảnh báo** riêng.
- Chia sẻ dashboard cho đồng nghiệp hoặc cho cả nhóm vai trò.

---

## 14.3. Bản đồ trực tiếp — nhìn cụ thể từng hoạt động

- **Các lớp bật/tắt được**: quán (theo trạng thái mở/đông/tạm nghỉ, theo cấp uy tín) · shipper (rảnh/đang giao/offline gần đây, theo loại xe) · đơn (đường nối quán → khách, màu theo trạng thái) · đơn hẹn · bản đồ nhiệt nhu cầu · ô cao điểm (H3) · ranh giới khu vực · vùng thời tiết xấu.
- **Bấm vào một điểm** để mở bảng bên với thông tin chi tiết và nút hành động: gọi ẩn số, nhắn tin, gán đơn, tạm khoá, xem lịch sử.
- **Tua lại (Replay)**: kéo thanh thời gian để xem lại diễn biến của một khu trong 2 giờ qua, hoặc hành trình GPS của một đơn. Dùng khi điều tra khiếu nại hay sự cố.
- **Vẽ vùng trên bản đồ** để lọc nhanh các đơn hoặc shipper trong vùng, hoặc để tạo vùng tạm (VD: "đường ngập, tạm không giao vào vùng này 2 giờ").
- **Chế độ theo dõi một đơn/shipper**: bản đồ tự bám theo đối tượng đó.

---

## 14.4. Trung tâm sự cố & cảnh báo

| Thành phần | Mô tả |
|---|---|
| **Hàng đợi đơn có vấn đề** | Được sắp theo mức nguy cơ (AI chấm điểm, Phần 12), kèm **gợi ý hành động** ("Gán shipper Minh đang cách 600 m"). Ops bấm *Áp dụng* hoặc chọn cách khác. Mỗi mục có người nhận xử lý để không bị trùng người |
| **Cảnh báo hệ thống** | Từ giám sát kỹ thuật và nghiệp vụ (tỷ lệ xác nhận giảm, đơn tăng đột biến, cổng thanh toán lỗi) |
| **SOS shipper** | Hiển thị ưu tiên cao nhất, có âm báo, vị trí trực tiếp và số người thân |
| **Sổ sự cố (Incident)** | Mở sự cố, ghi diễn biến, thông báo tới người dùng bị ảnh hưởng, đóng sự cố và viết báo cáo sau sự cố |
| **Tự cấu hình cảnh báo** | Tạo luật dạng: *Khi [chỉ số] [điều kiện] trong [thời gian] tại [phạm vi] → báo [kênh: màn hình / Zalo / email / SMS / gọi điện] cho [nhóm]*; có giờ im lặng và cơ chế leo thang khi không ai xác nhận |

---

## 14.5. Chi tiết từng đối tượng — "Hồ sơ 360°"

### Đơn hàng
- Danh sách có **bộ lọc mạnh**: trạng thái, khu vực, quán, shipper, phương thức thanh toán, đơn hẹn, có khiếu nại, trễ > X phút, giá trị, khoảng thời gian. Bộ lọc **lưu lại được thành "Góc nhìn"** riêng.
- **Trang chi tiết đơn**:
  - **Dòng thời gian đầy đủ** lấy từ `order_events`: ai làm gì, lúc nào, qua kênh nào (app/IVR/Ops), ở vị trí nào. Có bản ghi âm IVR.
  - Bản đồ hành trình GPS có thể tua lại, ảnh lấy hàng/giao hàng, nội dung chat (có kiểm soát quyền xem).
  - Bảng tiền: giá món, phí, khuyến mãi, bút toán sổ cái, trạng thái hoàn tiền.
  - Lời mời chuyến đã gửi: những shipper nào được mời, điểm phù hợp bao nhiêu, ai từ chối, vì sao.
  - **Hành động**: liên hệ các bên, gán hoặc đổi shipper, huỷ có bồi hoàn, hoàn tiền một phần, tặng voucher xin lỗi, tạo ticket. Hành động nào cũng bắt buộc nhập lý do.

### Quán / Shipper / Khách hàng
Mỗi hồ sơ gồm: thông tin & giấy tờ eKYC; **tab "Quyền & Xếp loại"** (Phần 15); trạng thái hiện tại; **biểu đồ hiệu suất** (đơn, tỷ lệ xác nhận, đúng giờ, huỷ, ★); **điểm uy tín** chi tiết theo từng thành phần và lịch sử thay đổi; tài chính (doanh thu/thu nhập, công nợ COD, các kỳ thanh toán); ticket & khiếu nại; cờ gian lận; ghi chú nội bộ; nhật ký thao tác.

Hành động trên hồ sơ: duyệt hoặc từ chối hồ sơ, yêu cầu bổ sung, tạm khoá hoặc mở khoá (có thời hạn), chỉnh hạn mức COD, đổi chiết khấu riêng, gắn nhãn (VD "Quán chiến lược", "Cần theo dõi"), gửi thông báo riêng.

### Tác vụ hàng loạt
Chọn nhiều đối tượng rồi gửi thông báo, gắn nhãn, đổi cấu hình hoặc xuất dữ liệu. Thao tác ảnh hưởng hơn 50 đối tượng **cần người thứ hai duyệt**.

---

## 14.6. ⚙️ Trung tâm cấu hình — tuỳ biến mềm dẻo nhất

### 14.6.1. Mô hình cấu hình phân tầng
Mọi tham số có **giá trị mặc định toàn hệ thống**, và có thể được **ghi đè** ở tầng hẹp hơn. Hệ thống tự áp dụng giá trị của **tầng cụ thể nhất** khớp với tình huống:

```
Toàn hệ thống
  └─ Thành phố
       └─ Quận / Khu vực (vẽ trên bản đồ)
            └─ Ngành hàng (Đồ ăn, Tạp hoá, Nước & Gas, Nhà thuốc…)
                 └─ Nhóm đối tác (VD: "Quán Kim cương", "Shipper xe ba gác")
                      └─ Một quán / một shipper cụ thể
  + Điều kiện thời gian: khung giờ, ngày trong tuần, ngày lễ/Tết, khoảng ngày
  + Điều kiện tình huống: chế độ mưa bão, sự kiện đặc biệt
```

Ví dụ: *Thời gian quán phải trả lời đơn hẹn* có mặc định 30 phút. Ngành **Bánh kem & Hoa** được ghi đè thành 60 phút. Riêng **Quận 1 dịp Tết** đặt 45 phút. Màn hình cấu hình luôn có ô **"Giá trị đang áp dụng cho…"**: chọn một quán, một khu hoặc một thời điểm thì thấy ngay giá trị hiệu lực và tầng nào đang quyết định giá trị đó.

### 14.6.2. Danh mục cài đặt (tất cả chỉnh được trên giao diện)

| Nhóm | Ví dụ tham số chỉnh được |
|---|---|
| **Bật/tắt tính năng (feature flags)** | Đơn hẹn giờ, Yêu cầu mở, Gom đơn toà nhà, Đơn nhóm, Tip, COD, từng phương thức thanh toán, từng tính năng AI, Zalo Mini App, bảng xếp hạng… Có thể bật theo **tầng**, theo **% người dùng** (phát hành dần) hoặc theo **danh sách thử nghiệm** |
| **Khu vực hoạt động** | Vẽ, sửa, gộp khu; giờ hoạt động; bán kính giao tối đa theo ngành; tạm dừng một khu; vùng cấm giao tạm thời |
| **Ngành hàng & danh mục** | Thêm hoặc sắp xếp ngành, biểu tượng, thứ tự trên trang chủ; quy định riêng của ngành (bắt buộc PIN, hàng nặng, chỉ quán tự giao); **danh sách hàng cấm/hạn chế** |
| **Phí & giá** | Phí tối thiểu, đơn giá/km, phụ phí (đêm, mưa, hàng nặng, Tết), hệ số cao điểm và trần, phí dịch vụ, chiết khấu theo ngành/cấp uy tín/quán, phí chờ shipper, phí rút tiền nhanh, trần phí ship quán tự giao |
| **Thu nhập shipper** | Cước cơ bản, đơn giá/km, thưởng mốc, thưởng giờ cao điểm, thưởng đơn hẹn, thu nhập tối thiểu theo ca |
| **SLA xác nhận (Cổng A/B)** | Thời điểm nhắc lại, gọi IVR, chuyển Ops, huỷ tự động; số vòng tìm shipper, bán kính và thời gian từng vòng, mức tăng thưởng mỗi vòng; thời gian đếm ngược lời mời chuyến |
| **Đơn hẹn giờ** | Thời gian hẹn tối thiểu/tối đa, độ dài khung giờ, hạn trả lời của quán, các mốc xác nhận lại (T−30, T−20), thời điểm tăng thưởng và chuyển sang điều phối chủ động, số chuyến hẹn được giữ theo cấp |
| **Chính sách huỷ & hoàn tiền** | Mốc huỷ miễn phí, mức phí huỷ, số lần huỷ miễn phí/tháng, các trường hợp hoàn tiền tự động, **hạn mức hoàn tiền theo cấp nhân viên** |
| **Uy tín** | Trọng số từng thành phần, ngưỡng các cấp, chu kỳ phai điểm, hệ số `C` của sao Bayes, ngưỡng tạm ngưng, sự kiện được loại trừ, thời gian ưu tiên của Tân binh |
| **COD & rủi ro** | Hạn mức COD của shipper theo cấp, điều kiện khách được dùng COD, giới hạn giá trị đơn COD |
| **Khuyến mãi** | Chương trình, ngân sách theo ngày/khu, điều kiện, luật chống lạm dụng |
| **Thông báo** | **Trình soạn mẫu tin** cho push/SMS/ZNS/email/lời đọc IVR (có biến như `{ten_quan}`, `{eta}`), xem trước trên khung điện thoại, chọn kênh và thứ tự kênh dự phòng, giờ im lặng |
| **AI (mặc định Groq)** | **Màn hình "Kết nối AI"**: nhập/thay key, base URL, nhà cung cấp dự phòng, kiểm tra kết nối, chọn model từ danh sách (Phần 12.8); bật/tắt từng tác vụ, model cho từng tác vụ, timeout, giới hạn token, ngân sách chi phí theo ngày, nhà cung cấp dự phòng, phiên bản prompt; xem độ trễ, tỷ lệ lỗi, chi phí trực tiếp |
| **Nội dung app** | Banner, bộ sưu tập ("Cú Đêm", "Quán uy tín tuần này"), thứ tự mục trang chủ theo khu, câu hỏi thường gặp, điều khoản; **phiên bản app tối thiểu** (buộc cập nhật khi cần) |
| **Chế độ đặc biệt** | Mưa bão, Tết, sự kiện lớn, **các chế độ vận hành suy giảm** (Phần 5.11): mỗi chế độ là một **gói cài đặt dựng sẵn**, bật bằng một nút cho một khu hoặc toàn thành phố |

### 14.6.3. Trình tạo luật (Rule Builder) không cần lập trình
Dùng cho những logic hay thay đổi, viết theo dạng **KHI – NẾU – THÌ** bằng giao diện kéo thả:

```
KHI   đơn mới được tạo
NẾU   ngành = "Nước & Gas"  VÀ  khối lượng > 20 kg
THÌ   chỉ mời shipper có loại xe = "Xe ba gác"
      VÀ cộng phụ phí hàng nặng 15.000đ
```
```
KHI   tỷ lệ cung/cầu shipper của khu < 0,7 trong 10 phút
THÌ   bật hệ số cao điểm 1,2 (tối đa 45 phút)
      VÀ gửi thông báo "Khu Sunrise đang cần shipper +5.000đ/chuyến" tới shipper cách ≤ 3 km
      VÀ báo nhóm Điều phối
```
```
KHI   quán lỡ ≥ 3 đơn trong ngày
THÌ   chuyển quán sang "Tạm nghỉ" 30 phút  VÀ  nhắn chủ quán  VÀ  tạo việc cho BD khu vực
```
- **Sự kiện kích hoạt**: đơn được tạo hoặc đổi trạng thái, chỉ số vượt ngưỡng, đến thời điểm hẹn, thời tiết, đối tác đổi cấp uy tín.
- **Hành động có sẵn**: đổi tham số tạm thời, gửi thông báo, tạo ticket/việc, gắn nhãn, đổi ưu tiên, bật chế độ đặc biệt.
- Mỗi luật có **thời hạn hiệu lực**, **giới hạn tác động** (VD tối đa 1 lần/khu/giờ), và **nhật ký các lần kích hoạt**.

### 14.6.4. An toàn khi thay đổi — linh hoạt nhưng không làm hỏng hệ thống

| Cơ chế | Mô tả |
|---|---|
| **Kiểm tra giá trị** | Mỗi tham số có kiểu, **khoảng cho phép** và đơn vị (VD phí ship 0–100.000đ, hệ số cao điểm 1,0–2,0). Nhập ngoài khoảng sẽ bị chặn |
| **Nguyên tắc bất biến (không cấu hình được)** | **Không có cài đặt nào cho phép bỏ bước người thật xác nhận đơn (Cổng A/B)**. Ngoài ra không thể tắt nhật ký thao tác, không thể vượt trần phí ship theo quy định, và không thể cho AI quyết định hoàn tiền hay xác nhận đơn |
| **Xem trước tác động** | Trước khi lưu, hệ thống **mô phỏng trên dữ liệu 7 ngày qua**. VD: *"Tăng đơn giá/km lên 4.500đ: phí ship TB +6%, thu nhập shipper TB +5%, ước tính đơn giảm 1–2% tại Quận 7"* |
| **Bản nháp → Duyệt → Áp dụng** | Thay đổi nhạy cảm (phí, chiết khấu, SLA, uy tín, AI) đi theo luồng **người đề xuất ≠ người duyệt** (nguyên tắc 4 mắt). Có thể **hẹn giờ áp dụng** (VD 0:00 thứ Hai) |
| **Phát hành dần** | Áp dụng cho 1 khu hoặc 10% người dùng trước, theo dõi chỉ số, rồi mới mở rộng. Có **tự động hoàn tác** nếu chỉ số chính xấu đi vượt ngưỡng |
| **Phiên bản & hoàn tác** | Mỗi lần lưu tạo một **phiên bản**, có xem khác biệt giữa hai phiên bản (diff) và **hoàn tác bằng 1 nút** về phiên bản bất kỳ |
| **Nhật ký** | Ghi ai đổi, đổi gì, từ giá trị nào sang giá trị nào, lý do, ai duyệt, thời điểm hiệu lực |
| **Môi trường thử** | Có thể sao chép cấu hình sang môi trường staging để thử trước |
| **Hiệu lực tức thì** | Cấu hình được phát qua bộ nhớ đệm (cache) tới các dịch vụ và có hiệu lực trong ≤ 30 giây, **không cần khởi động lại hay phát hành app**. App nhận cấu hình mới qua API cấu hình từ xa |

---

## 14.7. Các phân hệ nghiệp vụ

| Phân hệ | Chức năng chính |
|---|---|
| **🏪 Duyệt đối tác** | Hàng đợi hồ sơ quán/shipper với SLA ≤ 24h; xem ảnh CCCD (che bớt số), kết quả eKYC, giấy phép; danh sách kiểm tra từng bước; duyệt, từ chối hoặc yêu cầu bổ sung bằng mẫu lý do |
| **🎧 CSKH & Ticket** | Hộp thư hợp nhất (chat app, hotline, email, Zalo); ticket tự gắn đơn liên quan và tóm tắt bằng AI; mẫu trả lời nhanh; SLA và leo thang; hoàn tiền theo hạn mức của từng cấp; chấm điểm hài lòng sau xử lý |
| **💰 Tài chính** | Đối soát cổng thanh toán (khớp/lệch); kỳ thanh toán quán (T+1) và lệnh chi hàng loạt; rút tiền của shipper; công nợ COD (nợ quá hạn, nhắc, khoá); thuế khấu trừ; sổ cái (tra theo đơn, theo tài khoản); báo cáo lãi/lỗ theo khu |
| **🏷️ Khuyến mãi** | Tạo chương trình, theo dõi ngân sách đã dùng theo thời gian thực, hiệu quả (đơn tăng thêm, chi phí/đơn), phát hiện lạm dụng, dừng khẩn |
| **⭐ Uy tín** | Phân bố điểm theo khu, đối tác sắp xuống cấp, hàng đợi khiếu nại điểm (xem bằng chứng, chấp nhận/từ chối), bảng xếp hạng, cấu hình trọng số (qua 14.6) |
| **🤖 AI (mặc định Groq)** | Kết nối AI (key, base URL, model — Phần 12.8); độ trễ, tỷ lệ lỗi, số lần chuyển dự phòng, chi phí theo tác vụ/ngày; xem mẫu hội thoại đã ẩn danh; kết quả bộ đánh giá tiếng Việt; quản lý phiên bản prompt |
| **🛡️ Gian lận & An toàn** | Cờ gian lận do mô hình phát hiện; **đồ thị liên kết** tài khoản – thiết bị – địa chỉ – thanh toán; SOS; báo cáo hành vi; danh sách chặn |

---

## 14.8. 📈 Báo cáo & phân tích tự phục vụ

- **Báo cáo dựng sẵn**: kinh doanh ngày/tuần/tháng, theo khu, theo ngành; vận hành (xác nhận, điều phối, giao hàng); đối tác (quán mới, tỷ lệ rời bỏ, thu nhập shipper/giờ); khách (cohort quay lại, tần suất); tài chính; khuyến mãi; AI.
- **Trình tạo báo cáo kéo thả**: chọn **chỉ số** (số đơn, GMV, tỷ lệ huỷ…), **chiều phân tích** (khu, ngành, giờ, cấp uy tín, chế độ giao, kênh đặt), **bộ lọc** và **kiểu biểu đồ**, rồi lưu thành báo cáo hoặc widget dashboard.
- **Chỉ số tự định nghĩa**: tạo chỉ số mới từ các chỉ số gốc (VD *"Tỷ lệ đơn hẹn được giữ trước T−60"*). Định nghĩa được quản lý tập trung để mọi người dùng chung một cách tính.
- **So sánh**: giữa hai khoảng thời gian, hai khu, hoặc trước/sau một lần đổi cấu hình (liên kết với nhật ký cấu hình). Nhờ vậy biết được mỗi thay đổi tác động ra sao.
- **Xem dữ liệu chi tiết**: từ biểu đồ bấm xuống tới danh sách đơn cụ thể.
- **Lịch gửi báo cáo** tự động qua email/Zalo (VD báo cáo 7:00 sáng cho lãnh đạo); xuất Excel/CSV/PDF.
- **Hỏi bằng tiếng Việt (AI)** *(P2)*: *"Tuần này khu nào có tỷ lệ huỷ do quán cao nhất?"*. Groq chuyển câu hỏi thành truy vấn **chỉ đọc** trên kho dữ liệu, kết quả hiển thị kèm truy vấn để người hỏi kiểm chứng.
- Dữ liệu báo cáo lấy từ **kho dữ liệu phân tích** (ClickHouse/BigQuery) tách khỏi CSDL vận hành, để báo cáo nặng không làm chậm hệ thống đặt hàng.

---

> Phân quyền chức năng, đánh giá, xếp loại và ưu tiên **của người dùng** (khách, quán, shipper) được mô tả chi tiết ở [Phần 15](15-phan-quyen-xep-loai-uu-tien.md); mục này nói về phân quyền **nhân viên nội bộ**.

## 14.9. 🔐 Phân quyền linh hoạt & Nhật ký

- **Vai trò dựng sẵn**: Super Admin, Quản lý vận hành, Điều phối viên, CSKH cấp 1/2, Kế toán, Kinh doanh/BD, Marketing, Kiểm duyệt, Quản lý khu vực, Chỉ xem (lãnh đạo/nhà đầu tư).
- **Tạo vai trò tuỳ chỉnh**: tick quyền theo **ma trận phân hệ × hành động** (xem / tạo / sửa / duyệt / xuất / xoá), cộng **phạm vi dữ liệu** (chỉ thành phố X, chỉ quận Y, chỉ ngành Z).
- **Quyền với dữ liệu nhạy cảm**: SĐT, địa chỉ, CCCD và tài khoản ngân hàng **mặc định được che**. Muốn xem đầy đủ phải bấm "Hiện" và nhập lý do; hành động này được ghi nhật ký.
- **Hạn mức theo vai trò**: hoàn tiền tối đa, mức voucher tối đa, quy mô tác vụ hàng loạt.
- **Quyền tạm thời**: cấp quyền có thời hạn (VD hỗ trợ dịp Tết 2 tuần).
- **Bảo mật đăng nhập**: bắt buộc xác thực 2 lớp; có thể giới hạn IP/thiết bị; tự đăng xuất khi không hoạt động; xem các phiên đăng nhập.
- **Nhật ký thao tác bất biến**: tra theo người, đối tượng, loại hành động, thời gian. Có cảnh báo hành vi bất thường của nhân viên nội bộ (VD xem quá nhiều hồ sơ khách trong thời gian ngắn).

---

## 14.10. Bổ sung kỹ thuật

```sql
-- Định nghĩa tham số (danh mục cài đặt)
CREATE TABLE config_definitions (
  key          VARCHAR(100) PRIMARY KEY,     -- 'sla.merchant_accept.ivr_after_sec'
  module       VARCHAR(40)  NOT NULL,
  value_type   VARCHAR(20)  NOT NULL,        -- INT, MONEY, PERCENT, BOOL, DURATION, ENUM, JSON
  default_value JSONB       NOT NULL,
  min_value    JSONB, max_value JSONB,
  allowed_scopes TEXT[]     NOT NULL,        -- {GLOBAL,CITY,ZONE,CATEGORY,SEGMENT,ENTITY}
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  is_invariant BOOLEAN      NOT NULL DEFAULT false,  -- true = không cho sửa (VD bắt buộc xác nhận người thật)
  description  TEXT
);

-- Giá trị ghi đè theo tầng, có phiên bản
CREATE TABLE config_values (
  id           BIGSERIAL PRIMARY KEY,
  key          VARCHAR(100) REFERENCES config_definitions(key),
  scope_type   VARCHAR(20) NOT NULL,          -- GLOBAL, CITY, ZONE, CATEGORY, SEGMENT, ENTITY
  scope_id     VARCHAR(60),
  time_rule    JSONB,                         -- {"days":[6,7],"from":"18:00","to":"22:00","holiday":"TET"}
  value        JSONB NOT NULL,
  version      INT NOT NULL,
  status       VARCHAR(20) NOT NULL,          -- DRAFT, PENDING_APPROVAL, SCHEDULED, ACTIVE, ROLLED_BACK, EXPIRED
  rollout      JSONB,                         -- {"percent":10} hoặc {"zones":[...]}
  effective_from TIMESTAMPTZ, effective_to TIMESTAMPTZ,
  created_by   BIGINT, approved_by BIGINT,
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Luật tự động (Rule Builder)
CREATE TABLE automation_rules (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  trigger     JSONB NOT NULL,                 -- sự kiện hoặc chỉ số + ngưỡng
  conditions  JSONB NOT NULL,
  actions     JSONB NOT NULL,
  scope       JSONB,
  rate_limit  JSONB,                          -- {"per":"zone","max":1,"window":"1h"}
  status      VARCHAR(20) NOT NULL,           -- DRAFT, ACTIVE, PAUSED
  version     INT NOT NULL,
  valid_until TIMESTAMPTZ,
  created_by  BIGINT, approved_by BIGINT
);
CREATE TABLE automation_rule_runs (
  id BIGSERIAL PRIMARY KEY, rule_id BIGINT REFERENCES automation_rules(id),
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(), context JSONB, result JSONB
);

-- Dashboard, báo cáo, cảnh báo do người dùng tạo
CREATE TABLE admin_dashboards (id BIGSERIAL PRIMARY KEY, owner_id BIGINT, role_template VARCHAR(40), layout JSONB NOT NULL, shared_with JSONB);
CREATE TABLE metric_definitions (key VARCHAR(80) PRIMARY KEY, name VARCHAR(160), formula JSONB NOT NULL, owner_id BIGINT);
CREATE TABLE alert_rules (id BIGSERIAL PRIMARY KEY, metric_key VARCHAR(80), condition JSONB, scope JSONB, channels JSONB, escalation JSONB, quiet_hours JSONB, status VARCHAR(20));

-- Vai trò tuỳ chỉnh
CREATE TABLE admin_roles (id BIGSERIAL PRIMARY KEY, name VARCHAR(80) UNIQUE, permissions JSONB NOT NULL, data_scope JSONB, limits JSONB);
```

- **Config Service**: tìm giá trị theo thứ tự tầng cụ thể nhất (*thực thể → nhóm → ngành → khu → thành phố → toàn hệ thống*, có áp điều kiện thời gian). Kết quả được cache trong Redis/bộ nhớ, và khi có thay đổi thì phát sự kiện `config.changed` để các dịch vụ làm mới trong ≤ 30 giây. Nếu Config Service lỗi, các dịch vụ **dùng bản cache cuối cùng**, sau nữa là giá trị mặc định đóng gói sẵn. Hệ thống không dừng vì lỗi cấu hình.
- **Rule Engine**: tiêu thụ sự kiện từ event bus, đánh giá luật (dùng chuẩn biểu thức an toàn như JSONLogic, không thực thi mã tuỳ ý) rồi gọi các hành động qua API nội bộ. Luật cũng bị ràng buộc bởi **nguyên tắc bất biến** và **khoảng giá trị cho phép**.
- **Simulation Service**: chạy lại dữ liệu lịch sử với cấu hình đề xuất để ước tính tác động (14.6.4).
- **Admin Console**: Next.js + thư viện bảng dữ liệu lớn (ảo hoá hàng, xử lý được hàng chục nghìn dòng), bản đồ WebGL (deck.gl/MapLibre) để hiển thị hàng nghìn shipper mượt mà, biểu đồ (ECharts), kéo thả widget (react-grid-layout).

## 14.11. Lộ trình cho Admin Console
- **MVP:** Dashboard tổng quan cố định; bản đồ trực tiếp; hàng đợi đơn có vấn đề; hồ sơ 360° của đơn/quán/shipper/khách; duyệt đối tác; CSKH & hoàn tiền; tài chính cơ bản. **Trung tâm cấu hình phân tầng** (toàn hệ thống / thành phố / khu / ngành), có kiểm tra giá trị, phiên bản, hoàn tác và nhật ký. Feature flags. Phân quyền theo vai trò dựng sẵn, xác thực 2 lớp.
- **1.0:** Dashboard kéo thả & mẫu theo vai trò; cảnh báo tự cấu hình; luồng duyệt 4 mắt và hẹn giờ áp dụng; phát hành dần theo %; trình soạn mẫu thông báo; báo cáo dựng sẵn & lịch gửi; vai trò tuỳ chỉnh & phạm vi dữ liệu; tua lại bản đồ.
- **Tăng trưởng:** Rule Builder; mô phỏng tác động; tự động hoàn tác; trình tạo báo cáo kéo thả & chỉ số tự định nghĩa; đồ thị gian lận; hỏi đáp dữ liệu bằng tiếng Việt (Groq); chế độ màn hình phòng điều hành.
