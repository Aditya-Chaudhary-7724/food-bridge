-- ==============================================================================
-- FoodBridge Database Foundation Migration
-- Phase 1: Extensions, Enums, Tables, Indexes, and System Triggers
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ==============================================================================
-- 2. Custom Enumerated Types
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('donor', 'ngo', 'logistics', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE organization_type AS ENUM ('donor', 'ngo', 'logistics');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE donation_status AS ENUM (
        'available',
        'matched',
        'claimed',
        'pickup_scheduled',
        'picked_up',
        'delivered',
        'expired',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE urgency_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE match_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE pickup_status AS ENUM (
        'scheduled',
        'driver_assigned',
        'in_transit',
        'completed',
        'cancelled',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE logistics_event_type AS ENUM (
        'created',
        'driver_assigned',
        'arrived_at_pickup',
        'picked_up',
        'in_transit',
        'arrived_at_destination',
        'delivered',
        'exception',
        'delayed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'new_match',
        'donation_claimed',
        'pickup_scheduled',
        'delivery_completed',
        'system'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. Utility Functions & Triggers
-- ==============================================================================

-- Trigger to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. Tables Creation (Idempotent DDL)
-- ==============================================================================

-- 4.1 Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type organization_type NOT NULL DEFAULT 'ngo',
    address TEXT NOT NULL,
    location GEOMETRY(Point, 4326),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    contact_email TEXT,
    contact_phone TEXT,
    email TEXT,
    phone TEXT,
    description TEXT,
    daily_capacity_kg NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (daily_capacity_kg >= 0),
    dietary_preferences TEXT[] NOT NULL DEFAULT '{}',
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist on organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS type organization_type NOT NULL DEFAULT 'ngo';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS daily_capacity_kg NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- 4.2 User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    role user_role NOT NULL DEFAULT 'donor',
    phone TEXT,
    avatar_url TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'donor';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 4.3 Donations Table
CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    food_category TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'kg',
    prepared_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    pickup_address TEXT NOT NULL,
    pickup_location GEOMETRY(Point, 4326),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    status donation_status NOT NULL DEFAULT 'available',
    food_embedding VECTOR(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist on donations
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS food_category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0);
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours');
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS pickup_address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS pickup_location GEOMETRY(Point, 4326);
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS status donation_status NOT NULL DEFAULT 'available';
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS food_embedding VECTOR(768);

-- 4.4 Donation Items Table (Sub-items for a donation)
CREATE TABLE IF NOT EXISTS public.donation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id UUID NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'kg',
    food_category TEXT,
    dietary_flags TEXT[] NOT NULL DEFAULT '{}',
    storage_requirement TEXT NOT NULL DEFAULT 'ambient',
    notes TEXT,
    expiration_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.5 NGO Requirements Table
CREATE TABLE IF NOT EXISTS public.ngo_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    food_categories TEXT[] NOT NULL DEFAULT '{}',
    daily_capacity_kg NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (daily_capacity_kg >= 0),
    urgency_level urgency_level NOT NULL DEFAULT 'medium',
    dietary_requirements TEXT[] NOT NULL DEFAULT '{}',
    preferred_quantity_min NUMERIC(10, 2) DEFAULT 0 CHECK (preferred_quantity_min >= 0),
    preferred_quantity_max NUMERIC(10, 2),
    requirement_embedding VECTOR(768),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_preferred_quantity_range CHECK (preferred_quantity_max IS NULL OR preferred_quantity_max >= preferred_quantity_min)
);

-- 4.6 Match Recommendations Table
CREATE TABLE IF NOT EXISTS public.match_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id UUID NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    semantic_score NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (semantic_score >= 0 AND semantic_score <= 100),
    distance_score NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (distance_score >= 0 AND distance_score <= 100),
    capacity_score NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (capacity_score >= 0 AND capacity_score <= 100),
    urgency_score NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
    final_score NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (final_score >= 0 AND final_score <= 100),
    distance_km NUMERIC(8, 2),
    explanation TEXT NOT NULL,
    status match_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_donation_organization_match UNIQUE (donation_id, organization_id)
);

-- 4.7 Pickups Table
CREATE TABLE IF NOT EXISTS public.pickups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id UUID NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    logistics_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    pickup_address TEXT NOT NULL,
    pickup_location GEOMETRY(Point, 4326),
    destination_address TEXT NOT NULL DEFAULT '',
    destination_location GEOMETRY(Point, 4326),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    estimated_duration_minutes INTEGER,
    actual_pickup_at TIMESTAMPTZ,
    actual_delivery_at TIMESTAMPTZ,
    status pickup_status NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist on pickups
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS donation_id UUID REFERENCES public.donations(id) ON DELETE CASCADE;
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS logistics_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS pickup_address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS pickup_location GEOMETRY(Point, 4326);
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS destination_address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS destination_location GEOMETRY(Point, 4326);
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS actual_pickup_at TIMESTAMPTZ;
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS actual_delivery_at TIMESTAMPTZ;
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS status pickup_status NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4.8 Logistics Events Table (Timeline & Audit of Delivery)
CREATE TABLE IF NOT EXISTS public.logistics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pickup_id UUID NOT NULL REFERENCES public.pickups(id) ON DELETE CASCADE,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type logistics_event_type NOT NULL,
    location GEOMETRY(Point, 4326),
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.9 Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type notification_type NOT NULL DEFAULT 'system',
    reference_id UUID,
    reference_type TEXT,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist on notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type notification_type NOT NULL DEFAULT 'system';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

-- 4.10 Documents Table (For Future RAG)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.11 Document Chunks Table (For Future RAG Knowledge Base)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 5. Performance, Geospatial, and Vector Indexes
-- ==============================================================================

-- Profiles Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);

-- Organizations Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_type ON public.organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_location_gist ON public.organizations USING GIST(location);

-- Donations Indexes
CREATE INDEX IF NOT EXISTS idx_donations_donor_id ON public.donations(donor_id);
CREATE INDEX IF NOT EXISTS idx_donations_organization_id ON public.donations(organization_id);
CREATE INDEX IF NOT EXISTS idx_donations_status ON public.donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_expires_at ON public.donations(expires_at);
CREATE INDEX IF NOT EXISTS idx_donations_pickup_location_gist ON public.donations USING GIST(pickup_location);
CREATE INDEX IF NOT EXISTS idx_donations_embedding_hnsw ON public.donations USING hnsw (food_embedding vector_cosine_ops);

-- Donation Items Indexes
CREATE INDEX IF NOT EXISTS idx_donation_items_donation_id ON public.donation_items(donation_id);

-- NGO Requirements Indexes
CREATE INDEX IF NOT EXISTS idx_ngo_requirements_org_id ON public.ngo_requirements(organization_id);
CREATE INDEX IF NOT EXISTS idx_ngo_requirements_active ON public.ngo_requirements(is_active);
CREATE INDEX IF NOT EXISTS idx_ngo_requirements_embedding_hnsw ON public.ngo_requirements USING hnsw (requirement_embedding vector_cosine_ops);

-- Match Recommendations Indexes
CREATE INDEX IF NOT EXISTS idx_matches_donation_id ON public.match_recommendations(donation_id);
CREATE INDEX IF NOT EXISTS idx_matches_organization_id ON public.match_recommendations(organization_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.match_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_matches_final_score ON public.match_recommendations(final_score DESC);

-- Pickups Indexes
CREATE INDEX IF NOT EXISTS idx_pickups_donation_id ON public.pickups(donation_id);
CREATE INDEX IF NOT EXISTS idx_pickups_organization_id ON public.pickups(organization_id);
CREATE INDEX IF NOT EXISTS idx_pickups_logistics_user_id ON public.pickups(logistics_user_id);
CREATE INDEX IF NOT EXISTS idx_pickups_status ON public.pickups(status);
CREATE INDEX IF NOT EXISTS idx_pickups_scheduled_at ON public.pickups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_pickups_location_gist ON public.pickups USING GIST(pickup_location);

-- Logistics Events Indexes
CREATE INDEX IF NOT EXISTS idx_logistics_events_pickup_id ON public.logistics_events(pickup_id);
CREATE INDEX IF NOT EXISTS idx_logistics_events_recorded_at ON public.logistics_events(recorded_at);

-- Notifications Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- RAG Indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- ==============================================================================
-- 6. Location Point Synchronization Triggers
-- ==============================================================================

-- Synchronize point geometry from latitude and longitude on organizations
CREATE OR REPLACE FUNCTION sync_organization_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_org_location ON public.organizations;
CREATE TRIGGER trg_sync_org_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION sync_organization_location();

-- Synchronize point geometry from latitude and longitude on donations
CREATE OR REPLACE FUNCTION sync_donation_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.pickup_location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_donation_location ON public.donations;
CREATE TRIGGER trg_sync_donation_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON public.donations
    FOR EACH ROW
    EXECUTE FUNCTION sync_donation_location();

-- ==============================================================================
-- 7. Updated At Triggers for Timestamp Tracking
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_donations_updated_at ON public.donations;
CREATE TRIGGER trg_donations_updated_at
    BEFORE UPDATE ON public.donations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ngo_requirements_updated_at ON public.ngo_requirements;
CREATE TRIGGER trg_ngo_requirements_updated_at
    BEFORE UPDATE ON public.ngo_requirements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_match_recommendations_updated_at ON public.match_recommendations;
CREATE TRIGGER trg_match_recommendations_updated_at
    BEFORE UPDATE ON public.match_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pickups_updated_at ON public.pickups;
CREATE TRIGGER trg_pickups_updated_at
    BEFORE UPDATE ON public.pickups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 8. Supabase Auth Automatic Profile Creation Trigger
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
    v_role user_role;
    v_raw_role TEXT;
BEGIN
    -- Extract full name with fallback
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1),
        'FoodBridge User'
    );

    -- Extract role and cast safely
    v_raw_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'donor'));
    IF v_raw_role IN ('donor', 'ngo', 'logistics', 'admin') THEN
        v_role := v_raw_role::user_role;
    ELSE
        v_role := 'donor'::user_role;
    END IF;

    -- Insert or update profile on signup
    INSERT INTO public.profiles (id, full_name, email, role, avatar_url, created_at, updated_at)
    VALUES (
        NEW.id,
        v_full_name,
        NEW.email,
        v_role,
        NEW.raw_user_meta_data->>'avatar_url',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
