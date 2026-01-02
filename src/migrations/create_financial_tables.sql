-- =====================================================
-- Financial Dashboard Tables Migration
-- Run this script on production database to create
-- all tables needed for the financial dashboard feature
-- =====================================================

-- Create ENUM types for home categories if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_home_category') THEN
        CREATE TYPE enum_home_category AS ENUM ('arbitrage', 'home_owned', 'pm', 'shared', 'unrelated');
    END IF;
END$$;

-- =====================================================
-- 1. PROPERTY CATEGORIES TABLE
-- Assigns properties to home categories for financial tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS property_categories (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL UNIQUE,
    home_category enum_home_category NOT NULL,
    bank_account_id VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for property_categories
CREATE INDEX IF NOT EXISTS idx_property_categories_property_id ON property_categories(property_id);
CREATE INDEX IF NOT EXISTS idx_property_categories_home_category ON property_categories(home_category);
CREATE INDEX IF NOT EXISTS idx_property_categories_bank_account_id ON property_categories(bank_account_id);

-- Comments for documentation
COMMENT ON TABLE property_categories IS 'Assigns properties to home categories for financial dashboard tracking';
COMMENT ON COLUMN property_categories.property_id IS 'Reference to the property (from listings table)';
COMMENT ON COLUMN property_categories.home_category IS 'Category: arbitrage, home_owned, pm, shared, or unrelated';
COMMENT ON COLUMN property_categories.bank_account_id IS 'Associated bank account ID for this property';

-- =====================================================
-- 2. QB CATEGORY MAPPINGS TABLE
-- Maps QuickBooks accounts to our expense categories
-- =====================================================
CREATE TABLE IF NOT EXISTS qb_category_mappings (
    id SERIAL PRIMARY KEY,
    qb_account_id VARCHAR(100) NOT NULL,
    qb_account_name VARCHAR(255) NOT NULL,
    expense_category VARCHAR(100) NOT NULL,
    home_category enum_home_category,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    department VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(qb_account_id, home_category)
);

-- Indexes for qb_category_mappings
CREATE INDEX IF NOT EXISTS idx_qb_category_mappings_qb_account_id ON qb_category_mappings(qb_account_id);
CREATE INDEX IF NOT EXISTS idx_qb_category_mappings_expense_category ON qb_category_mappings(expense_category);
CREATE INDEX IF NOT EXISTS idx_qb_category_mappings_home_category ON qb_category_mappings(home_category);
CREATE INDEX IF NOT EXISTS idx_qb_category_mappings_is_shared ON qb_category_mappings(is_shared);
CREATE INDEX IF NOT EXISTS idx_qb_category_mappings_is_active ON qb_category_mappings(is_active);

-- Comments for documentation
COMMENT ON TABLE qb_category_mappings IS 'Maps QuickBooks accounts to internal expense categories for financial reporting';
COMMENT ON COLUMN qb_category_mappings.qb_account_id IS 'QuickBooks account ID';
COMMENT ON COLUMN qb_category_mappings.qb_account_name IS 'QuickBooks account display name';
COMMENT ON COLUMN qb_category_mappings.expense_category IS 'Internal expense category (e.g., utilities, maintenance, cleaning)';
COMMENT ON COLUMN qb_category_mappings.home_category IS 'Which home category this mapping applies to (NULL means all)';
COMMENT ON COLUMN qb_category_mappings.is_shared IS 'Whether this expense is shared across multiple properties';
COMMENT ON COLUMN qb_category_mappings.department IS 'Department classification for this expense';

-- =====================================================
-- 3. FINANCIAL CACHE TABLE
-- Caches monthly financial data per property for performance
-- =====================================================
CREATE TABLE IF NOT EXISTS financial_cache (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL,
    month DATE NOT NULL,
    revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
    expenses DECIMAL(12, 2) NOT NULL DEFAULT 0,
    net_income DECIMAL(12, 2) NOT NULL DEFAULT 0,
    occupancy_rate DECIMAL(5, 2),
    reservation_count INTEGER DEFAULT 0,
    average_daily_rate DECIMAL(10, 2),
    revenue_breakdown JSONB,
    expense_breakdown JSONB,
    metadata JSONB,
    cache_version INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, month)
);

-- Indexes for financial_cache
CREATE INDEX IF NOT EXISTS idx_financial_cache_property_id ON financial_cache(property_id);
CREATE INDEX IF NOT EXISTS idx_financial_cache_month ON financial_cache(month);
CREATE INDEX IF NOT EXISTS idx_financial_cache_property_month ON financial_cache(property_id, month);
CREATE INDEX IF NOT EXISTS idx_financial_cache_expires_at ON financial_cache(expires_at);

-- Comments for documentation
COMMENT ON TABLE financial_cache IS 'Caches monthly financial data per property for dashboard performance';
COMMENT ON COLUMN financial_cache.property_id IS 'Reference to the property';
COMMENT ON COLUMN financial_cache.month IS 'First day of the month this cache entry represents';
COMMENT ON COLUMN financial_cache.revenue IS 'Total revenue for the month';
COMMENT ON COLUMN financial_cache.expenses IS 'Total expenses for the month';
COMMENT ON COLUMN financial_cache.net_income IS 'Net income (revenue - expenses)';
COMMENT ON COLUMN financial_cache.occupancy_rate IS 'Occupancy rate as percentage (0-100)';
COMMENT ON COLUMN financial_cache.reservation_count IS 'Number of reservations in this month';
COMMENT ON COLUMN financial_cache.average_daily_rate IS 'Average daily rate for the month';
COMMENT ON COLUMN financial_cache.revenue_breakdown IS 'Detailed revenue breakdown by source (JSON)';
COMMENT ON COLUMN financial_cache.expense_breakdown IS 'Detailed expense breakdown by category (JSON)';
COMMENT ON COLUMN financial_cache.metadata IS 'Additional metadata for the cache entry';
COMMENT ON COLUMN financial_cache.cache_version IS 'Version number for cache invalidation';
COMMENT ON COLUMN financial_cache.expires_at IS 'When this cache entry should be refreshed';

-- =====================================================
-- TRIGGER FUNCTION: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all new tables
DROP TRIGGER IF EXISTS update_property_categories_updated_at ON property_categories;
CREATE TRIGGER update_property_categories_updated_at
    BEFORE UPDATE ON property_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_qb_category_mappings_updated_at ON qb_category_mappings;
CREATE TRIGGER update_qb_category_mappings_updated_at
    BEFORE UPDATE ON qb_category_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_financial_cache_updated_at ON financial_cache;
CREATE TRIGGER update_financial_cache_updated_at
    BEFORE UPDATE ON financial_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VERIFICATION QUERIES
-- Run these to verify tables were created correctly
-- =====================================================
-- SELECT * FROM property_categories LIMIT 10;
-- SELECT * FROM qb_category_mappings LIMIT 10;
-- SELECT * FROM financial_cache LIMIT 10;
-- SELECT COUNT(*) FROM property_categories;
-- SELECT COUNT(*) FROM qb_category_mappings;
-- SELECT COUNT(*) FROM financial_cache;

-- View all enum values
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'enum_home_category'::regtype;
