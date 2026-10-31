-- Trung tâm cấu hình phân tầng (Phần 14.6), phân quyền chức năng & điều chỉnh cấp (Phần 15),
-- kết nối AI do Admin nhập (Phần 12.8), nhật ký thao tác nội bộ (Phần 14.9). Mức MVP.

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Bảng % là nhật ký bất biến, không được sửa hoặc xoá', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE config_values (
  id          BIGSERIAL PRIMARY KEY,
  key         VARCHAR(100) NOT NULL,
  scope_type  VARCHAR(20) NOT NULL,              -- GLOBAL, CATEGORY, STORE
  scope_id    VARCHAR(60) NOT NULL DEFAULT '',
  value       JSONB NOT NULL,
  version     INT NOT NULL,
  status      VARCHAR(20) NOT NULL,              -- ACTIVE, SUPERSEDED, ROLLED_BACK
  reason      TEXT NOT NULL,
  created_by  BIGINT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, scope_type, scope_id, version)
);
CREATE UNIQUE INDEX config_values_active_idx ON config_values (key, scope_type, scope_id) WHERE status = 'ACTIVE';

CREATE TABLE user_entitlements (
  id           BIGSERIAL PRIMARY KEY,
  subject_type VARCHAR(10) NOT NULL,             -- CUSTOMER, STORE, RIDER
  subject_id   BIGINT NOT NULL,
  key          VARCHAR(80) NOT NULL,
  value        JSONB NOT NULL,
  reason_code  VARCHAR(40) NOT NULL,
  note         TEXT,
  effective_to TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, REVOKED
  created_by   BIGINT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_entitlements_subject_idx ON user_entitlements (subject_type, subject_id) WHERE status = 'ACTIVE';

CREATE TABLE tier_overrides (
  id           BIGSERIAL PRIMARY KEY,
  subject_type VARCHAR(10) NOT NULL,             -- STORE, RIDER
  subject_id   BIGINT NOT NULL,
  action       VARCHAR(20) NOT NULL,             -- SET_TIER, LOCK
  tier         VARCHAR(12),
  reason_code  VARCHAR(40) NOT NULL,
  note         TEXT,
  effective_to TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by   BIGINT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tier_overrides_subject_idx ON tier_overrides (subject_type, subject_id) WHERE status = 'ACTIVE';

CREATE TABLE labels (
  id                 BIGSERIAL PRIMARY KEY,
  name               VARCHAR(80) UNIQUE NOT NULL,
  subject_type       VARCHAR(10) NOT NULL,
  visible_to_subject BOOLEAN NOT NULL DEFAULT false,
  created_by         BIGINT NOT NULL REFERENCES users(id)
);
CREATE TABLE user_labels (
  label_id     BIGINT NOT NULL REFERENCES labels(id),
  subject_type VARCHAR(10) NOT NULL,
  subject_id   BIGINT NOT NULL,
  added_by     BIGINT NOT NULL REFERENCES users(id),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  PRIMARY KEY (label_id, subject_type, subject_id)
);

CREATE TABLE ai_providers (
  id             BIGSERIAL PRIMARY KEY,
  code           VARCHAR(40) UNIQUE NOT NULL,
  display_name   VARCHAR(80) NOT NULL,
  base_url       TEXT NOT NULL,
  api_key_enc    TEXT,                           -- AES-256-GCM, không bao giờ trả ra API
  key_last4      VARCHAR(4),
  key_rotated_at TIMESTAMPTZ,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  last_check     JSONB,
  version        INT NOT NULL DEFAULT 1,
  updated_by     BIGINT REFERENCES users(id)
);
INSERT INTO ai_providers (code, display_name, base_url, is_default) VALUES ('groq', 'Groq', 'https://api.groq.com/openai/v1', true);

CREATE TABLE ai_task_configs (
  task                 VARCHAR(40) PRIMARY KEY,
  provider_id          BIGINT REFERENCES ai_providers(id),
  model                VARCHAR(120),
  params               JSONB NOT NULL DEFAULT '{}'::jsonb,
  fallback_provider_id BIGINT REFERENCES ai_providers(id),
  fallback_model       VARCHAR(120),
  enabled              BOOLEAN NOT NULL DEFAULT false,
  version              INT NOT NULL DEFAULT 1,
  updated_by           BIGINT REFERENCES users(id)
);
INSERT INTO ai_task_configs (task, provider_id, params)
SELECT t.task, p.id, t.params::jsonb FROM ai_providers p,
  (VALUES ('assistant_chat', '{"timeout_ms":4000,"max_tokens":600}'),
          ('extract_json', '{"timeout_ms":2000}'),
          ('moderation', '{"timeout_ms":1500}'),
          ('summarize_review', '{"timeout_ms":5000}'),
          ('speech_to_text', '{"language":"vi"}')) AS t(task, params)
WHERE p.code = 'groq';

CREATE TABLE admin_audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT NOT NULL REFERENCES users(id),
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id   VARCHAR(80) NOT NULL,
  before      JSONB,
  after       JSONB,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER admin_audit_logs_immutable BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
