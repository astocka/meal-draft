-- Fix history prune tie-breaking when generated_at is identical (bulk inserts).
-- Without insert-order tie-break, PostgreSQL kept an arbitrary 20 rows and deleted the wrong one.

ALTER TABLE public.generation_history
  ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;

CREATE INDEX generation_history_user_generated_at_seq_idx
  ON public.generation_history (user_id, generated_at DESC, seq DESC);

CREATE OR REPLACE FUNCTION public.prune_generation_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM public.generation_history gh
  WHERE gh.user_id = NEW.user_id
    AND gh.id NOT IN (
      SELECT id
      FROM public.generation_history
      WHERE user_id = NEW.user_id
      ORDER BY generated_at DESC, seq DESC
      LIMIT 20
    );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.prune_generation_history() OWNER TO postgres;
