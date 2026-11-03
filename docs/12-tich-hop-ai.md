# Phần 12 — Tích hợp AI (mặc định Groq, Admin cấu hình) để gợi ý, tư vấn & vận hành thông minh

> **Nhà cung cấp AI mặc định: Groq.** **Admin tự nhập** khoá API (key), đường dẫn kết nối (base URL) và model trên Admin Console (12.8); không gắn cứng trong code. Groq được chọn làm mặc định vì **tốc độ suy luận rất nhanh** (độ trễ thấp, sinh chữ nhanh), phù hợp các tác vụ cần phản hồi tức thì như trợ lý đặt hàng, gợi ý trong lúc gõ, bóc tách yêu cầu, bot CSKH.
>
> **Phạm vi hiện tại: chỉ AI ngôn ngữ (chữ) và giọng nói.** Mọi khả năng **phân tích hình ảnh bằng AI** (đọc menu từ ảnh, nhận diện/kiểm duyệt ảnh…) **tạm gác lại** — xem 12.9.
>
> **Nguyên tắc số 1: AI hỗ trợ, NGƯỜI THẬT quyết định.** AI **không bao giờ** xác nhận đơn thay quán, nhận chuyến thay shipper, hay tự hoàn tiền. AI gợi ý, dự báo, soạn sẵn, cảnh báo — con người bấm xác nhận. Mọi tính năng AI đều có **phương án chạy khi AI lỗi/chậm**, để ứng dụng **không bao giờ phụ thuộc vào AI để vận hành**.

---

## 12.1. Phân vai công nghệ AI

Không phải bài toán nào cũng nên giao cho mô hình ngôn ngữ lớn (LLM). Để **nhanh, rẻ và ổn định**, hệ thống chia ba nhóm:

| Nhóm | Dùng cho | Công nghệ |
|---|---|---|
| **LLM qua Groq** | Hiểu ngôn ngữ tự nhiên tiếng Việt, hội thoại, trích xuất có cấu trúc, tóm tắt, soạn nội dung | Groq API (tương thích chuẩn OpenAI), gọi công cụ (tool calling), đầu ra JSON |
| **Giọng nói → chữ qua Groq** | Đặt hàng bằng giọng nói, shipper/quán ra lệnh rảnh tay | Mô hình nhận dạng giọng nói họ Whisper trên Groq (hỗ trợ đa ngôn ngữ gồm tiếng Việt) |
| **Mô hình tự huấn luyện (không dùng LLM)** | ETA, điều phối, dự báo nhu cầu, gian lận, xếp hạng gợi ý | LightGBM/XGBoost, mô hình gợi ý; phục vụ nội bộ < 50 ms |
| **Dịch vụ chuyên biệt khác** | Chuyển chữ → giọng nói tiếng Việt, embedding tìm kiếm ngữ nghĩa | TTS tiếng Việt (FPT.AI/Viettel AI/Zalo AI…); mô hình embedding đa ngôn ngữ tự host (VD bge-m3, multilingual-e5) |

> **eKYC** (đọc CCCD, so khớp khuôn mặt khi đối tác đăng ký) là **dịch vụ xác minh của nhà cung cấp chuyên ngành**, không thuộc phần AI của hệ thống và không bị ảnh hưởng bởi việc tạm gác phân tích hình ảnh — vẫn cần cho bước duyệt đối tác.

> Lý do không dồn hết lên Groq: các bài toán số (ETA, dispatch) cần **chính xác, rẻ, chạy mỗi giây** — mô hình ML thường tốt hơn LLM. Groq tập trung ở nơi phát huy thế mạnh: **ngôn ngữ + tốc độ**.

## 12.2. Danh sách tính năng AI (đã rà soát, gộp và loại bớt)

| # | Tính năng | Người dùng | Công nghệ | Ưu tiên |
|---|---|---|---|---|
| 1 | Tìm kiếm hiểu ý: không dấu, sai chính tả, đồng nghĩa ("trà sữa" ≈ "milk tea") | Khách | Tìm kiếm lai: từ khoá + embedding | P1 |
| 2 | Gợi ý món thay thế khi hết hàng, món kèm/combo | Khách, Quán | Embedding món + quy tắc giá | P1 |
| 3 | **Trợ lý "Hỏi Quanh"** (chat/giọng nói) đề xuất quán & món, điền sẵn giỏ hàng | Khách | **Groq LLM** + công cụ nội bộ | P1 |
| 4 | Bóc tách **"Yêu cầu mở"** / ghi chú tự do thành danh sách món có cấu trúc; nhận ra ghi chú có dấu hiệu **dị ứng** (VD *"mình bị dị ứng tôm"*) để gợi ý khách gắn chip ⚠ | Khách, Quán | **Groq LLM** (JSON) | P1 |
| 5 | Đặt hàng & ra lệnh bằng giọng nói | Khách, Quán, Shipper | **Groq Whisper** + Groq LLM hiểu ý | P1 |
| 6 | ~~Tạo menu từ ảnh~~ → **tạm gác** (12.9). Thay bằng: quán **dán/gõ danh sách món dạng chữ** (VD *"Cơm sườn 35k, Cơm gà 40k…"*) → AI chuẩn hoá thành menu nháp để quán duyệt | Quán | **LLM (mặc định Groq)** | P1 |
| 7 | Viết mô tả món hấp dẫn, gợi ý tên combo | Quán | **Groq LLM** | P1 |
| 8 | Tóm tắt đánh giá, gợi ý câu trả lời khách | Quán | **Groq LLM** | P1 |
| 9 | **Bot CSKH cấp 1**: tra cứu đơn, giải thích phí, hướng dẫn; tóm tắt ca cho nhân viên | Khách, CSKH | **Groq LLM** + công cụ chỉ đọc | P1 |
| 10 | Kiểm duyệt nội dung chat/đánh giá (lăng mạ, lừa đảo, lộ SĐT) | Ops | **Groq LLM** phân loại + bộ lọc từ khoá | P1 |
| 11 | Giải thích điểm uy tín & gợi ý cải thiện bằng lời dễ hiểu | Quán, Shipper | **Groq LLM** trên số liệu có sẵn | P1 |
| 12 | Trợ lý kinh doanh cho quán (hỏi đáp doanh thu, nhắc chuẩn bị theo dự báo) | Quán | **Groq LLM** + số liệu tính sẵn | P2 |
| 13 | Dự báo ETA (chuẩn bị + tìm shipper + di chuyển) | Tất cả | ML tự huấn luyện | P0 quy tắc → P1 ML |
| 14 | Xác suất được nhận cho khung giờ hẹn | Khách | ML phân loại | P1 |
| 15 | Dự báo nhu cầu theo khu vực → bản đồ nhiệt & gợi ý vị trí cho shipper | Shipper, Ops | ML chuỗi thời gian | P1 |
| 16 | Cảnh báo sớm đơn có nguy cơ trễ/kẹt + đề xuất hành động | Ops | ML phân loại rủi ro | P1 |
| 17 | Phát hiện gian lận (đơn ảo, giả GPS, đánh giá ảo) | Ops | Phát hiện bất thường + đồ thị liên kết | P1 |
| 18 | Tinh chỉnh điều phối & ghép đơn | Hệ thống | Tối ưu hoá + ML | P2 |

**Đã loại bỏ / gộp sau rà soát:**
- ~~Làm đẹp ảnh món bằng AI~~ → thay bằng **bộ lọc ảnh đơn giản + hướng dẫn chụp** (tránh ảnh "ảo" khác món thật, gây khiếu nại).
- ~~AI gợi ý giá cho quán~~ → chỉ hiển thị **mặt bằng giá khu vực dạng số liệu**, không để AI "khuyên" giá (rủi ro bị coi là can thiệp giá).
- ~~AI tự hoàn tiền~~ → hoàn tiền tự động chỉ theo **quy tắc cố định** (quán huỷ, không tìm được shipper…), không do LLM quyết định.
- ~~Tư vấn thuốc~~ → bot chỉ giúp **tìm nhà thuốc đang mở**; mọi câu hỏi về điều trị/liều dùng trả lời: *"Bạn vui lòng hỏi dược sĩ/bác sĩ"*.
- Gợi ý riêng cho shipper gộp vào #15; giải thích uy tín gộp thành #11.

## 12.3. Chi tiết các luồng dùng Groq

### (3) Trợ lý "Hỏi Quanh"
1. Khách gõ/nói: *"Tối nay 4 người, muốn ăn gì nóng, dưới 300k, giao trước 7 giờ"*.
2. Backend gửi tới Groq kèm **danh sách công cụ nội bộ** (tool calling):
   - `search_stores(lat, lng, category, open_at, max_eta)`
   - `get_menu(store_id)`
   - `get_slots(store_id, date)`
   - `quote_cart(store_id, items)`
   - `build_cart_draft(store_id, items)` ← chỉ tạo **giỏ nháp**
3. Groq quyết định gọi công cụ nào; backend thực thi, trả kết quả; Groq soạn câu trả lời ngắn + **2–3 thẻ đề xuất** (ảnh món, tổng tiền, ETA, cấp uy tín quán — **lấy từ dữ liệu hệ thống, không từ chữ AI sinh**).
4. Khách chạm một thẻ → giỏ nháp mở ra → **khách tự bấm Đặt hàng** → quán xác nhận như mọi đơn.
- Trả lời dạng **streaming** (chữ hiện dần) — với tốc độ của Groq, khách thấy phản hồi gần như ngay lập tức.
- Giới hạn: tối đa 4 vòng gọi công cụ/câu hỏi, 10 câu hỏi/phiên/phút/người dùng.

### (4) Bóc tách yêu cầu tự do → JSON
Đầu vào: *"2 bình Lavie 20L với 1 bao đá, 5h chiều nay giao lên tầng 3"*
Đầu ra bắt buộc theo **lược đồ JSON** (kiểm tra bằng JSON Schema ở backend; sai lược đồ → hỏi lại khách, không đoán):
```json
{
  "items": [
    {"name": "Nước Lavie bình 20L", "quantity": 2, "category": "WATER"},
    {"name": "Đá viên bao", "quantity": 1, "category": "ICE"}
  ],
  "schedule": {"type": "DELIVERY", "local_time": "17:00", "date": "today"},
  "dropoff_note": "Giao lên tầng 3",
  "confidence": 0.93
}
```
`confidence < 0.8` hoặc thiếu thông tin → hiện màn hình để khách **xác nhận/sửa** trước khi gửi cho quán.

### (5) Giọng nói
- App ghi âm → gửi **Groq Whisper** (nhận dạng tiếng Việt) → văn bản → luồng (3)/(4).
- Shipper đang lái xe: chỉ hỗ trợ **lệnh ngắn** ("nhận chuyến", "gọi khách", "đã tới") — nhận dạng xong **đọc lại để xác nhận** trước khi thực hiện; lệnh "đã giao" vẫn bắt buộc ảnh/PIN.
- Chữ → giọng nói (đọc đơn mới cho quán, đọc thông báo cho shipper) dùng **TTS tiếng Việt** của nhà cung cấp trong nước (giọng tự nhiên, vùng miền), có bản thu âm sẵn cho câu cố định để không phụ thuộc mạng.

### (6) Menu từ danh sách chữ
Quán dán hoặc gõ (hoặc đọc bằng giọng nói) danh sách món → AI chuẩn hoá thành `[{section, name, price, options}]` → **quán xem lại từng dòng và bấm Đăng**. Không bao giờ tự đăng. *(Đọc menu từ ảnh chụp: tạm gác, xem 12.9.)*

### (9) Bot CSKH
- Công cụ **chỉ đọc**: `get_order_status`, `get_fee_breakdown`, `get_policy`.
- Hành động có ảnh hưởng (hoàn tiền, huỷ đơn đã làm, đền bù) → **tạo ticket kèm tóm tắt** cho nhân viên; nếu thuộc trường hợp hoàn tiền tự động theo quy tắc thì quy tắc xử lý, bot chỉ thông báo.
- Luôn có nút **"Gặp nhân viên"**; phát hiện khách bức xúc (từ ngữ, lặp lại) → chuyển người ngay.

## 12.4. Kiến trúc tích hợp Groq

```mermaid
flowchart LR
    APP[Apps] --> GW[API Gateway]
    GW --> AIGW[AI Gateway nội bộ]
    AIGW -->|chính| GROQ[Groq API<br/>LLM · Whisper]
    AIGW -->|dự phòng| FB[Nhà cung cấp LLM dự phòng]
    AIGW --> CACHE[(Redis cache<br/>câu trả lời / embedding)]
    AIGW --> MASK[Lọc dữ liệu cá nhân<br/>trước khi gửi ra ngoài]
    AIGW --> TOOLS[Công cụ nội bộ<br/>chỉ đọc / tạo nháp]
    AIGW --> LOG[(Nhật ký AI<br/>prompt, độ trễ, chi phí, kết quả)]
    GW --> ML[ML Serving nội bộ<br/>ETA · rủi ro · gian lận · gợi ý]
```

**AI Gateway** (một module trong backend) là nơi duy nhất gọi nhà cung cấp AI:
- **API tương thích OpenAI**: mặc định base URL của Groq `https://api.groq.com/openai/v1`, dùng SDK OpenAI-compatible → **đổi nhà cung cấp chỉ bằng cấu hình Admin nhập**, không sửa code.
- **Key, base URL, model do Admin nhập trên Admin Console (12.8)**, lưu mã hoá trong CSDL, không nằm trong code hay file cấu hình triển khai. Danh mục model của nhà cung cấp thay đổi và có lịch ngừng hỗ trợ, nên Admin đổi model bất cứ lúc nào. Ví dụ cấu hình theo tác vụ (hiển thị dạng form trên Admin Console):
  ```yaml
  ai:
    provider: groq            # mặc định; Admin có thể thêm nhà cung cấp khác
    tasks:
      assistant_chat:   { model: "<model lớn, hỗ trợ tool calling>", max_tokens: 600, timeout_ms: 4000, stream: true }
      extract_json:     { model: "<model nhỏ, nhanh>", response_format: json, timeout_ms: 2000 }
      moderation:       { model: "<model nhỏ, nhanh>", timeout_ms: 1500 }
      summarize_review: { model: "<model trung bình>", timeout_ms: 5000, batch: true }
      speech_to_text:   { model: "<whisper-large-v3 hoặc bản turbo>", language: "vi" }
    fallback_provider: "<nhà cung cấp dự phòng>"
  ```
  → **Trước khi triển khai**: kiểm tra danh sách model hiện hành, giới hạn tốc độ và chính sách dữ liệu trên console Groq; chọn model bằng **bộ đánh giá tiếng Việt** ở 12.6 (chất lượng tiếng Việt giữa các model chênh lệch đáng kể).
- **Giới hạn tốc độ (rate limit)**: Groq giới hạn theo số yêu cầu và số token mỗi phút/ngày theo gói tài khoản. Gateway có **hàng đợi + token bucket** riêng, khi gặp lỗi `429` → thử lại có backoff ngắn (theo header thời gian chờ) → quá 1 lần thì **chuyển nhà cung cấp dự phòng** hoặc **chế độ không-AI**.
- **Timeout cứng** theo tác vụ (1,5–5 giây) + **circuit breaker**: lỗi liên tục → tạm ngắt Groq 60 giây, tự thử lại.
- **Cache**: câu hỏi phổ biến, kết quả chuẩn hoá menu, mô tả món → giảm chi phí & độ trễ.
- **Nhật ký & đo lường**: độ trễ token đầu tiên, tổng thời gian, số token, chi phí/tác vụ, tỷ lệ lỗi, tỷ lệ fallback.

## 12.5. Khi AI lỗi — ứng dụng vẫn chạy bình thường

| Tính năng | Khi Groq lỗi/chậm/hết hạn mức |
|---|---|
| Trợ lý "Hỏi Quanh" | Ẩn ô chat, hiện **tìm kiếm thường + bộ lọc**; thông báo nhẹ "Trợ lý đang bận" |
| Bóc tách yêu cầu mở | Hiện **form chọn món theo danh mục** |
| Giọng nói | Ẩn nút micro, dùng bàn phím |
| Menu từ danh sách chữ | Nhập tay từng món |
| Bot CSKH | Chuyển thẳng nhân viên / FAQ tĩnh |
| Kiểm duyệt | Bộ lọc từ khoá + hậu kiểm thủ công |
| Mô tả món, tóm tắt đánh giá | Xử lý lại sau (hàng đợi), không chặn quán |

**Không có luồng cốt lõi nào (đặt hàng, xác nhận, điều phối, thanh toán, giao hàng) phụ thuộc vào Groq.**

## 12.6. Chất lượng, an toàn, chi phí

| Vấn đề | Biện pháp |
|---|---|
| Chất lượng tiếng Việt | Bộ đánh giá ≥ 300 câu thật (ẩn danh): tiếng lóng, không dấu, phương ngữ Bắc–Trung–Nam, teencode; đo tỷ lệ hiểu đúng & tỷ lệ chuyển thành giỏ hàng; chạy lại mỗi lần đổi model |
| AI bịa thông tin | Chỉ trả lời từ dữ liệu công cụ; giá/món/thời gian **luôn hiển thị từ hệ thống**; prompt hệ thống cấm suy đoán; kiểm tra JSON Schema |
| Dữ liệu cá nhân | **Che SĐT, địa chỉ chi tiết, tên** trước khi gửi Groq (thay bằng mã); chỉ gửi dữ liệu tối thiểu; xin đồng ý của người dùng cho tính năng AI; ghi rõ trong chính sách bảo mật việc **chuyển dữ liệu ra nước ngoài** và thực hiện thủ tục theo quy định bảo vệ dữ liệu cá nhân; kiểm tra điều khoản lưu trữ dữ liệu của Groq và chọn chế độ không lưu dữ liệu nếu có |
| Tấn công prompt (prompt injection) qua tên món/ghi chú | Dữ liệu người dùng đưa vào prompt được đánh dấu là dữ liệu; công cụ chỉ đọc/tạo nháp nên không thể gây hành động nguy hiểm |
| Chi phí | Model nhỏ cho tác vụ đơn giản, cache, giới hạn theo người dùng, theo dõi **chi phí AI/đơn** (mục tiêu < 1% giá trị đóng góp mỗi đơn); ngân sách tháng có cảnh báo |
| Minh bạch | Nhãn "✨ Gợi ý bởi AI" trên nội dung AI tạo; quán duyệt mọi nội dung AI soạn trước khi đăng |
| Công bằng (dispatch, uy tín) | Không dùng LLM cho quyết định chấm điểm/chia đơn; mô hình ML được giám sát phân phối thu nhập giữa khu vực/nhóm |

## 12.7. Lộ trình AI
- **MVP (không phụ thuộc AI):** ETA theo quy tắc + trung bình lịch sử; tìm kiếm không dấu cơ bản (PostgreSQL `unaccent` + `pg_trgm`); eKYC qua nhà cung cấp. Dựng sẵn **AI Gateway** và tài khoản Groq để thử nghiệm nội bộ.
- **1.0:** Menu từ danh sách chữ, mô tả món, bóc tách yêu cầu mở, tóm tắt đánh giá, kiểm duyệt nội dung, bot CSKH cấp 1, giọng nói, gợi ý món thay thế/kèm, ETA bằng ML, cảnh báo đơn nguy cơ.
- **Tăng trưởng:** Trợ lý "Hỏi Quanh" mở cho toàn bộ khách (sau A/B test), dự báo nhu cầu & bản đồ nhiệt, phát hiện gian lận đồ thị, trợ lý kinh doanh cho quán, tinh chỉnh điều phối.


## 12.8. Admin cấu hình kết nối AI (key, model, đường dẫn)

Toàn bộ thông tin kết nối AI do **Admin nhập và quản lý trên Admin Console** (mục *🤖 AI* — Phần 14). Hệ thống **cài sẵn mặc định là Groq**: khi Admin dán key Groq vào là chạy được ngay, không cần nhập gì thêm.

### Màn hình "Kết nối AI"
```
┌─ 🤖 Kết nối AI ───────────────────────────────────────────────────┐
│ Nhà cung cấp chính: [ Groq (mặc định) ▾ ]          Trạng thái: 🟢 │
│ Đường dẫn kết nối (base URL): https://api.groq.com/openai/v1      │
│ Khoá API (key):  gsk_••••••••••••••••7f3a   [Thay key] [Xoá]       │
│ [ Kiểm tra kết nối ]  → ✔ Kết nối OK · 312 ms · 14 model khả dụng │
│                                                                   │
│ Model theo tác vụ                     (chọn từ danh sách lấy về)  │
│  Trợ lý "Hỏi Quanh"      [ <model> ▾ ]  timeout 4s  tối đa 600 token│
│  Bóc tách JSON           [ <model> ▾ ]  timeout 2s                │
│  Kiểm duyệt văn bản      [ <model> ▾ ]  timeout 1,5s              │
│  Tóm tắt đánh giá        [ <model> ▾ ]  timeout 5s                │
│  Giọng nói → chữ         [ <model> ▾ ]  ngôn ngữ: vi              │
│                                                                   │
│ Nhà cung cấp dự phòng: [ + Thêm ]  (bất kỳ API tương thích OpenAI) │
│ Ngân sách AI/ngày: [ 500.000đ ]   Cảnh báo ở: [ 80% ]              │
│                     [ Lưu nháp ]  [ Gửi duyệt ]  [ Lịch sử ▸ ]     │
└───────────────────────────────────────────────────────────────────┘
```

### Quy tắc
| Mục | Quy tắc |
|---|---|
| **Mặc định** | Nhà cung cấp `groq`, base URL `https://api.groq.com/openai/v1`. Model mặc định cho từng tác vụ do đội kỹ thuật chọn qua bộ đánh giá tiếng Việt (12.6) và nạp sẵn; Admin đổi được |
| **Thêm nhà cung cấp khác** | Bất kỳ dịch vụ có **API tương thích OpenAI**: Admin nhập tên, base URL, key; dùng làm dự phòng hoặc làm chính cho từng tác vụ |
| **Danh sách model** | Bấm *Kiểm tra kết nối* → hệ thống gọi API liệt kê model của nhà cung cấp; Admin chọn từ danh sách (tránh gõ sai). Có ô nhập tay nếu nhà cung cấp không hỗ trợ liệt kê |
| **Kiểm tra trước khi lưu** | Bắt buộc *Kiểm tra kết nối* thành công và chạy **5 câu thử tiếng Việt** cho model mới trước khi áp dụng; hiển thị độ trễ & kết quả để Admin so sánh |
| **Bảo mật key** | Key **mã hoá bằng KMS** khi lưu; sau khi lưu **chỉ hiển thị 4 ký tự cuối**, không ai xem lại được toàn bộ (kể cả Super Admin); không ghi vào log, không trả về API, không gửi xuống app; chỉ AI Gateway giải mã khi gọi |
| **Thay key (xoay vòng)** | Nhập key mới → kiểm tra → áp dụng; key cũ giữ 10 phút để các yêu cầu đang chạy hoàn tất rồi tự xoá. Nhắc thay key định kỳ (VD 90 ngày) |
| **Quyền** | Chỉ **Super Admin** hoặc vai trò được cấp quyền *"Quản lý kết nối AI"* được xem và sửa; thay key, đổi base URL, đổi model của tác vụ đang chạy cần **người thứ hai duyệt** (4 mắt — Phần 14.6.4) |
| **Áp dụng & hoàn tác** | Thay đổi có hiệu lực ≤ 30 giây, không cần khởi động lại; mỗi lần lưu là một phiên bản, hoàn tác 1 nút (trừ key cũ đã xoá) |
| **Nhật ký** | Ghi ai đổi gì, lúc nào (không ghi nội dung key) |
| **Khi chưa có key / key sai / hết hạn mức** | Tính năng AI tự ẩn, app chạy chế độ không-AI (12.5); Admin Console báo đỏ ở thẻ *Trạng thái hệ thống* |
| **Nguyên tắc bất biến** | Cấu hình AI **không thể** cho AI xác nhận đơn, nhận chuyến hay hoàn tiền; công cụ AI luôn chỉ đọc / tạo nháp |

### Bổ sung dữ liệu
```sql
CREATE TABLE ai_providers (
  id           BIGSERIAL PRIMARY KEY,
  code         VARCHAR(40) UNIQUE NOT NULL,      -- 'groq' (mặc định), hoặc tên Admin đặt
  display_name VARCHAR(80) NOT NULL,
  base_url     TEXT NOT NULL,                    -- mặc định https://api.groq.com/openai/v1
  api_key_enc  BYTEA,                            -- mã hoá KMS; NULL = chưa nhập
  key_last4    VARCHAR(4),
  key_rotated_at TIMESTAMPTZ,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  status       VARCHAR(20) NOT NULL,             -- ACTIVE, DISABLED, ERROR
  last_check   JSONB,                            -- {"ok":true,"latency_ms":312,"models":14,"at":"..."}
  version      INT NOT NULL,
  updated_by   BIGINT, approved_by BIGINT
);

CREATE TABLE ai_task_configs (
  task         VARCHAR(40) PRIMARY KEY,          -- assistant_chat, extract_json, moderation, summarize_review, speech_to_text…
  provider_id  BIGINT REFERENCES ai_providers(id),
  model        VARCHAR(120) NOT NULL,
  params       JSONB NOT NULL,                   -- timeout_ms, max_tokens, stream, response_format, language
  fallback_provider_id BIGINT REFERENCES ai_providers(id),
  fallback_model VARCHAR(120),
  enabled      BOOLEAN NOT NULL DEFAULT true,
  version      INT NOT NULL, updated_by BIGINT, approved_by BIGINT
);
```
API nội bộ cho Admin Console: `GET/POST/PATCH /v1/admin/ai/providers`, `POST /v1/admin/ai/providers/{id}/test`, `GET /v1/admin/ai/providers/{id}/models`, `PATCH /v1/admin/ai/tasks/{task}` — đều yêu cầu quyền *Quản lý kết nối AI* và ghi nhật ký.

## 12.9. Tạm gác: phân tích hình ảnh bằng AI

Các khả năng sau **chưa làm** trong MVP, 1.0 và giai đoạn Tăng trưởng; chỉ xem xét lại khi chủ sản phẩm quyết định:

| Khả năng tạm gác | Cách làm thay thế hiện tại |
|---|---|
| Đọc menu từ ảnh chụp (OCR + AI) | Quán dán/gõ/đọc danh sách món dạng chữ → AI chuẩn hoá (12.3-6), hoặc nhập tay; đại sứ khu vực hỗ trợ tại quán |
| Nhận diện, đánh giá chất lượng ảnh món | Khung hướng dẫn chụp + bộ lọc sáng cơ bản (không dùng AI) |
| Kiểm duyệt ảnh (ảnh món, ảnh đánh giá, ảnh chat) | Kiểm duyệt thủ công khi bị báo cáo + kiểm tra ngẫu nhiên; ảnh đánh giá chỉ hiện sau khi không bị báo cáo trong 24h đối với tài khoản mới |
| Phân tích ảnh giao hàng / ảnh cân hàng tự động | Ảnh lưu làm bằng chứng; CSKH xem khi có khiếu nại |
| Mô tả ảnh tự động cho người khiếm thị | Quán nhập mô tả món dạng chữ; trình đọc màn hình đọc tên + mô tả món |

Kiến trúc AI Gateway vẫn để sẵn chỗ cho loại tác vụ hình ảnh, nên khi mở lại chỉ cần thêm tác vụ và cấu hình model trên Admin Console.
