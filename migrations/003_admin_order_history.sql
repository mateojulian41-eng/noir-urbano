CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status VARCHAR(30) NOT NULL,
  new_status VARCHAR(30) NOT NULL,
  changed_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_status_history_status_check CHECK (
    previous_status IN ('RECEIVED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED')
    AND new_status IN ('RECEIVED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED')
    AND previous_status <> new_status
  )
);

CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx
  ON order_status_history (order_id);

CREATE INDEX IF NOT EXISTS order_status_history_created_at_idx
  ON order_status_history (created_at DESC);

CREATE INDEX IF NOT EXISTS order_status_history_order_created_idx
  ON order_status_history (order_id, created_at DESC);
