# Phần 4 — Định giá, Thanh toán, Ví & Đối soát

---

## 4.1. Công thức phí ship (shipper hệ thống)

```
phí_ship_khách = max(PHÍ_TỐI_THIỂU,
                     PHÍ_MỞ_CỬA + đơn_giá_km × km_thực_tế_theo_đường)
                 × hệ_số_cao_điểm
                 + phụ_phí (hàng nặng, đêm khuya 22h–6h, mưa, điểm thứ 2)
                 − trợ_giá_khuyến_mãi
```

**Tham số đề xuất (TP lớn, cấu hình theo vùng):**

| Tham số | Giá trị |
|---|---|
| Phí tối thiểu (≤ 2 km) | 15.000đ |
| Đơn giá mỗi km tiếp theo | 4.000đ |
| Hệ số cao điểm | 1,0 – 1,5 (tự động theo tỷ lệ cung/cầu từng ô lưới H3, có trần) |
| Phụ phí hàng nặng (> 10 kg) | 10.000đ |
| Phụ phí đêm khuya | 5.000đ |
| Phụ phí mưa | 3.000–8.000đ (Ops bật) |
| Bán kính tối đa | 7 km (đồ ăn), 10 km (hoa, tạp hoá đặc biệt) |

- **Khoảng cách tính theo đường đi thực tế** (routing engine), không phải đường chim bay.
- Phí được **khoá tại thời điểm đặt** (báo giá có hiệu lực 5 phút) — khách không bao giờ bị tăng phí sau khi đặt.

**Thu nhập shipper** = cước cơ bản + km × đơn giá + hệ số cao điểm (shipper hưởng phần lớn) + thưởng + 100% tip.
Mục tiêu: **shipper nhận ≥ 80% phí ship khách trả**.

## 4.2. Phí ship khi quán tự giao
- Quán tự cấu hình trong khung: `0đ ≤ phí ≤ trần hệ thống theo km`.
- Mẫu: *Miễn phí ≤ 1 km* · *10.000đ ≤ 3 km* · *Miễn phí cho đơn ≥ 150.000đ*.
- Toàn bộ phí ship thuộc về quán (hệ thống chỉ thu chiết khấu ưu đãi trên giá trị món).

## 4.3. Phương thức thanh toán

| Phương thức | Luồng tiền | Ghi chú |
|---|---|---|
| **Tiền mặt (COD)** | Khách → Shipper → (Shipper hệ thống: đã trả quán khi lấy hàng / hoặc hệ thống trả quán) | Xem 4.4 |
| **Ví điện tử** (MoMo, ZaloPay, ShopeePay) | Khách → Tài khoản hệ thống (giữ tiền) → chia khi hoàn thành | Hoàn tiền tự động khi huỷ |
| **VietQR / chuyển khoản** | QR động theo đơn, đối soát qua webhook ngân hàng/đối tác (VD: Casso, PayOS) | Mã đơn trong nội dung CK |
| **Thẻ** (ATM nội địa, Visa/Master) | Qua cổng VNPay/OnePay, tokenization | Không lưu số thẻ (PCI-DSS do cổng đảm nhiệm) |
| **Tín dụng hoàn tiền SQT** | Chỉ phát sinh từ hoàn tiền/đền bù, **không nạp, không rút, không chuyển** | Tự động trừ trước nếu khách bật; có hạn dùng 12 tháng |

## 4.4. Luồng tiền COD (quan trọng để chống thất thoát)

**Mô hình đề xuất — "Hệ thống trả quán, shipper nộp hệ thống":**
1. Shipper lấy hàng **không phải ứng tiền** cho quán (giảm rào cản cho shipper).
2. Shipper thu tiền mặt từ khách → **công nợ COD** của shipper tăng.
3. Hệ thống trả quán qua kỳ thanh toán T+1 như đơn online.
4. Shipper nộp COD: tự động **cấn trừ vào thu nhập** + chuyển khoản phần còn lại qua QR; hạn mức nợ COD tối đa (VD 2.000.000đ) — vượt hạn mức chỉ nhận đơn online.

*Đã loại bỏ* phương án "shipper ứng tiền cho quán" (gây khó tìm shipper, phát sinh tranh chấp tiền mặt). Quán cần tiền nhanh → dùng **"Rút tiền ngay"** doanh thu các đơn đã hoàn thành (phí nhỏ, về tài khoản trong vài phút).

**Quán tự giao + COD:** tiền thuộc về quán; hệ thống ghi **công nợ chiết khấu** và cấn trừ vào các đơn online của quán hoặc thu theo kỳ.

## 4.5. Ví & Sổ cái (Ledger)
- Áp dụng **sổ cái kép (double-entry ledger)**: mỗi giao dịch có bút toán Nợ/Có cân bằng giữa các tài khoản: `khách`, `quán`, `shipper`, `nền_tảng_doanh_thu`, `tạm_giữ`, `khuyến_mãi`, `cổng_thanh_toán`.
- Không bao giờ sửa/xoá bút toán; điều chỉnh = bút toán đảo.
- Số tiền lưu kiểu **số nguyên (đồng)**, không dùng số thực.

**Ví dụ phân chia một đơn 100.000đ món, phí ship 20.000đ, phí dịch vụ 2.000đ, chiết khấu quán 12%, voucher hệ thống 10.000đ:**

| Bên | Số tiền |
|---|---|
| Khách trả | 100.000 + 20.000 + 2.000 − 10.000 = **112.000đ** |
| Quán thực nhận | 100.000 − 12% = **88.000đ** |
| Shipper | **17.000đ** (+ thưởng nếu có) |
| Nền tảng | 12.000 (CK) + 3.000 (ship) + 2.000 (DV) − 10.000 (voucher) = **7.000đ** |

## 4.6. Đối soát & Chi trả
- **Quán:** chốt sổ 23:59 hằng ngày → chuyển khoản T+1 (theo lô, API ngân hàng). Bảng kê chi tiết trong app.
- **Shipper:** rút tiền bất kỳ lúc nào (tối thiểu 50.000đ), xử lý trong ngày.
- **Đối soát cổng thanh toán:** job hằng ngày so sánh giao dịch nội bộ ↔ báo cáo cổng; chênh lệch → ticket Kế toán.
- **Dòng tiền hợp pháp:** tiền khách trả online đi qua **cổng thanh toán/trung gian thanh toán được cấp phép** và tài khoản chuyên dùng; nền tảng **không tự vận hành ví điện tử**. Phương án chia tiền (split payment) của cổng được ưu tiên nếu có.
- **Thuế với hộ kinh doanh & cá nhân bán hàng:** theo quy định quản lý thuế với hoạt động thương mại điện tử (Nghị định 117/2025/NĐ-CP và văn bản liên quan), sàn có chức năng thanh toán có thể phải **khấu trừ, nộp thay thuế GTGT/TNCN** cho hộ kinh doanh/cá nhân bán hàng trên sàn. Hệ thống cần: lưu mã số thuế/CCCD người bán, tính khấu trừ trên từng kỳ thanh toán, hiển thị rõ trên bảng kê, xuất chứng từ khấu trừ. *(Bắt buộc xác nhận với chuyên gia thuế trước khi vận hành.)*
- **Thu nhập shipper:** xác định rõ mô hình hợp đồng (đối tác dịch vụ) và nghĩa vụ khấu trừ thuế TNCN theo quy định; có bảng kê năm cho shipper.
- **Hoá đơn:** xuất hoá đơn điện tử cho phần chiết khấu/phí dịch vụ của nền tảng (theo quy định hoá đơn điện tử hiện hành); hỗ trợ tính thuế TNCN/khấu trừ cho hộ kinh doanh và shipper theo quy định thuế áp dụng cho sàn TMĐT (cần tư vấn pháp lý/kế toán khi triển khai).

## 4.7. Khuyến mãi & chống lạm dụng
- Loại: giảm %, giảm tiền, freeship, mua X tặng Y, khách mới, theo ngành, theo khung giờ, theo vùng.
- Nguồn tài trợ: **Nền tảng / Quán / Đồng tài trợ** — ghi rõ trên bút toán.
- Chống lạm dụng: 1 voucher khách mới / **thiết bị + SĐT + phương thức thanh toán**; phát hiện cụm tài khoản cùng thiết bị/địa chỉ; giới hạn ngân sách theo ngày; quán tự đặt đơn ảo (cùng thiết bị/vị trí với quán) → chặn & điều tra.
