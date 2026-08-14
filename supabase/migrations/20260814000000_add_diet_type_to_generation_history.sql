ALTER TABLE generation_history
  ADD COLUMN diet_type text NOT NULL DEFAULT 'none'
  CHECK (diet_type IN (
    'none', 'vegetarian', 'vegan',
    'gluten_free', 'lactose_free', 'anti_inflammatory'
  ));
