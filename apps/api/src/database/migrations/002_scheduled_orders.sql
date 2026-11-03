-- Đơn hẹn giờ & chợ chuyến hẹn — Phần 10.8.
ALTER TABLE stores
  ADD COLUMN slot_capacity INT NOT NULL DEFAULT 4;           -- số đơn hẹn tối đa mỗi khung 15 phút

ALTER TABLE orders
  ADD COLUMN schedule_type           VARCHAR(10),            -- PICKUP (giờ lấy hàng), DELIVERY (giờ nhận hàng)
  ADD COLUMN scheduled_for           TIMESTAMPTZ,            -- giờ khách chọn
  ADD COLUMN scheduled_pickup_at     TIMESTAMPTZ,            -- giờ lấy hàng tại quán (đã quy đổi)
  ADD COLUMN proposed_pickup_at      TIMESTAMPTZ,            -- giờ quán đề xuất
  ADD COLUMN merchant_reply_deadline TIMESTAMPTZ,
  ADD COLUMN merchant_reconfirmed_at TIMESTAMPTZ,
  ADD COLUMN rider_reconfirmed_at    TIMESTAMPTZ,
  ADD COLUMN posted_to_board_at      TIMESTAMPTZ,
  ADD COLUMN board_bonus             BIGINT NOT NULL DEFAULT 0;
CREATE INDEX orders_board_idx ON orders (scheduled_pickup_at) WHERE state = 'HEN_TREN_CHO_CHUYEN';

CREATE TABLE store_capacity_slots (
  store_id   BIGINT NOT NULL REFERENCES stores(id),
  slot_start TIMESTAMPTZ NOT NULL,
  max_orders INT NOT NULL,
  booked     INT NOT NULL DEFAULT 0 CHECK (booked >= 0),
  PRIMARY KEY (store_id, slot_start)
);
