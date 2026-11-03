# Phần 15 — Phân quyền chức năng, Đánh giá, Xếp loại & Mức ưu tiên người dùng (Admin chủ động)

> Mục tiêu: **Admin chủ động** quyết định mỗi người dùng (khách, quán, nhân viên quán, shipper) **được dùng chức năng nào**, **được đánh giá và xếp loại ra sao**, và **được ưu tiên đến mức nào** trong từng tác vụ của hệ thống.
>
> Cách làm: **điểm tự động (Phần 11) là nền**, còn **Admin có quyền điều chỉnh** trên nền đó. Việc điều chỉnh phải nằm trong khuôn khổ rõ ràng: có lý do, có thời hạn, có giới hạn, có người duyệt, được ghi nhật ký, và người dùng có quyền khiếu nại. Nhờ vậy Admin chủ động được mà hệ thống vẫn **công bằng, minh bạch và ổn định**.

---

## 15.1. Nguyên tắc

1. **Ba lớp quyết định**: *Mặc định theo cấp* → *Gói quyền/nhãn do Admin gán* → *Điều chỉnh riêng cho từng người*. Lớp cụ thể hơn được áp dụng (giống cấu hình phân tầng ở Phần 14.6).
2. **Mọi điều chỉnh thủ công đều bắt buộc**: lý do (chọn từ danh mục và ghi chú thêm), **thời hạn** (tối đa 90 ngày, hết hạn thì tự trở về mặc định, trừ khi có người gia hạn), người thực hiện, người duyệt nếu vượt hạn mức, và bằng chứng đính kèm khi hạ cấp hoặc hạn chế.
3. **Có giới hạn biên độ**: Admin được *nắn* kết quả tự động chứ không được *thay thế* hoàn toàn (xem 15.5). Mục đích là tránh thiên vị và tránh để một người có thể làm lệch thị trường.
4. **Không phân biệt đối xử**: không xếp loại hay ưu tiên dựa trên giới tính, tuổi, dân tộc, tôn giáo, quê quán hay bất kỳ đặc điểm cá nhân nào không liên quan đến chất lượng dịch vụ. Danh mục lý do không có các lựa chọn này.
5. **Nguyên tắc bất biến** (không quyền nào vượt qua được):
   - Không bỏ được bước **người thật xác nhận đơn** (Cổng A/B).
   - Không sửa hay xoá **đánh giá của khách**, không sửa **sổ cái tài chính**, không sửa **nhật ký sự kiện đơn**.
   - Không cấp quyền bán **hàng cấm/hạn chế** (VD thuốc kê đơn) cho bất kỳ ai.
   - Không tắt được **nhật ký thao tác** của Admin.
6. **Minh bạch với người bị ảnh hưởng**: khi Admin thay đổi cấp, quyền hay ưu tiên của một đối tác, đối tác được thông báo kèm lý do và có nút **khiếu nại** (15.8).

---

## 15.2. Phân quyền chức năng cho người dùng (Entitlements)

Admin bật, tắt hoặc giới hạn từng chức năng **cho từng người** hoặc **cho một nhóm**. Mặc định mỗi chức năng đi theo cấp uy tín (Phần 11).

### Khách hàng
| Chức năng | Mặc định | Admin chỉnh được |
|---|---|---|
| Thanh toán COD | Mở sau 1 đơn thành công | Bật/tắt; **giá trị COD tối đa** |
| COD cho đơn hẹn giờ | ≥ 3 đơn thành công, không bỏ đơn COD trong 90 ngày | Bật/tắt riêng |
| Đặt hẹn giờ / Đặt định kỳ / Yêu cầu mở | Mở | Bật/tắt; số đơn hẹn đang chờ tối đa |
| Đơn nhóm | Mở | Bật/tắt |
| Huỷ miễn phí | 3 lần/tháng | Tăng/giảm số lần |
| Dùng voucher / giới thiệu bạn bè | Mở | Tắt khi phát hiện lạm dụng |
| Chat với quán/shipper | Mở | Tạm khoá khi có hành vi quấy rối |

### Quán (và nhân viên quán)
| Chức năng | Mặc định | Admin chỉnh được |
|---|---|---|
| Nhận đơn hẹn giờ | Mở | Bật/tắt; số đơn tối đa mỗi khung giờ (trần) |
| Báo giá "Yêu cầu mở" | Từ cấp Bạc | Cho phép sớm hoặc tắt |
| Chế độ quán tự giao / Lai | Mở sau khi duyệt shipper của quán | Bật/tắt |
| Số đơn đồng thời tối đa | Theo lịch sử | Đặt trần |
| Tự tạo khuyến mãi / mua quảng cáo | Mở | Bật/tắt, đặt ngân sách tối đa |
| Rút tiền ngay | Sau 30 ngày hoạt động | Cho phép sớm/tắt; hạn mức |
| Ngành hàng được bán | Theo giấy phép đã duyệt | Thêm hoặc bớt ngành (VD nhà thuốc cần giấy phép) |
| Chiết khấu riêng | Theo bảng phí | Đặt mức riêng, có thời hạn (cần duyệt) |

Chủ quán vẫn tự phân quyền cho **nhân viên của mình** trong app quán (Phần 2.2.5). Admin xem được, và có thể **khoá một tài khoản nhân viên** khi có vi phạm.

### Shipper
| Chức năng | Mặc định | Admin chỉnh được |
|---|---|---|
| Nhận đơn COD / hạn mức COD | Theo cấp | Bật/tắt; hạn mức riêng |
| Nhận đơn giá trị cao (> 1 triệu) | Từ cấp Bạc + đã xác minh nhân thân | Cho phép/tắt |
| Nhận đơn có thuốc (cần PIN) | Từ cấp Bạc | Cho phép/tắt |
| Nhận hàng nặng | Theo loại xe đã đăng ký | Cho phép/tắt |
| Giữ chuyến hẹn (số lượng) | Theo cấp (2/4/6) | Tăng/giảm trong giới hạn 0–8 |
| Ghép đơn (số đơn cùng lúc) | 2 | 1–3 |
| Khu vực hoạt động | Thành phố đăng ký | Giới hạn vào khu cụ thể, hoặc mở thêm khu |
| Chế độ "Về nhà" / đăng ký ca | Mở | Bật/tắt |

### Gói quyền (Templates)
- Admin tạo **gói quyền dựng sẵn** và gán cho nhiều người một lúc. Ví dụ: *"Shipper thử việc"* (không COD, 1 đơn mỗi lần, chỉ trong khu đăng ký), *"Quán chuỗi"* (đơn đồng thời cao, rút tiền ngay), *"Khách doanh nghiệp"* (đơn nhóm, xuất hoá đơn).
- Khi sửa một gói quyền, mọi người đang dùng gói đó được cập nhật theo. Riêng ai có **điều chỉnh riêng** thì điều chỉnh riêng đó vẫn được giữ.

---

## 15.3. Đánh giá chủ động của Admin

Ngoài dữ liệu tự động, Admin và đội vận hành **chủ động đánh giá** đối tác bằng các phiếu chuẩn hoá:

| Loại đánh giá | Ai thực hiện | Nội dung | Tần suất |
|---|---|---|---|
| **Kiểm tra thực địa quán** | Quản lý khu vực / BD | Đúng địa chỉ, vệ sinh khu chế biến, đóng gói, giá tại quán so với giá trên app, giấy phép | Khi duyệt, sau đó 6 tháng/lần hoặc khi có khiếu nại |
| **Khách bí mật (mystery shopper)** | Nhân viên đặt đơn thật | Thời gian xác nhận, chất lượng món, thái độ shipper, đúng quy trình (ảnh, PIN) | Ngẫu nhiên theo khu |
| **Đánh giá shipper** | Trưởng nhóm shipper | Thái độ, trang phục và thùng hàng, an toàn giao thông, tuân thủ quy trình | Định kỳ hoặc sau sự cố |
| **Đánh giá sau sự cố** | CSKH cấp 2 / Ops | Kết luận lỗi thuộc về ai, mức độ nghiêm trọng | Mỗi sự cố có xác minh |

- Mỗi phiếu có **tiêu chí chấm điểm** (1–5) kèm ảnh làm bằng chứng. Admin tự tạo và sửa được mẫu phiếu.
- Kết quả trở thành thành phần **"Đánh giá của nền tảng"** trong điểm uy tín, với **trọng số tối đa 15%** (cấu hình được trong khoảng 0–20%). Cách này giúp Admin có tiếng nói thực chất nhưng không lấn át dữ liệu từ hàng nghìn đơn thật.
- Một đánh giá thủ công có hiệu lực **180 ngày**, sau đó phai dần như các chỉ số khác.

---

## 15.4. Xếp loại: tự động + Admin điều chỉnh

### Cấp uy tín
| Hành động | Mô tả | Ai được làm |
|---|---|---|
| **Nâng/hạ 1 cấp** | VD từ Bạc lên Vàng trong 30 ngày cho quán chiến lược mới ký | Quản lý khu vực (cần lý do) |
| **Nâng/hạ ≥ 2 cấp** | Trường hợp đặc biệt | Quản lý vận hành duyệt |
| **Khoá cấp** | Giữ nguyên cấp trong thời gian điều tra hoặc khiếu nại (không lên, không xuống) | CSKH cấp 2 trở lên |
| **Tạm ngưng / mở lại** | Ngừng nhận đơn hoặc chuyến có thời hạn | Quản lý vận hành |
| **Gỡ điều chỉnh** | Trở về cấp tự động ngay lập tức | Người đã tạo điều chỉnh hoặc cấp cao hơn |

Trên mọi màn hình nội bộ, cấp do Admin điều chỉnh được hiển thị kèm **biểu tượng ✋** và ghi chú *"Cấp tự động: Bạc · Điều chỉnh: Vàng đến 30/11 bởi …"*. Phía khách hàng chỉ thấy cấp đang hiệu lực.

### Nhãn phân loại (Labels / Segments)
Admin tạo nhãn tuỳ ý và gắn cho từng người hoặc hàng loạt. Nhãn dùng được trong bộ lọc, báo cáo, gói quyền, luật tự động và mức ưu tiên. Ví dụ:
- Đối tác: *Đối tác chiến lược*, *Đang thử việc*, *Theo dõi đặc biệt*, *Quán chuỗi*, *Shipper nòng cốt*, *Đội phản ứng nhanh mưa bão*.
- Khách hàng (**chỉ dùng nội bộ, không hiển thị cho ai khác**): *Khách doanh nghiệp*, *Khách cần hỗ trợ đặc biệt* (người cao tuổi), *Nghi vấn lạm dụng voucher*.

Mỗi nhãn có thể đặt: màu, mô tả, **ai được gắn hoặc gỡ**, có tự hết hạn hay không, và có hiện cho chính người dùng đó hay không (VD nhãn *Shipper nòng cốt* có thể hiện như một huy hiệu).

---

## 15.5. Mức ưu tiên trong các tác vụ

### Công thức
```
ưu_tiên_hiệu_lực = ưu_tiên_tự_động            (từ điểm uy tín, khoảng cách, lịch sử… – Phần 3, 10, 11)
                 + điều_chỉnh_của_admin       (giới hạn ±20 điểm trên thang 100, có thời hạn)
                 + điều_chỉnh_theo_nhãn       (VD "Đội phản ứng nhanh" +10 khi bật chế độ mưa bão)
```
Mức tổng **không vượt quá trần ±25 điểm** so với giá trị tự động. Ở mỗi tác vụ, Admin còn đặt được **tỷ lệ tối đa đơn/chuyến dành cho nhóm được ưu tiên** (VD nhóm có điều chỉnh dương nhận không quá 30% chuyến hẹn trong khu). Mục đích là để shipper và quán khác vẫn có cơ hội công bằng.

### Áp dụng theo từng tác vụ
| Tác vụ | Ưu tiên tự động dựa trên | Admin chủ động được gì |
|---|---|---|
| **Điều phối đơn ngay** (mời shipper) | ETA, thuận đường, uy tín, công bằng (Phần 3.4) | Cộng/trừ điểm cho shipper hoặc nhóm; chỉnh **trọng số w1–w5** theo khu (qua Phần 14.6) |
| **Chợ chuyến hẹn** (ai thấy trước) | Cấp uy tín → thời điểm được thấy (Phần 10.5) | Cho shipper hoặc nhãn được **thấy sớm hơn/muộn hơn**; đổi độ trễ hiển thị của từng cấp |
| **Yêu cầu mở** (thứ tự báo giá hiển thị cho khách) | Uy tín, khoảng cách, giá | Điều chỉnh có giới hạn; **quán trả phí quảng cáo luôn có nhãn "Tài trợ"** |
| **Hiển thị quán trong "Quanh tôi"** | Gần, ETA, ★, tỷ lệ xác nhận | Tăng hạng có thời hạn (VD quán mới ký, quán đạt kiểm tra thực địa); hạ hạng hoặc ẩn khi đang điều tra |
| **Hàng đợi CSKH** | Mức nghiêm trọng, đơn đang giao, thời gian chờ | Đưa nhãn *Khách cần hỗ trợ đặc biệt*, *Khách doanh nghiệp*, *Đối tác chiến lược* lên trước |
| **Duyệt hồ sơ đối tác** | Thứ tự nộp | Ưu tiên khu đang thiếu đối tác hoặc chiến dịch tuyển dụng |
| **Chi trả / rút tiền** | Lịch chuẩn | Cho phép rút nhanh hoặc giữ chi trả có lý do (cần Kế toán duyệt) |
| **Thưởng & khuyến khích** | Theo mốc chung | Thêm nhóm đủ điều kiện nhận thưởng chiến dịch |

### Xem trước trước khi áp dụng
Màn hình điều chỉnh ưu tiên luôn có ô **"Xem trước"** cho biết: *"Với +15 điểm, anh Minh từ hạng 12 lên hạng 4 trong danh sách được mời ở khu Phường 12; ước tính nhận thêm 3–5 chuyến/ngày; các shipper khác trong khu giảm trung bình 0,2 chuyến/ngày."*

---

## 15.6. Phân quyền cho nhân viên Admin thực hiện các việc trên

| Hành động | CSKH cấp 1 | CSKH cấp 2 | Quản lý khu vực | Quản lý vận hành | Super Admin |
|---|---|---|---|---|---|
| Xem cấp, quyền, ưu tiên, lịch sử | ✔ | ✔ | ✔ (khu mình) | ✔ | ✔ |
| Tạm khoá chat/voucher của khách | – | ✔ | ✔ | ✔ | ✔ |
| Gắn/gỡ nhãn | Nhãn được phép | Nhãn được phép | ✔ (khu mình) | ✔ | ✔ |
| Chỉnh quyền chức năng một người | – | Một số mục | ✔ (khu mình) | ✔ | ✔ |
| Nâng/hạ 1 cấp | – | – | ✔ (khu mình) | ✔ | ✔ |
| Nâng/hạ ≥ 2 cấp, tạm ngưng | – | – | Đề xuất | ✔ Duyệt | ✔ |
| Điều chỉnh ưu tiên ≤ ±10 | – | – | ✔ | ✔ | ✔ |
| Điều chỉnh ưu tiên ±11 đến ±20 | – | – | Đề xuất | ✔ Duyệt | ✔ |
| Tạo/sửa gói quyền, nhãn, mẫu phiếu đánh giá | – | – | – | ✔ | ✔ |
| Đổi trần, biên độ, trọng số "Đánh giá của nền tảng" | – | – | – | Đề xuất | ✔ Duyệt (4 mắt) |
| Tác vụ hàng loạt > 50 người | – | – | Đề xuất | ✔ Duyệt | ✔ |

- Bảng trên là **mặc định**. Super Admin tự tạo vai trò mới và tick từng quyền trong ma trận (Phần 14.9).
- **Không ai tự duyệt điều chỉnh của chính mình**. Không ai được điều chỉnh tài khoản có liên quan đến bản thân (nhân viên khai báo các tài khoản người thân; hệ thống cảnh báo khi phát hiện trùng thiết bị, SĐT hoặc địa chỉ).
- **Giám sát người điều chỉnh**: báo cáo hằng tuần về số lượng và chiều hướng điều chỉnh theo từng nhân viên. Nếu một người liên tục nâng ưu tiên cho cùng một nhóm, hệ thống tự cảnh báo Quản lý vận hành.

---

## 15.7. Giao diện trong Admin Console

- **Tab "Quyền & Xếp loại"** trong Hồ sơ 360° của từng người (Phần 14.5):
  ```
  Anh Nguyễn Văn Minh · Shipper · Phường 12
  Cấp: 🏅 Vàng (tự động: Bạc 78 điểm)  ✋ Nâng bởi Quản lý KV Lan đến 30/11 – "Đội mưa bão tháng 11"
  Ưu tiên điều phối: +10 (đến 15/11)      Nhãn: [Shipper nòng cốt] [Đội phản ứng nhanh]
  Quyền:  COD ✔ (3.000.000đ) · Đơn giá trị cao ✔ · Thuốc ✔ · Chuyến hẹn: 6 · Ghép đơn: 2
  Đánh giá nền tảng: 4,6/5 (2 phiếu, gần nhất 02/10 – Khách bí mật)
  [Chỉnh quyền] [Đổi cấp] [Chỉnh ưu tiên] [Gắn nhãn] [Thêm phiếu đánh giá] [Lịch sử ▸]
  ```
- **Bảng "Xếp loại & Ưu tiên"** theo khu: danh sách đối tác với cấp tự động, cấp hiệu lực, điều chỉnh đang chạy, ngày hết hạn; bộ lọc *"Điều chỉnh sắp hết hạn"*, *"Đang bị khoá cấp"*, *"Chênh lệch lớn giữa tự động và thủ công"*.
- **Công cụ hàng loạt**: lọc theo điều kiện (VD *shipper Vàng ở Quận 7 có xe ba gác*), chọn gói quyền hoặc nhãn hoặc điều chỉnh, xem trước tác động, gửi duyệt.
- **Bảng công bằng**: phân bố chuyến, thu nhập và hiển thị giữa nhóm có điều chỉnh và nhóm không; cảnh báo khi vượt trần tỷ lệ.
- **Dòng thời gian lịch sử**: mọi thay đổi cấp, quyền, ưu tiên và nhãn, kèm người thực hiện, người duyệt, lý do, bằng chứng; hoàn tác được từng thay đổi.

---

## 15.8. Minh bạch & khiếu nại phía người dùng

- **Đối tác (quán/shipper)** thấy trong mục *"Uy tín của tôi"* (Phần 11.7):
  - Cấp và quyền hiện tại, những gì đang bị giới hạn, và **cách để được mở lại**.
  - Thông báo khi bị hạ cấp, hạn chế hay tạm ngưng: lý do theo danh mục, thời hạn, và nút **Khiếu nại**.
  - Điều chỉnh có lợi (VD nâng cấp chiến dịch) được thông báo kèm thời hạn, để đối tác biết đây không phải cấp vĩnh viễn.
- **Trường hợp điều tra gian lận**: thông báo chung chung (*"Tài khoản đang được xem xét, dự kiến 48 giờ"*) để không lộ cách phát hiện, nhưng vẫn có nút khiếu nại và thời hạn xử lý.
- **Khách hàng**: khi một chức năng bị tắt (VD COD), khách thấy thông báo ngắn kèm điều kiện để mở lại. Nhãn nội bộ của khách **không bao giờ hiển thị** cho quán hay shipper.
- **Khiếu nại** được chuyển cho **người khác với người đã điều chỉnh** xử lý. Thời hạn trả lời ≤ 48 giờ; nếu khiếu nại đúng thì gỡ điều chỉnh và hoàn lại điểm hoặc quyền.

---

## 15.9. Bổ sung kỹ thuật

```sql
-- Danh mục chức năng có thể phân quyền
CREATE TABLE entitlement_definitions (
  key          VARCHAR(80) PRIMARY KEY,      -- 'rider.cod.enabled', 'rider.cod.limit', 'store.open_request.bid'
  subject_type VARCHAR(10) NOT NULL,         -- CUSTOMER, STORE, STORE_STAFF, RIDER
  value_type   VARCHAR(20) NOT NULL,         -- BOOL, INT, MONEY, ENUM, LIST
  min_value JSONB, max_value JSONB,
  default_by_tier JSONB NOT NULL,            -- {"BRONZE":false,"SILVER":true,...}
  is_invariant BOOLEAN NOT NULL DEFAULT false
);

-- Gói quyền
CREATE TABLE entitlement_templates (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(120) UNIQUE, subject_type VARCHAR(10),
  values JSONB NOT NULL, version INT NOT NULL, created_by BIGINT, approved_by BIGINT
);

-- Gán gói quyền / điều chỉnh riêng cho từng người
CREATE TABLE user_entitlements (
  id BIGSERIAL PRIMARY KEY,
  subject_type VARCHAR(10) NOT NULL, subject_id BIGINT NOT NULL,
  template_id  BIGINT REFERENCES entitlement_templates(id),   -- hoặc NULL nếu là điều chỉnh riêng
  key          VARCHAR(80) REFERENCES entitlement_definitions(key),
  value        JSONB,
  reason_code  VARCHAR(40) NOT NULL, note TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(), effective_to TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL,                -- PENDING_APPROVAL, ACTIVE, EXPIRED, REVOKED
  created_by BIGINT NOT NULL, approved_by BIGINT
);

-- Điều chỉnh cấp
CREATE TABLE tier_overrides (
  id BIGSERIAL PRIMARY KEY,
  subject_type VARCHAR(10) NOT NULL, subject_id BIGINT NOT NULL,
  action VARCHAR(20) NOT NULL,                -- SET_TIER, LOCK, SUSPEND
  tier VARCHAR(12),
  reason_code VARCHAR(40) NOT NULL, note TEXT, evidence JSONB,
  effective_from TIMESTAMPTZ NOT NULL, effective_to TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL, created_by BIGINT NOT NULL, approved_by BIGINT
);

-- Điều chỉnh ưu tiên theo tác vụ
CREATE TABLE priority_adjustments (
  id BIGSERIAL PRIMARY KEY,
  subject_type VARCHAR(10) NOT NULL, subject_id BIGINT,   -- hoặc theo nhãn
  label_id BIGINT,
  task VARCHAR(30) NOT NULL,                  -- DISPATCH, SCHEDULED_BOARD, OPEN_REQUEST, DISCOVERY, SUPPORT_QUEUE, ONBOARDING, PAYOUT
  delta NUMERIC(5,2) NOT NULL CHECK (delta BETWEEN -20 AND 20),
  zone_scope JSONB,
  reason_code VARCHAR(40) NOT NULL, note TEXT,
  effective_from TIMESTAMPTZ NOT NULL, effective_to TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL, created_by BIGINT NOT NULL, approved_by BIGINT
);

-- Nhãn
CREATE TABLE labels (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(80) UNIQUE, color VARCHAR(9),
  subject_type VARCHAR(10), visible_to_subject BOOLEAN DEFAULT false,
  allowed_roles TEXT[], auto_expire_days INT
);
CREATE TABLE user_labels (
  label_id BIGINT REFERENCES labels(id), subject_type VARCHAR(10), subject_id BIGINT,
  added_by BIGINT, added_at TIMESTAMPTZ DEFAULT now(), expires_at TIMESTAMPTZ,
  PRIMARY KEY (label_id, subject_type, subject_id)
);

-- Phiếu đánh giá chủ động
CREATE TABLE evaluation_forms (id BIGSERIAL PRIMARY KEY, name VARCHAR(120), subject_type VARCHAR(10), criteria JSONB NOT NULL, version INT);
CREATE TABLE manual_evaluations (
  id BIGSERIAL PRIMARY KEY, form_id BIGINT REFERENCES evaluation_forms(id),
  subject_type VARCHAR(10), subject_id BIGINT, scores JSONB NOT NULL, overall NUMERIC(3,2),
  evidence JSONB, evaluator_id BIGINT NOT NULL, evaluated_at TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL
);
```

- **Entitlement Service**: tính **quyền hiệu lực** của mỗi người theo thứ tự *điều chỉnh riêng → gói quyền → mặc định theo cấp*. Kết quả được cache trong Redis và làm mới ngay khi có thay đổi. App và các dịch vụ khác (Order, Dispatch, Payment) **chỉ hỏi Entitlement Service** chứ không tự suy luận quyền.
- **Dispatch / Discovery / Hàng đợi CSKH** đọc **ưu tiên hiệu lực** đã tính sẵn, nên không làm chậm điều phối (< 5 ms mỗi lần tra).
- **Job hết hạn**: quét mỗi phút, tự gỡ các điều chỉnh hết hạn, thông báo cho người bị ảnh hưởng, và nhắc người tạo trước 3 ngày để gia hạn nếu cần.
- **Kiểm tra ràng buộc ở backend**: biên độ, trần tổng, tỷ lệ tối đa của nhóm ưu tiên, nguyên tắc bất biến, quyền của người thao tác. Giao diện có kiểm tra, nhưng **backend luôn kiểm tra lại**.
- Mọi thay đổi ghi vào **nhật ký thao tác bất biến** (Phần 14.9) và phát sự kiện `entitlement.changed`, `tier.overridden`, `priority.adjusted` để báo cáo và thông báo.

## 15.10. Lộ trình
- **MVP:** Chỉnh quyền chức năng từng người (COD, hạn mức, chuyến hẹn, ngành hàng, tạm ngưng); nâng/hạ hoặc khoá cấp có lý do, thời hạn và nhật ký; nhãn cơ bản; tab "Quyền & Xếp loại" trong hồ sơ 360°; thông báo cho đối tác khi bị hạn chế.
- **1.0:** Gói quyền; điều chỉnh ưu tiên theo tác vụ có biên độ và trần; luồng đề xuất/duyệt theo hạn mức vai trò; phiếu kiểm tra thực địa và đánh giá shipper; khiếu nại; công cụ hàng loạt; xem trước tác động.
- **Tăng trưởng:** Chương trình khách bí mật; bảng công bằng; cảnh báo hành vi điều chỉnh bất thường của nhân viên; luật tự động gắn nhãn hoặc điều chỉnh ưu tiên (Rule Builder, Phần 14.6.3).
