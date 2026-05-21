-- ============================================================
-- ATELIER BY RICHARD — Maturation Stock Management
-- Supabase / PostgreSQL Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. PRODUCTS
-- Configurable product list — not hardcoded in the app.
-- ============================================================
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(4) NOT NULL UNIQUE,         -- SAU, COP, GUA …
  name          TEXT NOT NULL,                       -- Full product name
  category      TEXT NOT NULL CHECK (category IN ('sausage','flat','round','wet','special')),
  drying_days   INTEGER NOT NULL DEFAULT 0,
  has_incubation BOOLEAN NOT NULL DEFAULT FALSE,     -- 48h fermentation step
  has_smoke     BOOLEAN NOT NULL DEFAULT FALSE,      -- Hot smoking step
  has_marinade  BOOLEAN NOT NULL DEFAULT FALSE,      -- Red wine marinade step
  is_nduja      BOOLEAN NOT NULL DEFAULT FALSE,      -- Goes to bulk stock, no maturation
  is_bacon      BOOLEAN NOT NULL DEFAULT FALSE,      -- Slow cook + smoke, no drying
  is_wet        BOOLEAN NOT NULL DEFAULT FALSE,      -- Wet cure (Jambon Blanc)
  target_weight_g INTEGER,                           -- Per-piece target weight (g), NULL = sold by kg
  cost_price_idr  NUMERIC(12,0),                    -- Cost price per kg (IDR)
  sales_price_idr NUMERIC(12,0),                    -- Sales price per kg (IDR)
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. PIGS — Master reception record
-- One row per pig received. Generates the master batch code.
-- ============================================================
CREATE TABLE pigs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix          VARCHAR(5) NOT NULL DEFAULT 'BH',   -- Breed abbreviation
  breed_name      TEXT NOT NULL DEFAULT 'Bangkal Hitam',
  gross_weight_kg NUMERIC(6,1) NOT NULL,
  receiving_date  DATE NOT NULL,
  supplier        TEXT,
  pieces          INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  master_code     TEXT NOT NULL,                       -- e.g. "BH 94.6-20260302" — generated in app
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pigs_date ON pigs(receiving_date DESC);

-- ============================================================
-- 3. BATCHES — Product batch (child of pig)
-- One row per product batch derived from a pig reception.
-- ============================================================
CREATE TABLE batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pig_id          UUID NOT NULL REFERENCES pigs(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  product_code    VARCHAR(4) NOT NULL,
  sequence_num    INTEGER NOT NULL,
  batch_code      TEXT NOT NULL,                       -- e.g. "BH 94.6-20260302-SAU-01"

  -- Physical input
  cut_weight_kg   NUMERIC(8,2) NOT NULL,               -- Raw cut weight entering process
  pieces          INTEGER NOT NULL,
  dimension_cm    NUMERIC(5,1),                        -- Avg thickness (flat) or diameter (round)

  -- Dates
  start_date      DATE NOT NULL,                       -- Day processing begins (Day 01)
  ready_date      DATE,                                -- Calculated ready-for-sale date (set on save)

  -- Running stock (decremented by stock movements and adjustments)
  current_weight_kg  NUMERIC(8,2),                    -- Updated as stock moves out
  current_pieces     INTEGER,                         -- Updated as stock moves out

  status          TEXT NOT NULL DEFAULT 'maturing'
                    CHECK (status IN ('maturing','ready','depleted','discarded')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (pig_id, product_code, sequence_num)
);

CREATE INDEX idx_batches_pig ON batches(pig_id);
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_ready ON batches(ready_date);

-- ============================================================
-- 4. STOCK MOVEMENTS — Sales and internal use
-- Every time stock leaves the drying room.
-- ============================================================
CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,

  -- Type: sale or internal consumption
  movement_type   TEXT NOT NULL CHECK (movement_type IN ('sale','internal')),

  -- Sale sub-type (NULL if internal)
  customer_type   TEXT CHECK (customer_type IN ('b2b','b2c')),

  -- Internal use sub-type (NULL if sale)
  internal_sub_type TEXT CHECK (internal_sub_type IN ('board','tasting','promo')),

  -- Quantities — both fields available, fill whichever applies
  quantity_kg     NUMERIC(8,2),
  quantity_pcs    INTEGER,

  movement_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- At least one quantity must be provided
  CONSTRAINT chk_quantity CHECK (quantity_kg IS NOT NULL OR quantity_pcs IS NOT NULL),
  -- Sale must have customer_type, internal must have sub_type
  CONSTRAINT chk_sale_type CHECK (
    (movement_type = 'sale' AND customer_type IS NOT NULL) OR
    (movement_type = 'internal' AND internal_sub_type IS NOT NULL)
  )
);

CREATE INDEX idx_movements_batch ON stock_movements(batch_id);
CREATE INDEX idx_movements_date ON stock_movements(movement_date DESC);
CREATE INDEX idx_movements_type ON stock_movements(movement_type);

-- ============================================================
-- 5. INVENTORY ADJUSTMENTS — Manual stock corrections
-- Used when a physical count differs from the system.
-- ============================================================
CREATE TABLE inventory_adjustments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,

  previous_weight_kg  NUMERIC(8,2),
  new_weight_kg       NUMERIC(8,2),
  previous_pieces     INTEGER,
  new_pieces          INTEGER,

  reason              TEXT NOT NULL CHECK (reason IN ('count_error','damage','loss','other')),
  notes               TEXT,
  adjustment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adjustments_batch ON inventory_adjustments(batch_id);

-- ============================================================
-- SEED DATA — Initial 20 products
-- ============================================================
INSERT INTO products (code, name, category, drying_days, has_incubation, has_smoke, has_marinade, is_nduja, is_bacon, is_wet, target_weight_g) VALUES

-- Sausage range
('SAU',  'Saucisson',               'sausage', 45, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, 250),
('FIC',  'Ficelle',                 'sausage', 21, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 100),
('BER',  'Bérichon/Herbe',          'sausage', 30, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 150),
('BBQ',  'Béret Basque',            'sausage', 30, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 150),
('PIT',  'Pitina',                  'sausage', 15, TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, 60),
('CHC',  'Chorizo courbe',          'sausage', 30, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 150),
('CHP',  'Chorizo Pamplona',        'sausage', 45, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 250),
('NDU',  'Nduja Salami',            'sausage', 0,  FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, NULL),
('FIN',  'Finocchiona toscane',     'sausage', 45, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, 250),

-- Whole muscle — flat (enter avg thickness in cm)
('GUA',  'Guanciale',               'flat',    21, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, NULL),
('VEN',  'Ventrèche',               'flat',    15, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, NULL),
('LAR',  'Lardo/Rosemary',          'flat',    30, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, NULL),
('SPE',  'Tyrolean Speck',          'flat',    45, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, NULL),
('BAC',  'Smoked Bacon',            'flat',    0,  FALSE, TRUE,  FALSE, FALSE, TRUE,  FALSE, NULL),

-- Whole muscle — round (enter avg diameter in cm)
('COP',  'Coppa',                   'round',   75, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, NULL),
('LON',  'Lonzo',                   'round',   60, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, NULL),
('FIO',  'Fiocco',                  'round',   180,FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, NULL),
('CUL',  'Culatello',               'round',   240,FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, NULL),

-- Special cures
('JBL',  'Jambon Blanc',            'wet',     0,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  NULL),
('JAM',  'Jambon Sec',              'round',   300,FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, NULL);
