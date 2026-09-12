-- ==============================================================================
-- FoodBridge Bugfix: handle_new_user() role cast safety
-- Migration: 20260902000002_handle_new_user_role_cast_safety.sql
--
-- SYMPTOM: POST /auth/v1/signup returns 500
--   { "code": "unexpected_failure", "message": "Database error saving new user" }
--
-- ROOT CAUSE: handle_new_user() (20260825000001_initial_database_foundation.sql,
-- section 8) validates the client-supplied role against a HARDCODED literal
-- list before casting it to the user_role enum:
--
--   IF v_raw_role IN ('donor', 'ngo', 'logistics', 'admin') THEN
--       v_role := v_raw_role::user_role;   -- "cast safely"
--
-- That list only reflects what the enum is SUPPOSED to contain, not what it
-- actually contains on a given database. 20260825000002_enum_remediation.sql
-- documents that the pre-existing (v0-bootstrapped) user_role enum only had
-- ('donor','ngo','volunteer','admin') until 'logistics' was added by that
-- migration. If enum_remediation has not been applied to this database (or
-- any future change removes/renames a label the same way), a signup carrying
-- role = 'logistics' reaches `'logistics'::user_role`, Postgres raises
-- invalid_text_representation (22P02) because that label does not exist in
-- the deployed enum, the SECURITY DEFINER trigger aborts, and the entire
-- auth.users INSERT rolls back — which GoTrue reports verbatim as
-- "Database error saving new user".
--
-- FIX (two parts):
--   1. Defensively re-assert that user_role has 'logistics', in case
--      enum_remediation did not reach this database. Guarded and idempotent,
--      identical pattern to 20260825000002_enum_remediation.sql — safe to
--      run whether or not that migration already applied here.
--   2. Stop hardcoding the valid-label list in handle_new_user() and instead
--      attempt the cast, catching invalid_text_representation and falling
--      back to the existing 'donor' default. This removes the class of bug
--      entirely: the function no longer needs to keep a second, hand-maintained
--      copy of the enum's label list in sync with the type itself.
--
-- No RLS policy, the claim_donation() RPC, or any other SECURITY DEFINER
-- function is touched by this migration.
-- ==============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'user_role'::regtype AND enumlabel = 'logistics') THEN
    ALTER TYPE user_role ADD VALUE 'logistics';
  END IF;
END $$;

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

    -- Extract role and cast safely: attempt the cast against whatever labels
    -- user_role actually has, rather than a hardcoded literal list that can
    -- drift out of sync with the deployed enum. An unrecognized/invalid role
    -- falls back to 'donor' instead of aborting the signup transaction.
    v_raw_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'donor'));
    BEGIN
        v_role := v_raw_role::user_role;
    EXCEPTION
        WHEN invalid_text_representation THEN
            v_role := 'donor'::user_role;
    END;

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
