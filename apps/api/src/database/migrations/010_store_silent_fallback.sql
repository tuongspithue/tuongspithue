-- Quán im lặng hết hạn Cổng A: đơn giao tận nơi được chuyển sang "shipper mua hộ" thay vì huỷ (Phần 3.8).
-- Đánh dấu để vẫn tính là quán bỏ lỡ đơn trong điểm uy tín và thống kê.
ALTER TABLE orders ADD COLUMN store_missed BOOLEAN NOT NULL DEFAULT false;
