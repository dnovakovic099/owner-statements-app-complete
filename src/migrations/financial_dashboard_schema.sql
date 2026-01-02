-- =====================================================
-- Financial Dashboard Schema Migration
--
-- Comprehensive schema for property management financial tracking
-- Supports three home categories with distinct revenue/cost structures:
--   - Property Management (PM): Revenue (PM Income, Claims) vs Costs
--   - Arbitrage: Revenue (Rent) vs Costs (Rent, Utilities, etc.)
--   - Home Owned: Revenue (Rent) vs Costs (Mortgage, Utilities, etc.)
--
-- Also handles shared costs: Employee pay, Software, Refunds, Chargebacks
-- =====================================================

-- Start transaction for atomic migration
BEGIN;

-- =====================================================
-- ENUM TYPES
-- =====================================================

-- Home category enum (extend existing if needed)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_home_category') THEN
        CREATE TYPE enum_home_category AS ENUM (
            'pm',           -- Property Management
            'arbitrage',    -- Arbitrage properties
            'home_owned',   -- Owned properties
            'shared',       -- Shared costs (employees, software, etc.)
            'unrelated'     -- Unrelated to property operations
        );
    END IF;
END$$;

-- Transaction type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_transaction_type') THEN
        CREATE TYPE enum_transaction_type AS ENUM (
            'revenue',
            'expense'
        );
    END IF;
END$$;

-- Revenue category enum - specific to each home category
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_revenue_category') THEN
        CREATE TYPE enum_revenue_category AS ENUM (
            -- PM Revenue
            'pm_income',            -- Property management fees
            'pm_claims',            -- Insurance claims, damage claims

            -- Arbitrage Revenue
            'arb_rental_income',    -- Guest payments

            -- Home Owned Revenue
            'owned_rental_income',  -- Guest payments for owned properties

            -- General
            'other_income'          -- Miscellaneous income
        );
    END IF;
END$$;

-- Expense category enum - specific to each home category
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_expense_category') THEN
        CREATE TYPE enum_expense_category AS ENUM (
            -- PM Costs
            'pm_ads',               -- Advertising for PM
            'pm_sales_commission',  -- Sales commissions
            'pm_onboarding',        -- Onboarding costs
            'pm_photography',       -- Property photography
            'pm_churn',             -- Churn-related costs

            -- Arbitrage Costs
            'arb_rent',             -- Monthly rent payments
            'arb_utilities',        -- Utilities
            'arb_cleaning',         -- Cleaning services
            'arb_maintenance',      -- Maintenance and repairs

            -- Home Owned Costs
            'owned_mortgage',       -- Mortgage payments
            'owned_utilities',      -- Utilities
            'owned_cleaning',       -- Cleaning services
            'owned_maintenance',    -- Maintenance and repairs
            'owned_property_tax',   -- Property taxes
            'owned_insurance',      -- Property insurance
            'owned_hoa',            -- HOA fees

            -- Shared Costs (apply across categories)
            'shared_payroll',       -- Employee pay
            'shared_software',      -- Software subscriptions
            'shared_refunds',       -- Guest refunds
            'shared_chargebacks',   -- Payment chargebacks
            'shared_office',        -- Office expenses
            'shared_professional',  -- Professional services (legal, accounting)

            -- General
            'other_expense'         -- Miscellaneous expenses
        );
    END IF;
END$$;

-- Department enum for shared costs allocation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_department') THEN
        CREATE TYPE enum_department AS ENUM (
            'operations',       -- Day-to-day operations
            'sales',            -- Sales and business development
            'marketing',        -- Marketing and advertising
            'customer_service', -- Guest/owner support
            'maintenance',      -- Property maintenance
            'finance',          -- Accounting and finance
            'executive',        -- Management/executive
            'general'           -- General/unallocated
        );
    END IF;
END$$;

-- =====================================================
-- 1. PROPERTIES TABLE
-- Core property information with category assignment
-- =====================================================
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE,           -- External system ID (Hostify, etc.)
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',

    -- Category assignment
    home_category enum_home_category NOT NULL DEFAULT 'unrelated',

    -- Financial details
    bank_account_id VARCHAR(100),              -- Associated bank account
    monthly_rent DECIMAL(12, 2),               -- For arbitrage: monthly rent obligation
    mortgage_payment DECIMAL(12, 2),           -- For owned: monthly mortgage
    purchase_price DECIMAL(14, 2),             -- For owned: purchase price (ROI calc)

    -- Property metadata
    bedrooms INTEGER,
    bathrooms DECIMAL(3, 1),
    square_feet INTEGER,
    max_guests INTEGER,

    -- QuickBooks mapping
    qb_customer_id VARCHAR(100),               -- QuickBooks customer ID
    qb_class_id VARCHAR(100),                  -- QuickBooks class for tracking

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    activation_date DATE,
    deactivation_date DATE,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_category_rent CHECK (
        (home_category != 'arbitrage') OR (monthly_rent IS NOT NULL)
    )
);

-- Indexes for properties
CREATE INDEX IF NOT EXISTS idx_properties_external_id ON properties(external_id);
CREATE INDEX IF NOT EXISTS idx_properties_home_category ON properties(home_category);
CREATE INDEX IF NOT EXISTS idx_properties_is_active ON properties(is_active);
CREATE INDEX IF NOT EXISTS idx_properties_qb_customer_id ON properties(qb_customer_id);
CREATE INDEX IF NOT EXISTS idx_properties_bank_account_id ON properties(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_properties_city_state ON properties(city, state);

COMMENT ON TABLE properties IS 'Core property table with category assignment for financial tracking';

-- =====================================================
-- 2. EXPENSE CATEGORIES TABLE
-- Master list of expense categories with metadata
-- =====================================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,          -- Internal code (e.g., 'arb_rent')
    name VARCHAR(100) NOT NULL,                -- Display name
    description TEXT,

    -- Category relationships
    home_category enum_home_category,          -- Which home category this applies to (NULL = all)
    expense_type enum_expense_category NOT NULL,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,  -- Is this a shared cost?

    -- Allocation settings for shared costs
    allocation_method VARCHAR(50),             -- How to allocate: 'equal', 'revenue_ratio', 'property_count', 'manual'
    default_allocation JSONB,                  -- Default allocation percentages by category

    -- QuickBooks mapping
    qb_account_ids TEXT[],                     -- Array of QB account IDs that map to this category

    -- Display settings
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for expense_categories
CREATE INDEX IF NOT EXISTS idx_expense_categories_home_category ON expense_categories(home_category);
CREATE INDEX IF NOT EXISTS idx_expense_categories_expense_type ON expense_categories(expense_type);
CREATE INDEX IF NOT EXISTS idx_expense_categories_is_shared ON expense_categories(is_shared);
CREATE INDEX IF NOT EXISTS idx_expense_categories_is_active ON expense_categories(is_active);

COMMENT ON TABLE expense_categories IS 'Master list of expense categories with QB mapping and allocation rules';

-- =====================================================
-- 3. REVENUE CATEGORIES TABLE
-- Master list of revenue categories with metadata
-- =====================================================
CREATE TABLE IF NOT EXISTS revenue_categories (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,          -- Internal code
    name VARCHAR(100) NOT NULL,                -- Display name
    description TEXT,

    -- Category relationships
    home_category enum_home_category,          -- Which home category this applies to
    revenue_type enum_revenue_category NOT NULL,

    -- QuickBooks mapping
    qb_account_ids TEXT[],                     -- Array of QB account IDs that map to this category

    -- Display settings
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for revenue_categories
CREATE INDEX IF NOT EXISTS idx_revenue_categories_home_category ON revenue_categories(home_category);
CREATE INDEX IF NOT EXISTS idx_revenue_categories_revenue_type ON revenue_categories(revenue_type);
CREATE INDEX IF NOT EXISTS idx_revenue_categories_is_active ON revenue_categories(is_active);

COMMENT ON TABLE revenue_categories IS 'Master list of revenue categories with QB mapping';

-- =====================================================
-- 4. TRANSACTIONS TABLE
-- All financial transactions with QuickBooks mapping
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,

    -- Transaction identification
    transaction_type enum_transaction_type NOT NULL,
    transaction_date DATE NOT NULL,

    -- Property relationship (NULL for shared costs)
    property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,

    -- Category assignment
    home_category enum_home_category NOT NULL,
    expense_category_id INTEGER REFERENCES expense_categories(id),
    revenue_category_id INTEGER REFERENCES revenue_categories(id),

    -- Financial data
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Transaction details
    description TEXT,
    vendor_name VARCHAR(255),
    customer_name VARCHAR(255),
    reference_number VARCHAR(100),

    -- Source tracking
    source_system VARCHAR(50),                 -- 'quickbooks', 'hostify', 'manual', etc.
    source_id VARCHAR(100),                    -- ID in source system

    -- QuickBooks mapping
    qb_transaction_id VARCHAR(100),            -- QuickBooks transaction ID
    qb_transaction_type VARCHAR(50),           -- QB type: Invoice, Bill, Payment, etc.
    qb_account_id VARCHAR(100),                -- QB account ID
    qb_account_name VARCHAR(255),              -- QB account name
    qb_class_id VARCHAR(100),                  -- QB class ID
    qb_customer_id VARCHAR(100),               -- QB customer ID
    qb_vendor_id VARCHAR(100),                 -- QB vendor ID

    -- For reservations
    reservation_id VARCHAR(100),               -- Link to reservation
    check_in_date DATE,
    check_out_date DATE,
    nights INTEGER,

    -- Shared cost allocation
    is_shared_cost BOOLEAN DEFAULT FALSE,
    department enum_department,
    allocation_basis VARCHAR(50),              -- How this was allocated
    parent_transaction_id INTEGER REFERENCES transactions(id), -- For allocated portions

    -- Status
    is_voided BOOLEAN DEFAULT FALSE,
    voided_at TIMESTAMP WITH TIME ZONE,
    voided_reason TEXT,

    -- Metadata
    metadata JSONB,                            -- Additional flexible data

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE,        -- Last sync with QuickBooks

    -- Constraints
    CONSTRAINT valid_category_reference CHECK (
        (transaction_type = 'expense' AND expense_category_id IS NOT NULL) OR
        (transaction_type = 'revenue' AND revenue_category_id IS NOT NULL)
    ),
    CONSTRAINT valid_shared_cost CHECK (
        (is_shared_cost = FALSE) OR (property_id IS NULL)
    )
);

-- Indexes for transactions - optimized for common query patterns
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_date_desc ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_property_id ON transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_home_category ON transactions(home_category);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_expense_category ON transactions(expense_category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_revenue_category ON transactions(revenue_category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_qb_transaction_id ON transactions(qb_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_qb_account_id ON transactions(qb_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reservation ON transactions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_transactions_is_shared ON transactions(is_shared_cost);
CREATE INDEX IF NOT EXISTS idx_transactions_department ON transactions(department);
CREATE INDEX IF NOT EXISTS idx_transactions_is_voided ON transactions(is_voided);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_property_date ON transactions(property_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(home_category, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(transaction_type, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_property_type_date ON transactions(property_id, transaction_type, transaction_date);

-- Partial index for active (non-voided) transactions
CREATE INDEX IF NOT EXISTS idx_transactions_active ON transactions(transaction_date, home_category)
    WHERE is_voided = FALSE;

COMMENT ON TABLE transactions IS 'All financial transactions with QuickBooks mapping and shared cost tracking';

-- =====================================================
-- 5. SHARED COSTS TABLE
-- Dedicated table for tracking and allocating shared costs
-- =====================================================
CREATE TABLE IF NOT EXISTS shared_costs (
    id SERIAL PRIMARY KEY,

    -- Cost identification
    cost_date DATE NOT NULL,
    cost_month DATE NOT NULL,                  -- First day of month (for aggregation)

    -- Category
    expense_category_id INTEGER REFERENCES expense_categories(id),
    department enum_department,

    -- Financial data
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Details
    description TEXT,
    vendor_name VARCHAR(255),

    -- Employee-specific (for payroll)
    employee_name VARCHAR(255),
    employee_id VARCHAR(100),

    -- Allocation
    allocation_method VARCHAR(50) NOT NULL,    -- 'equal', 'revenue_ratio', 'property_count', 'manual'
    allocation_config JSONB,                   -- Configuration for allocation
    is_allocated BOOLEAN DEFAULT FALSE,        -- Has this been allocated to categories?

    -- QuickBooks mapping
    qb_transaction_id VARCHAR(100),
    qb_account_id VARCHAR(100),
    qb_vendor_id VARCHAR(100),

    -- Source tracking
    source_system VARCHAR(50),
    source_id VARCHAR(100),

    -- Metadata
    metadata JSONB,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for shared_costs
CREATE INDEX IF NOT EXISTS idx_shared_costs_date ON shared_costs(cost_date);
CREATE INDEX IF NOT EXISTS idx_shared_costs_month ON shared_costs(cost_month);
CREATE INDEX IF NOT EXISTS idx_shared_costs_department ON shared_costs(department);
CREATE INDEX IF NOT EXISTS idx_shared_costs_expense_category ON shared_costs(expense_category_id);
CREATE INDEX IF NOT EXISTS idx_shared_costs_is_allocated ON shared_costs(is_allocated);
CREATE INDEX IF NOT EXISTS idx_shared_costs_qb_transaction ON shared_costs(qb_transaction_id);

COMMENT ON TABLE shared_costs IS 'Shared costs (payroll, software, refunds, chargebacks) with allocation tracking';

-- =====================================================
-- 6. SHARED COST ALLOCATIONS TABLE
-- How shared costs are distributed across categories
-- =====================================================
CREATE TABLE IF NOT EXISTS shared_cost_allocations (
    id SERIAL PRIMARY KEY,

    -- Relationship
    shared_cost_id INTEGER NOT NULL REFERENCES shared_costs(id) ON DELETE CASCADE,

    -- Allocation target
    home_category enum_home_category NOT NULL,
    property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,

    -- Allocated amount
    allocation_percentage DECIMAL(5, 2) NOT NULL,  -- Percentage of total
    allocated_amount DECIMAL(12, 2) NOT NULL,      -- Actual amount allocated

    -- Allocation metadata
    allocation_basis TEXT,                         -- Explanation of how this was calculated

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_allocation_percentage CHECK (
        allocation_percentage >= 0 AND allocation_percentage <= 100
    )
);

-- Indexes for shared_cost_allocations
CREATE INDEX IF NOT EXISTS idx_shared_cost_allocations_shared_cost ON shared_cost_allocations(shared_cost_id);
CREATE INDEX IF NOT EXISTS idx_shared_cost_allocations_home_category ON shared_cost_allocations(home_category);
CREATE INDEX IF NOT EXISTS idx_shared_cost_allocations_property ON shared_cost_allocations(property_id);

COMMENT ON TABLE shared_cost_allocations IS 'Distribution of shared costs across home categories';

-- =====================================================
-- 7. MONTHLY AGGREGATES MATERIALIZED VIEW
-- Pre-computed monthly summaries for dashboard performance
-- =====================================================
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_aggregates;

CREATE MATERIALIZED VIEW mv_monthly_aggregates AS
SELECT
    DATE_TRUNC('month', t.transaction_date)::DATE AS month,
    t.home_category,
    t.property_id,
    p.name AS property_name,
    t.transaction_type,

    -- Revenue aggregates
    COUNT(*) FILTER (WHERE t.transaction_type = 'revenue') AS revenue_count,
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'revenue'), 0) AS total_revenue,

    -- Expense aggregates
    COUNT(*) FILTER (WHERE t.transaction_type = 'expense') AS expense_count,
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'expense'), 0) AS total_expenses,

    -- Net calculation
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'revenue'), 0) -
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'expense'), 0) AS net_income,

    -- Transaction count
    COUNT(*) AS total_transactions,

    -- Metadata
    MAX(t.updated_at) AS last_transaction_update

FROM transactions t
LEFT JOIN properties p ON t.property_id = p.id
WHERE t.is_voided = FALSE
GROUP BY
    DATE_TRUNC('month', t.transaction_date)::DATE,
    t.home_category,
    t.property_id,
    p.name,
    t.transaction_type;

-- Indexes on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_aggregates_pk
    ON mv_monthly_aggregates(month, home_category, COALESCE(property_id, -1), transaction_type);
CREATE INDEX IF NOT EXISTS idx_mv_monthly_aggregates_month ON mv_monthly_aggregates(month);
CREATE INDEX IF NOT EXISTS idx_mv_monthly_aggregates_category ON mv_monthly_aggregates(home_category);
CREATE INDEX IF NOT EXISTS idx_mv_monthly_aggregates_property ON mv_monthly_aggregates(property_id);
CREATE INDEX IF NOT EXISTS idx_mv_monthly_aggregates_month_category ON mv_monthly_aggregates(month, home_category);

COMMENT ON MATERIALIZED VIEW mv_monthly_aggregates IS 'Pre-computed monthly financial aggregates for dashboard performance';

-- =====================================================
-- 8. CATEGORY SUMMARY VIEW
-- Summary by home category for quick dashboard access
-- =====================================================
DROP MATERIALIZED VIEW IF EXISTS mv_category_summary;

CREATE MATERIALIZED VIEW mv_category_summary AS
SELECT
    DATE_TRUNC('month', t.transaction_date)::DATE AS month,
    t.home_category,

    -- Property counts
    COUNT(DISTINCT t.property_id) AS property_count,

    -- Revenue by category
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'revenue'), 0) AS total_revenue,

    -- PM-specific revenue breakdown
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'revenue'
        AND rc.revenue_type = 'pm_income'
    ), 0) AS pm_income,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'revenue'
        AND rc.revenue_type = 'pm_claims'
    ), 0) AS pm_claims,

    -- Arbitrage/Owned rental income
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'revenue'
        AND rc.revenue_type IN ('arb_rental_income', 'owned_rental_income')
    ), 0) AS rental_income,

    -- Expense totals
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'expense'), 0) AS total_expenses,

    -- PM expense breakdown
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'pm_ads'
    ), 0) AS ads_expense,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'pm_sales_commission'
    ), 0) AS sales_commission,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'pm_onboarding'
    ), 0) AS onboarding_expense,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'pm_photography'
    ), 0) AS photography_expense,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'pm_churn'
    ), 0) AS churn_expense,

    -- Arbitrage expense breakdown
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'arb_rent'
    ), 0) AS rent_expense,

    -- Common expenses (utilities, cleaning, maintenance)
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type IN ('arb_utilities', 'owned_utilities')
    ), 0) AS utilities_expense,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type IN ('arb_cleaning', 'owned_cleaning')
    ), 0) AS cleaning_expense,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type IN ('arb_maintenance', 'owned_maintenance')
    ), 0) AS maintenance_expense,

    -- Home owned specific
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'owned_mortgage'
    ), 0) AS mortgage_expense,
    COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type = 'expense'
        AND ec.expense_type = 'owned_property_tax'
    ), 0) AS property_tax_expense,

    -- Net income
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'revenue'), 0) -
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'expense'), 0) AS net_income,

    -- Metadata
    MAX(t.updated_at) AS last_update

FROM transactions t
LEFT JOIN expense_categories ec ON t.expense_category_id = ec.id
LEFT JOIN revenue_categories rc ON t.revenue_category_id = rc.id
WHERE t.is_voided = FALSE
GROUP BY
    DATE_TRUNC('month', t.transaction_date)::DATE,
    t.home_category;

-- Indexes on category summary view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_category_summary_pk
    ON mv_category_summary(month, home_category);
CREATE INDEX IF NOT EXISTS idx_mv_category_summary_month ON mv_category_summary(month);
CREATE INDEX IF NOT EXISTS idx_mv_category_summary_category ON mv_category_summary(home_category);

COMMENT ON MATERIALIZED VIEW mv_category_summary IS 'Monthly summary by home category with expense breakdown';

-- =====================================================
-- 9. SHARED COSTS SUMMARY VIEW
-- Summary of shared costs by department and month
-- =====================================================
DROP MATERIALIZED VIEW IF EXISTS mv_shared_costs_summary;

CREATE MATERIALIZED VIEW mv_shared_costs_summary AS
SELECT
    sc.cost_month AS month,
    sc.department,
    ec.expense_type,
    ec.name AS category_name,

    -- Totals
    COUNT(*) AS cost_count,
    SUM(sc.total_amount) AS total_amount,

    -- Allocation status
    COUNT(*) FILTER (WHERE sc.is_allocated) AS allocated_count,
    SUM(sc.total_amount) FILTER (WHERE sc.is_allocated) AS allocated_amount,
    SUM(sc.total_amount) FILTER (WHERE NOT sc.is_allocated) AS unallocated_amount,

    -- Payroll specific
    COUNT(DISTINCT sc.employee_id) AS employee_count,
    SUM(sc.total_amount) FILTER (WHERE ec.expense_type = 'shared_payroll') AS payroll_total,

    -- Software
    SUM(sc.total_amount) FILTER (WHERE ec.expense_type = 'shared_software') AS software_total,

    -- Refunds and chargebacks
    SUM(sc.total_amount) FILTER (WHERE ec.expense_type = 'shared_refunds') AS refunds_total,
    SUM(sc.total_amount) FILTER (WHERE ec.expense_type = 'shared_chargebacks') AS chargebacks_total

FROM shared_costs sc
LEFT JOIN expense_categories ec ON sc.expense_category_id = ec.id
GROUP BY
    sc.cost_month,
    sc.department,
    ec.expense_type,
    ec.name;

-- Indexes on shared costs summary
CREATE INDEX IF NOT EXISTS idx_mv_shared_costs_summary_month ON mv_shared_costs_summary(month);
CREATE INDEX IF NOT EXISTS idx_mv_shared_costs_summary_dept ON mv_shared_costs_summary(department);

COMMENT ON MATERIALIZED VIEW mv_shared_costs_summary IS 'Monthly summary of shared costs by department';

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_financial_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_aggregates;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_summary;
    REFRESH MATERIALIZED VIEW mv_shared_costs_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_financial_views IS 'Refresh all financial dashboard materialized views';

-- Function to allocate shared costs
CREATE OR REPLACE FUNCTION allocate_shared_cost(
    p_shared_cost_id INTEGER,
    p_allocation_method VARCHAR(50) DEFAULT 'revenue_ratio'
)
RETURNS INTEGER AS $$
DECLARE
    v_total_amount DECIMAL(12, 2);
    v_cost_month DATE;
    v_allocated_count INTEGER := 0;
    v_category RECORD;
    v_total_revenue DECIMAL(12, 2);
    v_category_count INTEGER;
BEGIN
    -- Get shared cost details
    SELECT total_amount, cost_month INTO v_total_amount, v_cost_month
    FROM shared_costs WHERE id = p_shared_cost_id;

    IF v_total_amount IS NULL THEN
        RAISE EXCEPTION 'Shared cost not found: %', p_shared_cost_id;
    END IF;

    -- Delete existing allocations
    DELETE FROM shared_cost_allocations WHERE shared_cost_id = p_shared_cost_id;

    IF p_allocation_method = 'equal' THEN
        -- Equal distribution across active categories
        SELECT COUNT(DISTINCT home_category) INTO v_category_count
        FROM properties WHERE is_active = TRUE AND home_category NOT IN ('shared', 'unrelated');

        IF v_category_count > 0 THEN
            FOR v_category IN
                SELECT DISTINCT home_category
                FROM properties
                WHERE is_active = TRUE AND home_category NOT IN ('shared', 'unrelated')
            LOOP
                INSERT INTO shared_cost_allocations (
                    shared_cost_id, home_category, allocation_percentage,
                    allocated_amount, allocation_basis
                ) VALUES (
                    p_shared_cost_id, v_category.home_category,
                    (100.0 / v_category_count),
                    (v_total_amount / v_category_count),
                    'Equal distribution across ' || v_category_count || ' categories'
                );
                v_allocated_count := v_allocated_count + 1;
            END LOOP;
        END IF;

    ELSIF p_allocation_method = 'revenue_ratio' THEN
        -- Distribution based on revenue ratio
        SELECT COALESCE(SUM(total_revenue), 0) INTO v_total_revenue
        FROM mv_category_summary
        WHERE month = v_cost_month AND home_category NOT IN ('shared', 'unrelated');

        IF v_total_revenue > 0 THEN
            FOR v_category IN
                SELECT home_category, SUM(total_revenue) as category_revenue
                FROM mv_category_summary
                WHERE month = v_cost_month AND home_category NOT IN ('shared', 'unrelated')
                GROUP BY home_category
            LOOP
                INSERT INTO shared_cost_allocations (
                    shared_cost_id, home_category, allocation_percentage,
                    allocated_amount, allocation_basis
                ) VALUES (
                    p_shared_cost_id, v_category.home_category,
                    (v_category.category_revenue / v_total_revenue * 100),
                    (v_total_amount * v_category.category_revenue / v_total_revenue),
                    'Revenue-based: ' || v_category.category_revenue || ' of ' || v_total_revenue
                );
                v_allocated_count := v_allocated_count + 1;
            END LOOP;
        END IF;

    ELSIF p_allocation_method = 'property_count' THEN
        -- Distribution based on property count
        SELECT COUNT(*) INTO v_category_count
        FROM properties WHERE is_active = TRUE AND home_category NOT IN ('shared', 'unrelated');

        IF v_category_count > 0 THEN
            FOR v_category IN
                SELECT home_category, COUNT(*) as property_count
                FROM properties
                WHERE is_active = TRUE AND home_category NOT IN ('shared', 'unrelated')
                GROUP BY home_category
            LOOP
                INSERT INTO shared_cost_allocations (
                    shared_cost_id, home_category, allocation_percentage,
                    allocated_amount, allocation_basis
                ) VALUES (
                    p_shared_cost_id, v_category.home_category,
                    (v_category.property_count::DECIMAL / v_category_count * 100),
                    (v_total_amount * v_category.property_count / v_category_count),
                    'Property count: ' || v_category.property_count || ' of ' || v_category_count
                );
                v_allocated_count := v_allocated_count + 1;
            END LOOP;
        END IF;
    END IF;

    -- Mark shared cost as allocated
    UPDATE shared_costs
    SET is_allocated = TRUE, allocation_method = p_allocation_method, updated_at = CURRENT_TIMESTAMP
    WHERE id = p_shared_cost_id;

    RETURN v_allocated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION allocate_shared_cost IS 'Allocate a shared cost across home categories using specified method';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expense_categories_updated_at ON expense_categories;
CREATE TRIGGER update_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_revenue_categories_updated_at ON revenue_categories;
CREATE TRIGGER update_revenue_categories_updated_at
    BEFORE UPDATE ON revenue_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shared_costs_updated_at ON shared_costs;
CREATE TRIGGER update_shared_costs_updated_at
    BEFORE UPDATE ON shared_costs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA: Default Categories
-- =====================================================

-- Revenue Categories
INSERT INTO revenue_categories (code, name, description, home_category, revenue_type, display_order)
VALUES
    ('pm_management_fee', 'Management Fee', 'Property management fees from owners', 'pm', 'pm_income', 1),
    ('pm_claims_revenue', 'Claims Revenue', 'Insurance and damage claim recoveries', 'pm', 'pm_claims', 2),
    ('arb_guest_income', 'Guest Revenue', 'Guest payments for arbitrage properties', 'arbitrage', 'arb_rental_income', 1),
    ('owned_guest_income', 'Guest Revenue', 'Guest payments for owned properties', 'home_owned', 'owned_rental_income', 1),
    ('other_revenue', 'Other Income', 'Miscellaneous income', NULL, 'other_income', 99)
ON CONFLICT (code) DO NOTHING;

-- Expense Categories - PM
INSERT INTO expense_categories (code, name, description, home_category, expense_type, is_shared, display_order)
VALUES
    ('pm_advertising', 'Advertising', 'Marketing and advertising costs for PM', 'pm', 'pm_ads', FALSE, 1),
    ('pm_sales_commission', 'Sales Commission', 'Commissions paid to sales team', 'pm', 'pm_sales_commission', FALSE, 2),
    ('pm_onboarding', 'Onboarding', 'Costs to onboard new properties', 'pm', 'pm_onboarding', FALSE, 3),
    ('pm_photography', 'Photography', 'Property photography services', 'pm', 'pm_photography', FALSE, 4),
    ('pm_churn_costs', 'Churn Costs', 'Costs associated with property churn', 'pm', 'pm_churn', FALSE, 5)
ON CONFLICT (code) DO NOTHING;

-- Expense Categories - Arbitrage
INSERT INTO expense_categories (code, name, description, home_category, expense_type, is_shared, display_order)
VALUES
    ('arb_rent', 'Rent', 'Monthly rent payments', 'arbitrage', 'arb_rent', FALSE, 1),
    ('arb_utilities', 'Utilities', 'Electricity, gas, water, internet', 'arbitrage', 'arb_utilities', FALSE, 2),
    ('arb_cleaning', 'Cleaning', 'Cleaning services', 'arbitrage', 'arb_cleaning', FALSE, 3),
    ('arb_maintenance', 'Maintenance', 'Repairs and maintenance', 'arbitrage', 'arb_maintenance', FALSE, 4)
ON CONFLICT (code) DO NOTHING;

-- Expense Categories - Home Owned
INSERT INTO expense_categories (code, name, description, home_category, expense_type, is_shared, display_order)
VALUES
    ('owned_mortgage', 'Mortgage', 'Monthly mortgage payments', 'home_owned', 'owned_mortgage', FALSE, 1),
    ('owned_utilities', 'Utilities', 'Electricity, gas, water, internet', 'home_owned', 'owned_utilities', FALSE, 2),
    ('owned_cleaning', 'Cleaning', 'Cleaning services', 'home_owned', 'owned_cleaning', FALSE, 3),
    ('owned_maintenance', 'Maintenance', 'Repairs and maintenance', 'home_owned', 'owned_maintenance', FALSE, 4),
    ('owned_property_tax', 'Property Tax', 'Annual property taxes', 'home_owned', 'owned_property_tax', FALSE, 5),
    ('owned_insurance', 'Insurance', 'Property insurance', 'home_owned', 'owned_insurance', FALSE, 6),
    ('owned_hoa_fees', 'HOA Fees', 'Homeowners association fees', 'home_owned', 'owned_hoa', FALSE, 7)
ON CONFLICT (code) DO NOTHING;

-- Expense Categories - Shared
INSERT INTO expense_categories (code, name, description, home_category, expense_type, is_shared, allocation_method, display_order)
VALUES
    ('shared_payroll', 'Employee Payroll', 'Employee wages and benefits', 'shared', 'shared_payroll', TRUE, 'revenue_ratio', 1),
    ('shared_software', 'Software', 'Software subscriptions and tools', 'shared', 'shared_software', TRUE, 'equal', 2),
    ('shared_refunds', 'Refunds', 'Guest refunds', 'shared', 'shared_refunds', TRUE, 'revenue_ratio', 3),
    ('shared_chargebacks', 'Chargebacks', 'Payment chargebacks', 'shared', 'shared_chargebacks', TRUE, 'revenue_ratio', 4),
    ('shared_office', 'Office Expenses', 'Office rent, supplies, etc.', 'shared', 'shared_office', TRUE, 'equal', 5),
    ('shared_professional', 'Professional Services', 'Legal, accounting, consulting', 'shared', 'shared_professional', TRUE, 'equal', 6)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify the migration was successful:

-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('properties', 'expense_categories', 'revenue_categories', 'transactions', 'shared_costs', 'shared_cost_allocations');
-- SELECT matviewname FROM pg_matviews WHERE schemaname = 'public';
-- SELECT * FROM expense_categories ORDER BY home_category, display_order;
-- SELECT * FROM revenue_categories ORDER BY home_category, display_order;

COMMIT;

-- =====================================================
-- POST-MIGRATION: Refresh materialized views
-- Run this after inserting initial data
-- =====================================================
-- SELECT refresh_financial_views();
