-- Đánh giá & điểm uy tín v1 — Phần 11.8, 2.1.7.
CREATE TABLE reviews (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id),
  author_id   BIGINT NOT NULL REFERENCES users(id),
  target_type VARCHAR(10) NOT NULL,            -- STORE, RIDER
  target_id   BIGINT NOT NULL,
  stars       SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags        TEXT[] NOT NULL DEFAULT '{}',
  comment     VARCHAR(500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, target_type)
);
CREATE INDEX reviews_target_idx ON reviews (target_type, target_id, created_at DESC);

CREATE TABLE trust_scores (
  subject_type VARCHAR(10) NOT NULL,           -- STORE, RIDER
  subject_id   BIGINT NOT NULL,
  score        NUMERIC(5,2) NOT NULL,
  tier         VARCHAR(12) NOT NULL,           -- DIAMOND, GOLD, SILVER, BRONZE, ROOKIE, IMPROVE
  components   JSONB NOT NULL,
  completed    INT NOT NULL DEFAULT 0,
  stars        NUMERIC(3,2),
  review_count INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_type, subject_id)
);
