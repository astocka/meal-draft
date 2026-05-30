-- Drop the original single-column history index superseded by the tie-breaking composite index
-- added in 20260528140000_fix_history_prune_ordering.sql.
-- The new index (user_id, generated_at DESC, seq DESC) covers the same query prefix,
-- so the old index adds only write overhead with no planner benefit.
DROP INDEX public.generation_history_user_generated_at_idx;
