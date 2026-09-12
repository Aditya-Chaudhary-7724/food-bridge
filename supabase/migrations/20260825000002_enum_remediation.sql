-- ==============================================================================
-- FoodBridge Phase 2a: Enum Remediation
-- Migration: 20260825000002_enum_remediation.sql
--
-- The original v0 project created enums with fewer values than the FoodBridge
-- schema requires. The Phase 1 migration's CREATE TYPE ... EXCEPTION WHEN
-- duplicate_object silently skipped them since they already existed.
--
-- ALTER TYPE ... ADD VALUE cannot be used inside a transaction that then
-- references the new values, so this must be a separate migration from the
-- RLS policies that use these enum values.
-- ==============================================================================

-- user_role: original v0 had ('donor','ngo','volunteer','admin'), missing 'logistics'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'user_role'::regtype AND enumlabel = 'logistics') THEN
    ALTER TYPE user_role ADD VALUE 'logistics';
  END IF;
END $$;

-- donation_status: original v0 was missing 'claimed' and 'pickup_scheduled'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'donation_status'::regtype AND enumlabel = 'claimed') THEN
    ALTER TYPE donation_status ADD VALUE 'claimed';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'donation_status'::regtype AND enumlabel = 'pickup_scheduled') THEN
    ALTER TYPE donation_status ADD VALUE 'pickup_scheduled';
  END IF;
END $$;

-- pickup_status: original v0 was missing 'scheduled', 'driver_assigned', 'in_transit', 'failed'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'pickup_status'::regtype AND enumlabel = 'scheduled') THEN
    ALTER TYPE pickup_status ADD VALUE 'scheduled';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'pickup_status'::regtype AND enumlabel = 'driver_assigned') THEN
    ALTER TYPE pickup_status ADD VALUE 'driver_assigned';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'pickup_status'::regtype AND enumlabel = 'in_transit') THEN
    ALTER TYPE pickup_status ADD VALUE 'in_transit';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'pickup_status'::regtype AND enumlabel = 'failed') THEN
    ALTER TYPE pickup_status ADD VALUE 'failed';
  END IF;
END $$;
