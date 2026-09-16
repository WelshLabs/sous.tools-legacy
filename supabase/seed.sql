-- =============================================================================
-- sous.tools — Master Seed Configuration
-- Phase III: Dtown Cafe Identity & Data Seeding
-- Deterministic UUIDs for local dev. Re-run safe via ON CONFLICT guards.
-- =============================================================================
INSERT INTO app_settings (key, value) VALUES ('neo4j_sync_url', 'http://host.docker.internal:3001/webhooks/neo4j-sync') 
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ---------------------------------------------------------------------------
-- 1. Organizations — Dtown Cafe (first tenant)
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, slug, logo_url, design_tokens)
VALUES (
  'd0000000-0000-0000-0000-000000000000',
  'Dtown Cafe',
  'dtown-cafe',
  'cloud-chef-hat-logo.svg',
  '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  slug       = EXCLUDED.slug,
  logo_url   = EXCLUDED.logo_url;

-- ---------------------------------------------------------------------------
-- 2. Auth — conar@dtown.cafe (superadmin)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'conar@dtown.cafe',
  crypt('password', gen_salt('bf')),
  now(), now(), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "admin", "org_id": "d0000000-0000-0000-0000-000000000000"}'::jsonb,
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) VALUES (
  'd0000000-0000-0000-0000-000000000000',
  'd0000000-0000-0000-0000-000000000000',
  '{"sub": "d0000000-0000-0000-0000-000000000000", "email": "conar@dtown.cafe"}'::jsonb,
  'email',
  'd0000000-0000-0000-0000-000000000000',
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Org membership — conar@dtown.cafe as admin of Dtown Cafe
-- ---------------------------------------------------------------------------
INSERT INTO public.org_members (organization_id, user_id, role)
VALUES (
  'd0000000-0000-0000-0000-000000000000',
  'd0000000-0000-0000-0000-000000000000',
  'admin'
) ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';

-- ---------------------------------------------------------------------------
-- 4. User profile
-- ---------------------------------------------------------------------------
INSERT INTO public.user_profiles (user_id, full_name)
VALUES ('d0000000-0000-0000-0000-000000000000', 'Conar Welsh')
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Culinary vessel profiles
-- ---------------------------------------------------------------------------
-- INSERT INTO public.vessel_profiles (id, organization_id, name, shape, length, width, height, volume_ml) VALUES
--   ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000', '9" Pullman Pan',    'RECTANGULAR', 23, 10, 10, 2300),
--   ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', '13" Pullman Pan',   'RECTANGULAR', 33, 10, 10, 3300),
--   ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000000', '9" Round Cake Pan', 'ROUND',       NULL, NULL, 5, 2077)
-- ON CONFLICT (id) DO NOTHING;

-- -- ---------------------------------------------------------------------------
-- -- 6. Master item conversion library
-- -- ---------------------------------------------------------------------------
-- INSERT INTO public.master_items (id, organization_id, name, density_g_ml, nutrition_macros, allergens) VALUES
--   ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000', 'Bread Flour',     0.57, '{"calories": 364, "proteinG": 12,   "carbsG": 76,  "fatG": 1.5}'::jsonb, '["wheat"]'::jsonb),
--   ('a0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', 'Water',           1.0,  '{"calories": 0,   "proteinG": 0,    "carbsG": 0,   "fatG": 0}'::jsonb,   '[]'::jsonb),
--   ('a0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000000', 'Active Dry Yeast', 0.79, '{"calories": 325, "proteinG": 40,   "carbsG": 41,  "fatG": 7}'::jsonb,   '[]'::jsonb),
--   ('a0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000000', 'Fine Sea Salt',   1.2,  '{"calories": 0,   "proteinG": 0,    "carbsG": 0,   "fatG": 0}'::jsonb,   '[]'::jsonb),
--   ('a0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000000', 'Unsalted Butter', 0.96, '{"calories": 717, "proteinG": 0.9,  "carbsG": 0.1, "fatG": 81}'::jsonb,  '["dairy"]'::jsonb),
--   ('a0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000000', 'Whole Milk',      1.03, '{"calories": 61,  "proteinG": 3.2,  "carbsG": 4.8, "fatG": 3.3}'::jsonb, '["dairy"]'::jsonb),
--   ('a0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000000', 'Granulated Sugar', 0.84, '{"calories": 387, "proteinG": 0,    "carbsG": 100, "fatG": 0}'::jsonb,   '[]'::jsonb),
--   ('a0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000000', 'Whole Egg',       1.02, '{"calories": 143, "proteinG": 12.6, "carbsG": 0.7, "fatG": 9.5}'::jsonb, '["egg"]'::jsonb)
-- ON CONFLICT (id) DO NOTHING;

-- -- ---------------------------------------------------------------------------
-- -- 7. Recipes
-- -- ---------------------------------------------------------------------------
-- INSERT INTO public.recipes (id, organization_id, title, yield_count, yield_unit, vessel_id, instructions, status) VALUES
--   ('beef0000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000',
--    'Traditional Sourdough', 2, 'loaves', 'c0000000-0000-0000-0000-000000000001',
--    '[{"stepNumber": 1, "text": "Mix flour and water and let sit for autolyse.", "timerDurationSeconds": 1800}, {"stepNumber": 2, "text": "Add active dry yeast and salt. Knead until smooth.", "timerDurationSeconds": 600}]'::jsonb,
--    'APPROVED'),
--   ('beef0000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000',
--    'Classic Croissant', 12, 'pieces', 'c0000000-0000-0000-0000-000000000003',
--    '[{"stepNumber": 1, "text": "Mix bread flour, milk, sugar, yeast, and salt to form dough. Rest in fridge.", "timerDurationSeconds": 3600}, {"stepNumber": 2, "text": "Roll out butter block and laminate into dough with three folds.", "timerDurationSeconds": 1200}, {"stepNumber": 3, "text": "Shape croissant triangles, proof, brush with egg wash, and bake.", "timerDurationSeconds": 1500}]'::jsonb,
--    'APPROVED')
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO public.recipe_ingredients (id, recipe_id, master_item_id, calculation_type, base_calculation_group, amount, unit, prep_notes) VALUES
--   ('b0000000-0000-0000-0000-000000000001', 'beef0000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'fixed_weight', true,  500, 'g', 'Use unbleached flour.'),
--   ('b0000000-0000-0000-0000-000000000002', 'beef0000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'fixed_weight', false, 350, 'g', 'Filtered water at 75°F.'),
--   ('b0000000-0000-0000-0000-000000000003', 'beef0000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'fixed_weight', false, 10,  'g', 'Ensure fresh active yeast.'),
--   ('b0000000-0000-0000-0000-000000000004', 'beef0000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'fixed_weight', false, 10,  'g', 'Fine grey sea salt.'),
--   ('b0000000-0000-0000-0000-000000000005', 'beef0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'fixed_weight', true,  500, 'g', 'Use premium pastry/bread flour.'),
--   ('b0000000-0000-0000-0000-000000000006', 'beef0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'fixed_weight', false, 250, 'g', 'European style high-fat butter.'),
--   ('b0000000-0000-0000-0000-000000000007', 'beef0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'fixed_weight', false, 150, 'g', 'Cold whole milk.'),
--   ('b0000000-0000-0000-0000-000000000008', 'beef0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007', 'fixed_weight', false, 50,  'g', 'Granulated white sugar.'),
--   ('b0000000-0000-0000-0000-000000000009', 'beef0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'fixed_weight', false, 10,  'g', 'Instant or active dry yeast.'),
--   ('b0000000-0000-0000-0000-000000000010', 'beef0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'fixed_weight', false, 10,  'g', 'Fine sea salt.'),
--   ('b0000000-0000-0000-0000-000000000011', 'beef0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'fixed_weight', false, 50,  'g', 'Egg for glaze/wash.')
-- ON CONFLICT (id) DO NOTHING;

-- -- ---------------------------------------------------------------------------
-- -- 8. POS Items
-- -- ---------------------------------------------------------------------------
-- INSERT INTO public.pos_items (id, organization_id, pos_provider, external_id, name, description, price, is_sold_out) VALUES
--   -- Breakfast
--   ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_egg_cheese',    'Egg & Cheese Sandwich',      'Two folded eggs on scratch brioche roll',          10.00, false),
--   ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_spicy_bkt',     'The Chef''s Spicy Breakfast', 'Eggs, hot sausage, pepperjack, spicy aioli',       12.50, false),
--   ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_trad_platter',  'The Traditional Platter',     'Two eggs, scratch toast, choice of premium protein',11.00, false),
--   ('f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_french_toast',  'French Toast',                'Thick cut brioche, pure maple syrup',              11.00, false),
--   -- Pastries
--   ('f0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_cinnamon_knots','Famous Cinnamon Knots',       'Scratch baked, sweet cream glaze coating',          4.00, false),
--   ('f0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_choc_chip',     'Chocolate Chip Cookie',       'Baked fresh for cafe operations',                   3.00, false),
--   ('f0000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_oatmeal_cran',  'Oatmeal Cranberry Cookie',    'Baked fresh for cafe operations',                   3.00, false),
--   ('f0000000-0000-0000-0000-000000000031', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_peanut_butter', 'Peanut Butter Cookie',        'Baked fresh for cafe operations',                   3.00, false),
--   ('f0000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_lemon_sable',   'Lemon Sablé Cookie',          'Baked fresh for cafe operations',                   3.00, false),
--   -- Soups & Salads
--   ('f0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_chili',         'Chili',                       'Beef and dark red kidney bean base',                8.00, false),
--   ('f0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_blue_feta',     'Blueberry Feta',              'Spring mix, local blueberries, wild feta',          9.50, false),
--   ('f0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_apple_cran',    'Apple Cranberry',             'Crisp local apples, sweet dried cranberries',       9.50, false),
--   ('f0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_greek',         'Greek Salad',                 'Cucumbers, plum tomatoes, kalamata olives',         9.50, false),
--   ('f0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_caesar',        'Classic Caesar',              'Romaine, scratch brioche croutons, shaved parmesan',8.50, false),
--   ('f0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_chef_salad',    'Chef Salad',                  'Diced turkey, pit ham, cheddar, house ranch',      12.50, false),
--   -- Sandwiches
--   ('f0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_cheesesteak',   'The DTown Cafe Cheesesteak',  'Shaved steak & American on toasted brioche sandwich bread.',15.50, false),
--   ('f0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_zep',           'The Zep',                     'Cooked salami, provolone, thick raw onion, tomato, oil',13.00, false),
--   ('f0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_jalapeno_bac',  'Jalapeño Bacon Grilled Cheese','Fresh ground chuck, fresh sliced jalapenos, smoky bacon',12.00, false),
--   ('f0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_jersey',        'The Jersey Classic',          'Thick grilled pork roll, egg, american cheese, brioche',11.00, false),
--   ('f0000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_smash',         'DTown Smash Burger',          'Two thin crispy patties, special burger sauce',    13.00, false),
--   ('f0000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_cubano',        'The Cubano',                  'Mojo roasted pork, pit ham, swiss, pickles, mustard',14.00, false),
--   ('f0000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_monsieur',      'Croque Monsieur',             'Pit ham, gruyere layer, scratch rich bechamel',    14.00, false),
--   ('f0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_madame',        'Croque Madame',               'Monsieur base finished with a sunny fried egg crown',16.00, false),
--   ('f0000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_mademoiselle',  'Croque Mademoiselle',         'Swaps out the ham for fresh grilled greens',       15.00, false),
--   -- Pierogies
--   ('f0000000-0000-0000-0000-000000000100', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'dummy-pierogi-base',       'Pierogies',             'Handmade pierogies', 0.00,  false),
--   ('f0000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_pierogi_potato',      'Potato & Cheese',       'Sold by the dozen',  16.00, false),
--   ('f0000000-0000-0000-0000-000000000102', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_pierogi_sauerkraut',  'Sauerkraut & Bacon',    'SOLD OUT',           16.00, true),
--   ('f0000000-0000-0000-0000-000000000103', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_pierogi_farmers',     'Farmers Cheese',        '',                   16.00, false),
--   ('f0000000-0000-0000-0000-000000000104', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_pierogi_spinach',     'Spinach & Artichoke',   '',                   16.00, false),
--   ('f0000000-0000-0000-0000-000000000105', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_pierogi_prune',       'Prune',                 '',                   16.00, false),
--   ('f0000000-0000-0000-0000-000000000106', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_pierogi_cheesesteak', 'Cheesesteak',           '',                   16.00, false),
--   -- Classic Dinners
--   ('f0000000-0000-0000-0000-000000000110', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'dummy-classic-dinners',    'Classic Dinners',       'Oven ready meals',   0.00,  false),
--   ('f0000000-0000-0000-0000-000000000107', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_pot_pie',             'Chicken Pot Pie',       '',                   15.00, false),
--   ('f0000000-0000-0000-0000-000000000108', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_golabki',             'Golabki',               'Stuffed Cabbage',    15.00, false),
--   ('f0000000-0000-0000-0000-000000000109', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_quiche',              'Quiche Lorraine',       '',                   14.00, false),
--   -- Build Your Own
--   ('f0000000-0000-0000-0000-000000000200', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'item_byo',           'Build Your Own',              'Custom sandwich builder',                          10.00, false)
-- ON CONFLICT (organization_id, pos_provider, external_id) DO NOTHING;

-- -- ---------------------------------------------------------------------------
-- -- 9. POS Modifier Groups
-- -- ---------------------------------------------------------------------------
-- INSERT INTO public.pos_modifier_groups (id, organization_id, pos_provider, external_id, name, min_selected_modifiers, max_selected_modifiers) VALUES
--   ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'mg_bread_choice',   'Bread Choice',    1, 1),
--   ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'mg_premium_addons', 'Premium Add-ons', 0, 5),
--   ('e0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'mg_proteins',       'Proteins',        0, 3),
--   ('e0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'mg_spreads',        'Spreads',         0, 5),
--   ('e0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'mg_cheeses',        'Cheeses',         0, 3),
--   ('e0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000000', 'SQUARE', 'mg_extras',         'Extras',          0, 5)
-- ON CONFLICT DO NOTHING;

-- -- ---------------------------------------------------------------------------
-- -- 10. POS Modifier Options
-- -- ---------------------------------------------------------------------------
-- INSERT INTO public.pos_modifier_options (id, organization_id, modifier_group_id, pos_provider, external_id, name, price, is_sold_out) VALUES
--   -- Proteins
--   ('f0000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_turkey',         'Turkey',            3.50, false),
--   ('f0000000-0000-0000-0000-000000000202', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_chicken_salad',  'Chicken Salad',     3.50, false),
--   ('f0000000-0000-0000-0000-000000000203', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_ham',            'Ham',               3.50, false),
--   ('f0000000-0000-0000-0000-000000000204', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_salami',         'Salami/Pork Roll',  3.50, false),
--   ('f0000000-0000-0000-0000-000000000205', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_bacon',          'Bacon',             2.00, false),
--   ('f0000000-0000-0000-0000-000000000206', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_shaved_steak',   'Shaved Steak',      5.00, false),
--   ('f0000000-0000-0000-0000-000000000207', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_smash_patty',    'Smash Patty',       4.00, false),
--   ('f0000000-0000-0000-0000-000000000208', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000010', 'SQUARE', 'opt_grilled_chicken','Grilled Chicken',   4.00, false),
--   -- Spreads
--   ('f0000000-0000-0000-0000-000000000209', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_mayo',           'Mayo',              0.25, false),
--   ('f0000000-0000-0000-0000-000000000210', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_dijon',          'Dijon Mustard',     0.25, false),
--   ('f0000000-0000-0000-0000-000000000211', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_yellow_mustard', 'Yellow Mustard',    0.25, false),
--   ('f0000000-0000-0000-0000-000000000212', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_smash_sauce',    'House Smash Sauce', 0.25, false),
--   ('f0000000-0000-0000-0000-000000000213', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_chipotle_mayo',  'Chipotle Mayo',     0.25, false),
--   ('f0000000-0000-0000-0000-000000000214', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_cubano',         'Cubano Sauce',      0.25, false),
--   ('f0000000-0000-0000-0000-000000000215', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_horsey',         'Horsey Sauce',      0.25, false),
--   ('f0000000-0000-0000-0000-000000000216', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000011', 'SQUARE', 'opt_ranch',          'Ranch',             0.25, false),
--   -- Cheeses
--   ('f0000000-0000-0000-0000-000000000217', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000012', 'SQUARE', 'opt_american',       'American',          1.50, false),
--   ('f0000000-0000-0000-0000-000000000218', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000012', 'SQUARE', 'opt_provolone',      'Provolone',         1.50, false),
--   ('f0000000-0000-0000-0000-000000000219', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000012', 'SQUARE', 'opt_swiss',          'Swiss',             1.50, false),
--   ('f0000000-0000-0000-0000-000000000220', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000012', 'SQUARE', 'opt_extra_cheese',   'Extra Cheese',      1.50, false),
--   -- Extras
--   ('f0000000-0000-0000-0000-000000000221', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000013', 'SQUARE', 'opt_giardiniera',    'Hot Giardiniera',   0.75, false),
--   ('f0000000-0000-0000-0000-000000000222', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000013', 'SQUARE', 'opt_fried_egg',      'Fried Egg',         2.00, false),
--   ('f0000000-0000-0000-0000-000000000223', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000013', 'SQUARE', 'opt_extra_meat',     'Extra Meat Portion',3.50, false),
--   ('f0000000-0000-0000-0000-000000000224', 'd0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000013', 'SQUARE', 'opt_extra_spread',   'Extra Spread',      0.50, false)
-- ON CONFLICT DO NOTHING;

-- -- ---------------------------------------------------------------------------
-- -- 11. POS Item → Modifier Group links
-- -- ---------------------------------------------------------------------------
-- INSERT INTO public.pos_item_modifier_groups (pos_item_id, modifier_group_id) VALUES
--   ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
--   ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002'),
--   ('f0000000-0000-0000-0000-000000000200', 'e0000000-0000-0000-0000-000000000010'),
--   ('f0000000-0000-0000-0000-000000000200', 'e0000000-0000-0000-0000-000000000011'),
--   ('f0000000-0000-0000-0000-000000000200', 'e0000000-0000-0000-0000-000000000012'),
--   ('f0000000-0000-0000-0000-000000000200', 'e0000000-0000-0000-0000-000000000013')
-- ON CONFLICT DO NOTHING;

-- -- ---------------------------------------------------------------------------
-- -- 12. Vendors
-- -- ---------------------------------------------------------------------------
-- INSERT INTO public.vendors (id, organization_id, name, order_method, email, phone)
-- VALUES
--   ('c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000000', 'US Foods',             'EMAIL',  'orders@usfoods.com', NULL),
--   ('c0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000000', 'Local Produce Market', 'MANUAL', NULL,                 '555-0123')
-- ON CONFLICT (id) DO NOTHING;
