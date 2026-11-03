-- Không shipper nào nhận (Phần 3.4): gọi lại quán và mời shipper thêm một lượt trước khi báo khách.
ALTER TABLE orders ADD COLUMN dispatch_round SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE dispatch_offers ADD COLUMN round SMALLINT NOT NULL DEFAULT 1;
-- Điều phối viên "đang trực" = tài khoản Admin/Ops đang mở Admin Console (cập nhật mỗi lần Console hỏi số liệu).
ALTER TABLE users ADD COLUMN console_seen_at TIMESTAMPTZ;
