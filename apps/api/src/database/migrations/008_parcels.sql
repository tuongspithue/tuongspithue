-- Dịch vụ "Gửi hàng" (Phần 2.1.9): khách đặt shipper lấy hàng ở điểm A giao tới điểm B, không qua quán.
-- Người thật xác nhận đơn là shipper bấm nhận chuyến (Cổng B); đơn gửi hàng không có Cổng A.
ALTER TABLE orders ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'FOOD';      -- FOOD, PARCEL
ALTER TABLE orders ADD COLUMN pickup_location GEOGRAPHY(POINT, 4326);        -- điểm lấy hàng (đơn quán = vị trí quán)
ALTER TABLE orders ADD COLUMN pickup_address TEXT;
ALTER TABLE orders ADD COLUMN pickup_note TEXT;
ALTER TABLE orders ADD COLUMN sender_name VARCHAR(120);
ALTER TABLE orders ADD COLUMN sender_phone VARCHAR(15);
ALTER TABLE orders ADD COLUMN parcel_type VARCHAR(20);                       -- DOCUMENT, FOOD, CLOTHES, ELECTRONICS, OTHER
ALTER TABLE orders ADD COLUMN parcel_size VARCHAR(10);                       -- SMALL, MEDIUM, LARGE
ALTER TABLE orders ADD COLUMN fee_payer VARCHAR(10);                         -- SENDER, RECEIVER
ALTER TABLE orders ADD CONSTRAINT orders_kind_store_chk CHECK (kind = 'PARCEL' OR store_id IS NOT NULL);

-- Đơn cũ: điểm lấy hàng là quán.
UPDATE orders o SET pickup_location = s.location, pickup_address = s.address_text FROM stores s WHERE s.id = o.store_id AND o.pickup_location IS NULL;
CREATE INDEX orders_kind_idx ON orders (kind, created_at DESC);
