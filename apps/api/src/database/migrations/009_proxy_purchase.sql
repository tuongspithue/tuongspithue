-- Ba chế độ nhận đơn của quán và "shipper mua hộ" (Phần 3.8):
--  APP    — quán tự nhận trên app (Cổng A rồi Cổng B, như cũ)
--  PROXY  — quán không dùng app: mời shipper ngay, shipper tới quán đặt & trả tiền hộ rồi giao
--  HYBRID — song song: quán có N giây (Admin cài) để nhận; im lặng thì mời shipper tới mua hộ,
--           trong lúc shipper đang tới quán vẫn bấm nhận được.
-- Người thật xác nhận vẫn bắt buộc: shipper đặt món trực tiếp tại quán thay cho Cổng A.
ALTER TABLE stores ADD COLUMN order_mode VARCHAR(10) NOT NULL DEFAULT 'APP' CHECK (order_mode IN ('APP', 'PROXY', 'HYBRID'));
ALTER TABLE orders ADD COLUMN fulfillment VARCHAR(10) NOT NULL DEFAULT 'STORE';   -- STORE: quán làm & giao cho shipper; PROXY: shipper mua hộ
ALTER TABLE orders ADD COLUMN proxy_allowed BOOLEAN NOT NULL DEFAULT false;          -- đơn này được chuyển sang mua hộ không
ALTER TABLE orders ADD COLUMN proxy_paid_amount BIGINT;                               -- tiền món shipper thực trả tại quán
ALTER TABLE orders ADD COLUMN proxy_receipt_url TEXT;                                 -- ảnh hoá đơn/menu tại quán
-- Hạn mức tiền shipper được ứng trước để mua hộ (Admin chỉnh từng người).
ALTER TABLE riders ADD COLUMN advance_limit BIGINT NOT NULL DEFAULT 500000;
-- Kênh xác nhận mới RIDER_PROXY (shipper đặt món tại quán) dài hơn 10 ký tự.
ALTER TABLE orders ALTER COLUMN accepted_channel TYPE VARCHAR(20);
