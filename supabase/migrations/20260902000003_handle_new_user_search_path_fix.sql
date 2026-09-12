-- ==============================================================================
-- FoodBridge Bugfix: handle_new_user() missing SET search_path
-- Migration: 20260902000003_handle_new_user_search_path_fix.sql
--
-- SYMPTOM (still occurring after 20260902000002_handle_new_user_role_cast_safety.sql):
--   POST /auth/v1/signup -> 500
--   { "code": "unexpected_failure", "message": "Database error saving new user" }
--
-- The enum-cast-safety fix in ...002 addressed a real but different bug
-- (a hardcoded valid-role literal list) and was confirmed applied. It did
-- not resolve this symptom because the actual failure happens one step
-- earlier and is not a value-cast problem at all.
--
-- ROOT CAUSE:
-- handle_new_user() is SECURITY DEFINER but, unlike every other SECURITY
-- DEFINER function in this schema (public.get_current_user_role(),
-- public.get_current_user_org_id(), all four protect_*_fields() triggers in
-- 20260825000003_rls_authorization.sql, and public.claim_donation() in
-- 20260825000004_claim_function.sql — all seven pin `SET search_path =
-- public`), it never pins search_path.
--
-- A SECURITY DEFINER function without an explicit SET search_path inherits
-- the CALLING SESSION's active search_path at invocation time, not the
-- definer's. This trigger fires inside GoTrue's own INSERT INTO auth.users,
-- executed over the supabase_auth_admin role, whose search_path is scoped to
-- the auth schema only (public is deliberately excluded) as a Supabase
-- hardening default.
--
-- The function body references the enum type `user_role` UNQUALIFIED three
-- times:
--   DECLARE v_role user_role;
--   v_role := v_raw_role::user_role;
--   v_role := 'donor'::user_role;
-- With `public` absent from the active search_path, Postgres cannot resolve
-- the bare type name and raises `type "user_role" does not exist` (42704) —
-- a type-resolution error at a point BEFORE the existing
-- `EXCEPTION WHEN invalid_text_representation` handler in the function body
-- can catch anything (that handler only catches a failed VALUE cast once the
-- type itself has already resolved). The exception aborts the whole
-- auth.users INSERT, which GoTrue reports as "Database error saving new
-- user". None of the previously-confirmed structural checks (enum contents,
-- function/trigger existence, profiles schema) would surface this, because
-- none of them invoke the function under GoTrue's actual connection role.
--
-- FIX: pin `SET search_path = public` (matching every other SECURITY
-- DEFINER function here), and fully qualify `user_role` as `public.user_role`
-- throughout as defense in depth so correct behavior does not depend solely
-- on search_path being right at call time.
--
-- No RLS policy, claim_donation(), the trigger attachment, or the enum
-- values themselves are touched by this migration.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_role public.user_role;
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
        v_role := v_raw_role::public.user_role;
    EXCEPTION
        WHEN invalid_text_representation THEN
            v_role := 'donor'::public.user_role;
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
$$;
