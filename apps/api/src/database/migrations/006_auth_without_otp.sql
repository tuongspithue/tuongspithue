-- Đăng nhập không cần SMS/Zalo (Phần 13.9):
--  * Khách: nhập tên + số điện thoại là đặt được; người nhận đơn tự gọi xác minh.
--    Mỗi lần đăng nhập là một "máy" riêng; khách chỉ xem/huỷ được đơn đặt từ chính máy đó.
--  * Quán/shipper/nhân viên: Admin xác minh rồi cấp mã kích hoạt, gửi bằng Zalo/SMS từ máy Admin.

ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0;  -- tăng lên để đăng xuất mọi máy đối tác
ALTER TABLE orders ADD COLUMN customer_device VARCHAR(32);           -- máy của khách đã đặt đơn

CREATE TABLE activation_codes (
  user_id    BIGINT PRIMARY KEY REFERENCES users(id),
  code_hash  CHAR(64) NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  issued_by  BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TABLE IF EXISTS otp_codes;
