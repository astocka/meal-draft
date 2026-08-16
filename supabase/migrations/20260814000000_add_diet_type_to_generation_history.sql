-- RLS: generation_history already has per-user SELECT/INSERT/UPDATE/DELETE policies
-- (users can only access their own rows). Adding this column requires no new policies
-- because the existing row-level ownership check covers all operations on the column.
ALTER TABLE generation_history
  ADD COLUMN diet_type text NOT NULL DEFAULT 'none'
  CHECK (diet_type IN (
    'none', 'vegetarian', 'vegan',
    'gluten_free', 'lactose_free', 'anti_inflammatory'
  ));
