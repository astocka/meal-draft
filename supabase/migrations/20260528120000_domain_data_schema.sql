-- F-01: pantry, favorites, and generation history domain schema

CREATE TYPE public.meal_type AS ENUM ('breakfast', 'lunch', 'dinner');

-- ---------------------------------------------------------------------------
-- pantry_products
-- ---------------------------------------------------------------------------

CREATE TABLE public.pantry_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pantry_products_user_name_unique
  ON public.pantry_products (user_id, lower(trim(name)));

CREATE INDEX pantry_products_user_id_idx ON public.pantry_products (user_id);

CREATE OR REPLACE FUNCTION public.set_pantry_products_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pantry_products_set_updated_at
  BEFORE UPDATE ON public.pantry_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pantry_products_updated_at();

-- ---------------------------------------------------------------------------
-- favorite_meals
-- ---------------------------------------------------------------------------

CREATE TABLE public.favorite_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipe jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_meals_recipe_shape_check CHECK (
    recipe ? 'name'
    AND recipe ? 'prep_time_minutes'
    AND recipe ? 'ingredients'
    AND recipe ? 'steps'
    AND jsonb_typeof(recipe -> 'ingredients') = 'array'
    AND jsonb_typeof(recipe -> 'steps') = 'array'
  )
);

CREATE UNIQUE INDEX favorite_meals_user_recipe_name_unique
  ON public.favorite_meals (user_id, lower(trim(recipe ->> 'name')));

CREATE INDEX favorite_meals_user_id_idx ON public.favorite_meals (user_id);

-- ---------------------------------------------------------------------------
-- generation_history
-- ---------------------------------------------------------------------------

CREATE TABLE public.generation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  meal_type public.meal_type NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  recipe jsonb
);

CREATE INDEX generation_history_user_generated_at_idx
  ON public.generation_history (user_id, generated_at DESC);

-- Retain last 20 rows per user (N=20 default until PRD Open Question #1 resolved).
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
      ORDER BY generated_at DESC
      LIMIT 20
    );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.prune_generation_history() OWNER TO postgres;

CREATE TRIGGER generation_history_prune
  AFTER INSERT ON public.generation_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prune_generation_history();

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.pantry_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY pantry_products_select_own
  ON public.pantry_products
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY pantry_products_insert_own
  ON public.pantry_products
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY pantry_products_update_own
  ON public.pantry_products
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY pantry_products_delete_own
  ON public.pantry_products
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY favorite_meals_select_own
  ON public.favorite_meals
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY favorite_meals_insert_own
  ON public.favorite_meals
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY favorite_meals_delete_own
  ON public.favorite_meals
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY generation_history_select_own
  ON public.generation_history
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY generation_history_insert_own
  ON public.generation_history
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- table grants (RLS policies alone do not grant table access)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_products TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.favorite_meals TO authenticated;
GRANT SELECT, INSERT ON public.generation_history TO authenticated;
