-- Mật khẩu cho tài khoản Admin/Ops (Phần 13.9): đăng nhập Admin Console bằng SĐT + mật khẩu.
-- Quán/shipper/khách không dùng mật khẩu. Sai 5 lần thì khoá đăng nhập bằng mật khẩu 15 phút.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_failed INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_locked_until TIMESTAMPTZ;
