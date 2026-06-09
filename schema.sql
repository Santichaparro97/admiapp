-- =====================================================================
-- SCHEMA SQL para Supabase — DE LA OSTIA PERFUMES
-- =====================================================================
-- Pegá TODO esto en el SQL Editor de Supabase y corré "Run".
-- Si lo corres por segunda vez es seguro: usa IF NOT EXISTS y CREATE OR REPLACE.

-- =====================================================================
-- 1. TABLA: products
-- =====================================================================
CREATE TABLE IF NOT EXISTS products (
  id              BIGSERIAL PRIMARY KEY,
  legacy_id       TEXT UNIQUE,                 -- ID original de Pency, para migración
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE,
  category        TEXT NOT NULL,
  brand           TEXT,
  description     TEXT DEFAULT '',
  price           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  original_price  NUMERIC(12, 2) DEFAULT 0,     -- precio sin oferta (tachado)
  stock           INTEGER DEFAULT 0,
  handle_stock    BOOLEAN DEFAULT true,
  images          TEXT[] DEFAULT '{}',          -- array de URLs
  featured        BOOLEAN DEFAULT false,
  active          BOOLEAN DEFAULT true,         -- visible en la tienda
  position        INTEGER DEFAULT 0,            -- orden
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_legacy   ON products(legacy_id);

-- =====================================================================
-- 2. TABLA: orders
-- =====================================================================
CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  order_number    TEXT UNIQUE NOT NULL,          -- ej: ORD-2026-0001
  customer_name   TEXT,
  customer_phone  TEXT,
  customer_email  TEXT,
  items           JSONB NOT NULL,                -- [{id, title, price, qty, image}]
  subtotal        NUMERIC(12, 2) NOT NULL,
  shipping        NUMERIC(12, 2) DEFAULT 0,
  total           NUMERIC(12, 2) NOT NULL,
  status          TEXT DEFAULT 'pendiente',      -- pendiente, en_proceso, enviado, entregado, cancelado
  payment_method  TEXT DEFAULT 'whatsapp',       -- whatsapp, transferencia, efectivo, mercadopago
  shipping_method TEXT,                          -- punto_encuentro, envio_domicilio
  shipping_address TEXT,
  notes           TEXT,
  whatsapp_sent   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_number     ON orders(order_number);

-- Función para generar order_number tipo ORD-YYYYMMDD-NNNN
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  d_part TEXT := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYYMMDD');
  seq_part INT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_part
  FROM orders
  WHERE order_number LIKE 'ORD-' || d_part || '-%';
  RETURN 'ORD-' || d_part || '-' || lpad(seq_part::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Auto-asignar order_number al insertar
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_number ON orders;
CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- =====================================================================
-- 3. TABLA: settings (config general de la tienda)
-- =====================================================================
CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           JSONB,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Settings iniciales
INSERT INTO settings (key, value) VALUES
  ('phone',        '"541134304237"'),
  ('title',        '"De La Ostia Perfumes"'),
  ('tagline',      '"Perfumería online de réplicas premium"'),
  ('highlight',    '"Envíos a todo el país · Puntos de encuentro en Zona Norte"'),
  ('instagram',    '"dlo_perfumeria"'),
  ('whatsapp_msg', '"Hola! Quería consultar por precios mayoristas."')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- 4. TRIGGERS: updated_at automático
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 5. RLS (Row Level Security) — protege la DB
-- =====================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Productos: cualquiera puede LEER (la tienda muestra productos), solo admin puede ESCRIBIR
DROP POLICY IF EXISTS products_select_public ON products;
CREATE POLICY products_select_public
  ON products FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS products_all_authenticated ON products;
CREATE POLICY products_all_authenticated
  ON products FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Pedidos: cualquiera puede CREAR (la tienda guarda pedidos), solo admin puede LEER/EDITAR
DROP POLICY IF EXISTS orders_insert_public ON orders;
CREATE POLICY orders_insert_public
  ON orders FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS orders_all_authenticated ON orders;
CREATE POLICY orders_all_authenticated
  ON orders FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Settings: cualquiera puede LEER, solo admin escribir
DROP POLICY IF EXISTS settings_select_public ON settings;
CREATE POLICY settings_select_public
  ON settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS settings_all_authenticated ON settings;
CREATE POLICY settings_all_authenticated
  ON settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =====================================================================
-- 6. VISTA: estadísticas rápidas para el dashboard del admin
-- =====================================================================
CREATE OR REPLACE VIEW admin_stats AS
SELECT
  (SELECT COUNT(*) FROM products WHERE active = true)   AS total_products,
  (SELECT COUNT(*) FROM products WHERE stock > 0)       AS in_stock_products,
  (SELECT COUNT(*) FROM products WHERE handle_stock = true AND stock <= 0) AS out_of_stock,
  (SELECT COUNT(*) FROM orders WHERE status = 'pendiente')   AS pending_orders,
  (SELECT COUNT(*) FROM orders WHERE created_at > now() - interval '7 days') AS orders_week,
  (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status NOT IN ('cancelado') AND created_at > now() - interval '30 days') AS revenue_30d;
