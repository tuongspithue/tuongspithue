# Phần 11 — Điểm uy tín của Shipper & Quán theo khu vực

> Uy tín là **tài sản quan trọng nhất** của mỗi đối tác trên Ship Quanh Tôi: nó quyết định ai được khách thấy trước, ai được nhận đơn/chuyến tốt trước, và nó **được công khai trực quan** để khách yên tâm chọn.

---

## 11.1. Nguyên tắc
1. **Dựa trên hành vi thật, đo được** — không chỉ là sao đánh giá (vốn dễ cảm tính/bị thao túng).
2. **Công bằng theo khu vực** — so sánh đối tác với **mặt bằng khu vực của chính họ** (quán trong hẻm nhỏ không bị so với chuỗi lớn ở trung tâm).
3. **Minh bạch & có thể cải thiện** — đối tác biết điểm mình gồm gì, kém ở đâu, làm gì để tăng.
4. **Gần đây quan trọng hơn** — hành vi 30 ngày gần nhất có trọng số lớn; lỗi cũ phai dần.
5. **Không phạt vì lỗi không phải của mình** — mưa bão, khách bom hàng, sự cố hệ thống được loại trừ.
6. **Có quyền khiếu nại** — mọi trừ điểm đều xem được lý do và có nút "Khiếu nại".

## 11.2. Điểm Uy tín (0–100) — công thức

### Shipper
| Thành phần | Trọng số | Đo bằng |
|---|---|---|
| Hoàn thành chuyến đã nhận | 25% | % chuyến nhận mà giao thành công (không huỷ giữa chừng) |
| Đúng giờ | 20% | % đến quán & giao trong ETA cam kết (±5 phút) |
| Đánh giá của khách | 20% | Sao trung bình **Bayes** (xem 11.3) |
| Đánh giá của quán | 10% | Quán chấm khi bàn giao: lịch sự, kiểm hàng, đúng giờ |
| Tuân thủ quy trình | 10% | Ảnh giao hàng, geofence hợp lệ, không giả GPS, nộp COD đúng hạn |
| Giữ cam kết chuyến hẹn | 10% | % chuyến hẹn đã giữ được thực hiện, xác nhận T−20 đúng hạn |
| Khiếu nại có căn cứ | −5% mỗi vụ (trần) | Thiếu hàng, thái độ, giao sai… sau khi CSKH xác minh |
| Thâm niên & thưởng tích cực | +5% | Số chuyến, chuyến mưa bão, khen của khách |

### Quán
| Thành phần | Trọng số | Đo bằng |
|---|---|---|
| Tỷ lệ xác nhận đơn | 20% | % đơn được nhận (không lỡ/không từ chối vô lý) |
| Tốc độ xác nhận | 10% | Thời gian trung vị từ đơn tới → nhận |
| Chuẩn bị đúng giờ | 15% | % đơn sẵn sàng đúng thời gian quán cam kết |
| Chất lượng món (đánh giá khách) | 25% | Sao Bayes + nhãn ("ngon", "đúng mô tả") |
| Chính xác đơn hàng | 15% | % đơn không bị báo thiếu/sai món |
| Giữ cam kết đơn hẹn | 10% | % đơn hẹn đã nhận được làm đúng giờ, xác nhận lại T−30 |
| Đánh giá của shipper | 5% | Đóng gói, sẵn sàng khi tới, thái độ |
| Khiếu nại có căn cứ | trừ điểm | Vệ sinh, giá chênh, thái độ |

**Tính toán:** mỗi chỉ số được chuẩn hoá về 0–100 theo **phân vị trong khu vực** (ô H3 cấp 7 ≈ 5 km², hoặc quận), rồi cộng có trọng số, làm mượt theo thời gian:
```
chỉ_số_đã_phai = Σ (giá_trị_sự_kiện × e^(−tuổi_ngày / 30)) / Σ e^(−tuổi_ngày / 30)
điểm_uy_tín    = Σ trọng_số_i × phân_vị_khu_vực(chỉ_số_i)
```
Cập nhật **gần realtime** (sau mỗi đơn, qua luồng sự kiện) cho phần hành vi; tính lại toàn bộ hằng đêm để hiệu chỉnh.

## 11.3. Chống thao túng & công bằng
- **Sao Bayes**: `★_hiển_thị = (C × m + Σ★) / (C + n)` với `m` = trung bình khu vực, `C` = 20. Quán mới 3 đánh giá 5★ không vượt mặt quán 2.000 đánh giá 4,8★.
- Chỉ **đơn hoàn thành** mới được đánh giá; đánh giá từ cụm tài khoản đáng ngờ bị giảm trọng số (Phần 7 & 12).
- **Loại trừ sự kiện ngoài tầm kiểm soát**: mưa bão (chế độ thời tiết bật), khách không nghe máy, lỗi hệ thống, đơn bị huỷ do khách.
- **Đối tác mới**: bắt đầu với điểm "Tân binh" = trung vị khu vực, có nhãn 🌱 *Mới* và **được tăng hiển thị 14 ngày đầu** để có cơ hội chứng minh.
- **Khiếu nại**: đối tác bấm khiếu nại một lần trừ điểm → CSKH xem bằng chứng (ảnh, GPS, chat) trong 48h → hoàn điểm nếu đúng.

## 11.4. Cấp độ & huy hiệu (hiển thị trực quan)

| Cấp | Điều kiện | Biểu tượng | Quyền lợi chính |
|---|---|---|---|
| 💎 **Kim cương** | Top 5% khu vực, ≥ 90 điểm, ≥ 500 đơn | Viền kim cương lấp lánh | Ưu tiên cao nhất, huy hiệu trên bản đồ, chiết khấu/thưởng tốt nhất |
| 🏅 **Vàng** | ≥ 80 điểm | Huy hiệu vàng | Ưu tiên cao, thấy chuyến hẹn ngay, giữ 6 chuyến hẹn |
| 🥈 **Bạc** | ≥ 65 điểm | Huy hiệu bạc | Tiêu chuẩn, giữ 4 chuyến hẹn |
| 🥉 **Đồng** | ≥ 50 điểm | Huy hiệu đồng | Hạn chế: giữ 2 chuyến hẹn, ít đơn COD giá trị cao |
| 🌱 **Tân binh** | < 30 đơn trong khu vực | Nhãn *Mới* | Quyền lợi như Đồng, được tăng hiển thị 14 ngày đầu; xếp cấp chính thức sau 30 đơn |
| ⚠️ **Cần cải thiện** | < 50 điểm | Không hiển thị cho khách | Giảm hiển thị/ưu tiên, nhận kế hoạch cải thiện + khoá học; < 35 điểm trong 30 ngày → tạm ngưng & xem xét |

Huy hiệu chuyên biệt (bên cạnh cấp): ⚡ *Xác nhận siêu tốc*, 🎯 *Chuẩn từng món*, ⏰ *Đúng hẹn 100%*, 🌧️ *Người hùng mưa bão*, ❤️ *Khách quen yêu thích*, 🧼 *Bếp sạch*.

## 11.5. Uy tín được dùng ở đâu (để nó thực sự "đặc biệt quan trọng")

| Nơi | Cách dùng |
|---|---|
| **Trang chủ / bản đồ của khách** | Ghim & thẻ quán hiện cấp uy tín; bộ lọc "Chỉ quán Vàng trở lên"; xếp hạng "Quanh tôi" có trọng số uy tín |
| **Màn hình theo dõi đơn** | Thẻ shipper hiện cấp, số chuyến, % đúng giờ: *"Anh Minh 🏅 Vàng · 2.340 chuyến · 97% đúng giờ"* |
| **Điều phối đơn ngay** | Uy tín là thành phần `w3` trong điểm phù hợp (Phần 3) |
| **Chợ chuyến hẹn** | Cấp cao thấy chuyến sớm hơn, giữ được nhiều hơn (Phần 10) |
| **Yêu cầu mở** | Chỉ quán ≥ ngưỡng được báo giá; báo giá xếp theo uy tín |
| **Ghép shipper – quán** | Quán Vàng ưu tiên shipper Vàng giờ cao điểm (trải nghiệm đồng đều) |
| **Thu nhập & chiết khấu** | Shipper: thưởng hệ số theo cấp; Quán: giảm chiết khấu 1–2% cho Kim cương/Vàng |
| **Quyền COD / đơn giá trị cao** | Shipper & khách cần cấp tối thiểu |
| **Khách hàng** | Khách **không bị xếp hạng hay chấm sao**; chỉ có chỉ số đơn giản, công khai với chính khách: số đơn hoàn thành, số lần bỏ đơn COD. Quán/shipper thấy dạng *"✔ 25 đơn thành công"* — đủ để tự tin nhận đơn hẹn/COD lớn |

## 11.6. "Bảng Vàng Khu Vực" ⭐ (sáng tạo)
- Mỗi phường/khu có **bảng xếp hạng hằng tuần**: Top 10 quán, Top 10 shipper — hiển thị trong app (có thể tắt hiện tên với shipper).
- Khách xem được **"Quán uy tín nhất quanh tôi tuần này"** như một danh mục riêng.
- Vinh danh tháng: shipper & quán xuất sắc mỗi khu nhận thưởng tiền mặt, giấy khen, decal **"Quán Uy Tín Ship Quanh Tôi 2026"** dán tại quán.
- **Bản đồ uy tín khu vực** cho Ops: thấy ô nào thiếu đối tác chất lượng → tuyển thêm, đào tạo.

## 11.7. Màn hình "Uy tín của tôi" cho đối tác
```
     ╭──────────╮
     │   86     │   🏅 VÀNG  · Hạng 7/142 trong khu Phường 12
     ╰──────────╯   ▲ +3 so với tuần trước
 Hoàn thành  ███████████░ 96%   ✔
 Đúng giờ    █████████░░░ 88%   ⚠ Bạn hay trễ khi lấy hàng giờ trưa
 Đánh giá    ███████████░ 4.9★  ✔
 Chuyến hẹn  ████████████ 100%  ✔
 💡 Gợi ý AI: Bật "Về nhà" sau 20h để giảm chuyến xa, tăng đúng giờ.
 Còn 4 điểm nữa để lên 💎 Kim cương!       [Xem lịch sử thay đổi]
```

> **Admin điều chỉnh:** ngoài điểm tự động, Admin có thể thêm phiếu đánh giá chủ động (thành phần "Đánh giá của nền tảng", trọng số tối đa 15%), nâng/hạ/khoá cấp, gắn nhãn và điều chỉnh ưu tiên theo tác vụ — xem [Phần 15](15-phan-quyen-xep-loai-uu-tien.md).

## 11.8. Bổ sung kỹ thuật
```sql
CREATE TABLE trust_scores (
  subject_type VARCHAR(10) NOT NULL,     -- RIDER, STORE, CUSTOMER
  subject_id   BIGINT NOT NULL,
  zone_cell    VARCHAR(20) NOT NULL,     -- H3 cell / mã quận
  score        NUMERIC(5,2) NOT NULL,
  tier         VARCHAR(12) NOT NULL,     -- DIAMOND, GOLD, SILVER, BRONZE, IMPROVE, ROOKIE
  components   JSONB NOT NULL,           -- {"completion":96,"on_time":88,...}
  zone_rank    INT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_type, subject_id)
);

CREATE TABLE trust_events (               -- nguồn dữ liệu bất biến
  id           BIGSERIAL PRIMARY KEY,
  subject_type VARCHAR(10) NOT NULL,
  subject_id   BIGINT NOT NULL,
  metric       VARCHAR(30) NOT NULL,     -- COMPLETION, ON_TIME, RATING, COMPLAINT, SCHEDULE_KEPT...
  value        NUMERIC NOT NULL,
  order_id     BIGINT,
  excluded     BOOLEAN NOT NULL DEFAULT false,  -- bị loại trừ (mưa bão, khiếu nại thắng)
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trust_appeals (
  id         BIGSERIAL PRIMARY KEY,
  event_id   BIGINT REFERENCES trust_events(id),
  status     VARCHAR(20) NOT NULL,       -- OPEN, ACCEPTED, REJECTED
  resolved_by BIGINT, resolved_at TIMESTAMPTZ
);
```
- Dịch vụ **Trust Service** tiêu thụ sự kiện đơn hàng (event bus) → ghi `trust_events` → cập nhật điểm gần realtime (Redis) → đồng bộ `trust_scores` và chỉ mục tìm kiếm.
- API: `GET /v1/me/trust` (đối tác), `GET /v1/stores/{id}/trust-badge`, `POST /v1/trust/appeals`, `GET /v1/zones/{cell}/leaderboard`.
