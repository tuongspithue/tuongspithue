-- Lược đồ lõi cho MVP — theo Phần 6.2 (đã rút gọn cho bản đầu tiên), 2.1.4a, 10.8.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  phone       VARCHAR(15) UNIQUE NOT NULL,
  full_name   VARCHAR(120),
  status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id  BIGINT NOT NULL REFERENCES users(id),
  role     VARCHAR(30) NOT NULL,           -- CUSTOMER, MERCHANT_OWNER, MERCHANT_STAFF, RIDER, OPS, ADMIN
  scope_id BIGINT NOT NULL DEFAULT 0,      -- store_id cho vai trò quán
  PRIMARY KEY (user_id, role, scope_id)
);

CREATE TABLE otp_codes (
  phone      VARCHAR(15) PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE stores (
  id                    BIGSERIAL PRIMARY KEY,
  owner_user_id         BIGINT NOT NULL REFERENCES users(id),
  name                  VARCHAR(160) NOT NULL,
  category              VARCHAR(40) NOT NULL,
  location              GEOGRAPHY(POINT, 4326) NOT NULL,
  address_text          TEXT NOT NULL,
  phone                 VARCHAR(15) NOT NULL,
  delivery_mode         VARCHAR(20) NOT NULL DEFAULT 'PLATFORM',
  delivery_radius_m     INT NOT NULL DEFAULT 5000,
  prep_time_default_min INT NOT NULL DEFAULT 15,
  commission_bps        INT NOT NULL DEFAULT 1200,
  is_open               BOOLEAN NOT NULL DEFAULT false,
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stores_location_gix ON stores USING GIST (location);

CREATE TABLE menu_items (
  id             BIGSERIAL PRIMARY KEY,
  store_id       BIGINT NOT NULL REFERENCES stores(id),
  section        VARCHAR(80),
  name           VARCHAR(160) NOT NULL,
  description    TEXT,
  price          BIGINT NOT NULL CHECK (price >= 0),
  is_available   BOOLEAN NOT NULL DEFAULT true,
  quick_notes    TEXT[] NOT NULL DEFAULT '{}',
  notes_disabled BOOLEAN NOT NULL DEFAULT false,
  sort_order     INT NOT NULL DEFAULT 0
);
CREATE INDEX menu_items_store_idx ON menu_items (store_id);

CREATE TABLE riders (
  user_id      BIGINT PRIMARY KEY REFERENCES users(id),
  rider_type   VARCHAR(20) NOT NULL DEFAULT 'PLATFORM',   -- PLATFORM, STORE
  vehicle_type VARCHAR(20) NOT NULL DEFAULT 'MOTORBIKE',
  plate_number VARCHAR(20),
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',    -- PENDING, APPROVED, SUSPENDED
  cod_limit    BIGINT NOT NULL DEFAULT 2000000,
  cod_balance  BIGINT NOT NULL DEFAULT 0,
  is_online    BOOLEAN NOT NULL DEFAULT false,
  location     GEOGRAPHY(POINT, 4326),
  location_at  TIMESTAMPTZ
);
CREATE INDEX riders_location_gix ON riders USING GIST (location);

CREATE TABLE orders (
  id                BIGSERIAL PRIMARY KEY,
  code              VARCHAR(12) UNIQUE NOT NULL,
  customer_id       BIGINT NOT NULL REFERENCES users(id),
  store_id          BIGINT NOT NULL REFERENCES stores(id),
  state             VARCHAR(40) NOT NULL,
  prep_state        VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',  -- NOT_STARTED, PREPARING, READY
  delivery_mode     VARCHAR(20) NOT NULL,                        -- PLATFORM, SELF_PICKUP
  is_scheduled      BOOLEAN NOT NULL DEFAULT false,
  dropoff_location  GEOGRAPHY(POINT, 4326),
  dropoff_address   TEXT,
  dropoff_note      TEXT,
  recipient_name    VARCHAR(120),
  recipient_phone   VARCHAR(15),
  order_note        VARCHAR(200),
  distance_m        INT,
  subtotal          BIGINT NOT NULL,
  delivery_fee      BIGINT NOT NULL,
  service_fee       BIGINT NOT NULL,
  total             BIGINT NOT NULL,
  payment_method    VARCHAR(20) NOT NULL,
  has_allergens     BOOLEAN NOT NULL DEFAULT false,
  allergy_ack_by    BIGINT REFERENCES users(id),
  allergy_ack_at    TIMESTAMPTZ,
  prep_time_min     INT,
  accepted_by       BIGINT REFERENCES users(id),
  accepted_channel  VARCHAR(10),                 -- APP, IVR, OPS_CALL (không có AUTO)
  accepted_at       TIMESTAMPTZ,
  rider_id          BIGINT REFERENCES riders(user_id),
  rider_accepted_at TIMESTAMPTZ,
  delivery_pin      VARCHAR(4),
  proof_photo_url   TEXT,
  flags             TEXT[] NOT NULL DEFAULT '{}', -- VD GEOFENCE_OVERRIDE để hậu kiểm
  cancel_reason     VARCHAR(60),
  cancelled_by_role VARCHAR(20),
  refund_kind       VARCHAR(30),
  version           INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_store_state_idx ON orders (store_id, state);
CREATE INDEX orders_rider_state_idx ON orders (rider_id, state);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);

CREATE TABLE order_items (
  id                  BIGSERIAL PRIMARY KEY,
  order_id            BIGINT NOT NULL REFERENCES orders(id),
  item_id             BIGINT NOT NULL REFERENCES menu_items(id),
  name_snapshot       VARCHAR(160) NOT NULL,
  unit_price          BIGINT NOT NULL,
  quantity            INT NOT NULL CHECK (quantity > 0),
  note                VARCHAR(150),
  note_tags           TEXT[] NOT NULL DEFAULT '{}',
  allergens           TEXT[] NOT NULL DEFAULT '{}',
  substitution_policy VARCHAR(20) NOT NULL DEFAULT 'CONTACT_ME'
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

-- Nhật ký sự kiện bất biến (append-only)
CREATE TABLE order_events (
  id         BIGSERIAL PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(id),
  from_state VARCHAR(40),
  to_state   VARCHAR(40) NOT NULL,
  event      VARCHAR(40) NOT NULL,
  actor_id   BIGINT,
  actor_role VARCHAR(20) NOT NULL,
  channel    VARCHAR(10) NOT NULL,
  location   GEOGRAPHY(POINT, 4326),
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, id);

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'order_events là nhật ký bất biến, không được sửa hoặc xoá';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER order_events_immutable BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE dispatch_offers (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(id),
  rider_id     BIGINT NOT NULL REFERENCES riders(user_id),
  wave         SMALLINT NOT NULL,
  distance_m   INT NOT NULL,
  earning      BIGINT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'SENT',  -- SENT, ACCEPTED, DECLINED, EXPIRED, SUPERSEDED
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ
);
CREATE INDEX dispatch_offers_rider_idx ON dispatch_offers (rider_id, status);
CREATE INDEX dispatch_offers_order_idx ON dispatch_offers (order_id);

-- Hàng đợi việc hẹn giờ bền vững (SLA Cổng A/B). Worker lấy bằng FOR UPDATE SKIP LOCKED.
CREATE TABLE scheduled_jobs (
  id         BIGSERIAL PRIMARY KEY,
  kind       VARCHAR(40) NOT NULL,
  order_id   BIGINT REFERENCES orders(id),
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_at     TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, DONE, FAILED
  attempts   INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_jobs_due_idx ON scheduled_jobs (run_at) WHERE status = 'PENDING';

CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id),
  channel    VARCHAR(10) NOT NULL,     -- PUSH, SMS, ZNS, IVR
  template   VARCHAR(60) NOT NULL,
  payload    JSONB NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outbox: thay đổi đơn + sự kiện ghi cùng một transaction (Phần 5.6)
CREATE TABLE outbox (
  id           BIGSERIAL PRIMARY KEY,
  aggregate    VARCHAR(30) NOT NULL,
  aggregate_id BIGINT NOT NULL,
  event_type   VARCHAR(60) NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE idempotency_keys (
  key         VARCHAR(80) NOT NULL,
  user_id     BIGINT NOT NULL,
  route       VARCHAR(120) NOT NULL,
  status_code INT NOT NULL,
  response    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route, key)
);
