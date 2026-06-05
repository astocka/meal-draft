-- Add meal_type to favorite_meals for filtering on the Ulubione page.

ALTER TABLE public.favorite_meals
  ADD COLUMN meal_type public.meal_type;

UPDATE public.favorite_meals fm
SET meal_type = sub.meal_type
FROM (
  SELECT DISTINCT ON (fm2.id)
    fm2.id AS favorite_id,
    gh.meal_type
  FROM public.favorite_meals fm2
  JOIN public.generation_history gh
    ON gh.user_id = fm2.user_id
   AND lower(trim(gh.name)) = lower(trim(fm2.recipe ->> 'name'))
   AND gh.recipe IS NOT NULL
  ORDER BY fm2.id, gh.generated_at DESC
) sub
WHERE fm.id = sub.favorite_id;

UPDATE public.favorite_meals
SET meal_type = 'lunch'
WHERE meal_type IS NULL;

ALTER TABLE public.favorite_meals
  ALTER COLUMN meal_type SET NOT NULL,
  ALTER COLUMN meal_type SET DEFAULT 'lunch';

CREATE INDEX favorite_meals_user_meal_type_idx
  ON public.favorite_meals (user_id, meal_type);
