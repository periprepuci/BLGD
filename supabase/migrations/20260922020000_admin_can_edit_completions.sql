-- ===========================================================================
-- BLGD - admins can edit any completion
-- ===========================================================================
-- Run after the two earlier migrations.
--
-- Until now an admin could *delete* another member's completion but not edit
-- it, which is a strange half-power: the only way to fix a wrong rating or a
-- dead YouTube link on someone else's entry was to remove it entirely.
--
-- This adds the matching UPDATE policy, and at the same time tightens what an
-- update may touch - for everybody, admins included.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Admins may edit any completion
-- ---------------------------------------------------------------------------

drop policy if exists "admins update any completion" on public.completions;
create policy "admins update any completion"
  on public.completions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Ownership is not editable by anyone
-- ---------------------------------------------------------------------------
-- An RLS policy decides which *rows* a statement may touch, never which
-- columns. So the policy above, on its own, would also let an admin rewrite
-- `user_id` and move a completion between members - silently, and with no way
-- to tell afterwards.
--
-- A column grant is the only mechanism that draws that line. `user_id` and
-- `level_id` are left out of it, so after a completion is created nobody can
-- change who it belongs to or which level it refers to - not a member, not an
-- admin. Getting one wrong means deleting it and adding it again, which at
-- least leaves the row's timestamps honest.
--
-- This is the same technique the first migration uses to stop `is_admin` being
-- self-granted.
-- ---------------------------------------------------------------------------

revoke update on public.completions from authenticated;
grant update (
  enjoyment, difficulty,
  youtube_url, youtube_video_id,
  note, completed_at
) on public.completions to authenticated;

-- Anonymous visitors keep no write path at all.
revoke insert, update, delete on public.completions from anon;
