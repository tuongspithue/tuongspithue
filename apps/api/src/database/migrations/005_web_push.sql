-- Thông báo đẩy qua trình duyệt (Web Push, chuẩn VAPID) — miễn phí, thay cho SMS/ZNS/IVR trả phí.
CREATE TABLE push_subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  app        VARCHAR(20) NOT NULL,            -- CUSTOMER, MERCHANT, RIDER, ADMIN
  endpoint   TEXT UNIQUE NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at TIMESTAMPTZ
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

ALTER TABLE notifications ADD COLUMN sent_at TIMESTAMPTZ, ADD COLUMN result TEXT;
CREATE INDEX notifications_queued_idx ON notifications (id) WHERE status = 'QUEUED';
