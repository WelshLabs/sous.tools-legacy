-- Migration: Add Baker's Math and Normalized Measurement Fields to recipe_ingredients
--
-- Adds:
-- - is_reference: indicates base reference ingredient (e.g. flour) for Baker's %
-- - bakers_percentage: calculated formula percentage relative to base reference ingredient
-- - original_input_string: preserves original human/OCR input (e.g. "2 bunches scallions", "500g bread flour")
-- - standard_weight_g: normalized standardized edible weight in grams

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS is_reference BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS bakers_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS original_input_string TEXT,
  ADD COLUMN IF NOT EXISTS standard_weight_g NUMERIC;

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_is_reference ON recipe_ingredients(is_reference);

-- Alias view for recipe_versions pointing to formula_versions for naming parity
CREATE OR REPLACE VIEW recipe_versions AS SELECT * FROM formula_versions;
