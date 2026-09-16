-- =============================================================================
-- sous.tools — V1 Init Schema (00000_v1_init.sql)
-- Consolidated absolute source of truth for V1 database initialization.
-- All tables: RLS enabled + forced, org-scoped policies, explicit GRANTs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. ENUMs
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE item_category AS ENUM (
    'INGREDIENT', 'PACKAGING', 'CLEANING', 'SMALLWARES', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE purchase_unit AS ENUM (
    'EACH', 'CASE', 'LB', 'KG', 'OZ', 'G', 'L', 'ML', 'GAL', 'QT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. App Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to app_settings" ON public.app_settings;
CREATE POLICY "Allow read access to app_settings" ON public.app_settings
  FOR SELECT TO authenticated, service_role, anon USING (true);

-- ---------------------------------------------------------------------------
-- 3. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE,
  logo_url      TEXT,
  design_tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 4. org_members + helper functions (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_org_members UNIQUE (organization_id, user_id)
);

DROP POLICY IF EXISTS "Members can view own org memberships non-recursive" ON org_members;
CREATE POLICY "Members can view own org memberships non-recursive"
  ON org_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    organization_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid
  );

DROP POLICY IF EXISTS "Admins can manage org memberships non-recursive" ON org_members;
CREATE POLICY "Admins can manage org memberships non-recursive"
  ON org_members FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid = organization_id
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid = organization_id
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  SET row_security = off
AS $$
  SELECT CASE
    WHEN org_id IS NULL THEN false
    WHEN auth.role() = 'service_role' OR current_user = 'postgres' OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN true
    ELSE EXISTS (
      SELECT 1 FROM org_members
      WHERE organization_id = org_id AND user_id = auth.uid()
    )
  END;
$$;

CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  SET row_security = off
AS $$
  SELECT CASE
    WHEN org_id IS NULL THEN false
    WHEN auth.role() = 'service_role' OR current_user = 'postgres' OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN true
    ELSE EXISTS (
      SELECT 1 FROM org_members
      WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  END;
$$;

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_role ON org_members(organization_id, role);

DROP POLICY IF EXISTS "org_members_read_organizations" ON organizations;
CREATE POLICY "org_members_read_organizations" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. user_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "user_profiles_self_or_org_admin" ON user_profiles;
CREATE POLICY "user_profiles_self_or_org_admin" ON user_profiles
  FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members caller
      WHERE caller.user_id = auth.uid() AND caller.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM org_members target
        WHERE target.user_id = user_profiles.user_id
        AND target.organization_id = caller.organization_id
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members caller
      WHERE caller.user_id = auth.uid() AND caller.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM org_members target
        WHERE target.user_id = user_profiles.user_id
        AND target.organization_id = caller.organization_id
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);

-- ---------------------------------------------------------------------------
-- 5.1 user_roles + is_superadmin helper function
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('SUPERADMIN', 'ADMIN', 'TENANT_MEMBER')) DEFAULT 'TENANT_MEMBER',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_user_roles UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role    ON user_roles(role);

CREATE OR REPLACE FUNCTION is_superadmin()
  RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'SUPERADMIN'
  );
$$;

DROP POLICY IF EXISTS "Users can view own user roles or superadmin view all" ON user_roles;
CREATE POLICY "Users can view own user roles or superadmin view all" ON user_roles
  FOR SELECT USING (user_id = auth.uid() OR is_superadmin());

DROP POLICY IF EXISTS "Superadmins can manage user roles" ON user_roles;
CREATE POLICY "Superadmins can manage user roles" ON user_roles
  FOR ALL USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- ---------------------------------------------------------------------------
-- 6. integrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('SQUARE', 'GOOGLE')),
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  expires_at      TIMESTAMP WITH TIME ZONE,
  scopes          TEXT[],
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT unique_org_provider UNIQUE (organization_id, provider)
);

DROP POLICY IF EXISTS "org_members_full_crud_integrations" ON integrations;
CREATE POLICY "org_members_full_crud_integrations" ON integrations
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 7. signage_devices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signage_devices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name               TEXT NOT NULL DEFAULT 'Unnamed Device',
  pairing_code       TEXT UNIQUE NOT NULL,
  is_paired          BOOLEAN DEFAULT false NOT NULL,
  last_seen_at       TIMESTAMP WITH TIME ZONE,
  timezone           TEXT NOT NULL DEFAULT 'UTC',
  maintenance_window JSONB NOT NULL DEFAULT '{"hour": 2, "minute": 0, "dayOfWeek": null}'::jsonb,
  operating_hours    JSONB NOT NULL DEFAULT '{"sleep_hour": 22, "sleep_minute": 0, "wake_hour": 6, "wake_minute": 0}'::jsonb,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_signage_devices" ON signage_devices;
CREATE POLICY "org_members_full_crud_signage_devices" ON signage_devices
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 8. signage_decks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signage_decks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'New Deck',
  slug            TEXT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_signage_decks_org_slug UNIQUE (organization_id, slug)
);

DROP POLICY IF EXISTS "org_members_full_crud_signage_decks" ON signage_decks;
CREATE POLICY "org_members_full_crud_signage_decks" ON signage_decks
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_signage_decks_org ON signage_decks(organization_id);

-- ---------------------------------------------------------------------------
-- 9. signage_layouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signage_layouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('SPLIT_SCREEN', 'FULL_SCREEN_SLIDESHOW', 'GRID_MENU')),
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_signage_layouts" ON signage_layouts;
CREATE POLICY "org_members_full_crud_signage_layouts" ON signage_layouts
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 10. signage_displays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signage_displays (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  device_id       UUID REFERENCES signage_devices(id) ON DELETE SET NULL,
  port_label      TEXT,
  deck_id         UUID REFERENCES signage_decks(id) ON DELETE SET NULL,
  last_seen_at    TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_signage_displays_device_port UNIQUE NULLS NOT DISTINCT (device_id, port_label),
  CONSTRAINT chk_signage_displays_valid_ports CHECK (port_label IN ('HDMI-A-1', 'HDMI-A-2', 'VIRTUAL', null))
);

DROP POLICY IF EXISTS "org_members_full_crud_signage_displays" ON signage_displays;
CREATE POLICY "org_members_full_crud_signage_displays" ON signage_displays
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_signage_displays_deck   ON signage_displays(deck_id);
CREATE INDEX IF NOT EXISTS idx_signage_displays_device ON signage_displays(device_id);
CREATE INDEX IF NOT EXISTS idx_signage_displays_port_label ON signage_displays(port_label);

-- ---------------------------------------------------------------------------
-- 11. vessel_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessel_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  shape           TEXT NOT NULL CHECK (shape IN ('ROUND', 'RECTANGULAR')),
  length          NUMERIC,
  width           NUMERIC,
  height          NUMERIC,
  diameter        NUMERIC,
  volume_ml       NUMERIC NOT NULL,
  vessel_category TEXT CHECK (vessel_category IN ('BAKERY_PAN', 'COOKWARE', 'GLASSWARE', 'STORAGE')),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_vessel_profiles" ON vessel_profiles;
CREATE POLICY "org_members_full_crud_vessel_profiles" ON vessel_profiles
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 12. master_items (Master Ingredients)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  density_g_ml          NUMERIC NOT NULL DEFAULT 1.0,
  standard_units        JSONB NOT NULL DEFAULT '{}'::jsonb,
  nutrition_macros      JSONB NOT NULL DEFAULT '{}'::jsonb,
  allergens             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ingredient_type       TEXT CHECK (ingredient_type IN (
    'GRAIN', 'DAIRY', 'EGG', 'MEAT', 'POULTRY', 'SEAFOOD',
    'PRODUCE', 'FAT_OIL', 'SWEETENER', 'SPICE_HERB',
    'LEAVENING', 'LIQUID', 'NUT_SEED', 'LEGUME',
    'PACKAGING', 'CLEANING', 'OTHER'
  )),
  is_animal_product     BOOLEAN DEFAULT false,
  is_meat               BOOLEAN DEFAULT false,
  is_seafood            BOOLEAN DEFAULT false,
  is_dairy              BOOLEAN DEFAULT false,
  is_egg                BOOLEAN DEFAULT false,
  is_gluten_source      BOOLEAN DEFAULT false,
  abv_percentage        NUMERIC DEFAULT 0.0,
  is_alcoholic          BOOLEAN DEFAULT false,
  is_global             BOOLEAN DEFAULT false,
  fdc_id                INTEGER,
  nutrition_verified_at TIMESTAMP WITH TIME ZONE,
  embedding             vector(768),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

CREATE OR REPLACE VIEW master_ingredients AS SELECT * FROM master_items;

DROP POLICY IF EXISTS "org_members_full_crud_master_items" ON master_items;
DROP POLICY IF EXISTS "master_items_select_policy" ON master_items;
CREATE POLICY "master_items_select_policy" ON master_items
  FOR SELECT USING (
    is_global = true OR organization_id IS NULL OR is_org_member(organization_id)
  );

DROP POLICY IF EXISTS "superadmin_manage_global_master_items" ON master_items;
CREATE POLICY "superadmin_manage_global_master_items" ON master_items
  FOR ALL USING (
    (is_global = true OR organization_id IS NULL) AND is_superadmin()
  )
  WITH CHECK (
    (is_global = true OR organization_id IS NULL) AND is_superadmin()
  );

DROP POLICY IF EXISTS "org_members_manage_tenant_master_items" ON master_items;
CREATE POLICY "org_members_manage_tenant_master_items" ON master_items
  FOR ALL USING (
    (is_global = false OR is_global IS NULL) AND organization_id IS NOT NULL AND is_org_member(organization_id)
  )
  WITH CHECK (
    (is_global = false OR is_global IS NULL) AND organization_id IS NOT NULL AND is_org_member(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 13. recipe_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  parent_id       UUID REFERENCES recipe_categories(id) ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_recipe_categories_org_name UNIQUE (organization_id, name)
);

DROP POLICY IF EXISTS "org_members_full_crud_recipe_categories" ON recipe_categories;
CREATE POLICY "org_members_full_crud_recipe_categories" ON recipe_categories
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 14. recipe_tags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_recipe_tags_org_name UNIQUE (organization_id, name)
);

DROP POLICY IF EXISTS "org_members_full_crud_recipe_tags" ON recipe_tags;
CREATE POLICY "org_members_full_crud_recipe_tags" ON recipe_tags
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 15. recipes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,
  parent_recipe_id    UUID REFERENCES recipes(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  yield_count         NUMERIC NOT NULL,
  yield_unit          TEXT NOT NULL,
  vessel_id           UUID REFERENCES vessel_profiles(id) ON DELETE SET NULL,
  category_id         UUID REFERENCES recipe_categories(id) ON DELETE SET NULL,
  instructions        JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              TEXT CHECK (status IN ('GLOBAL', 'REFERENCE', 'ACTIVE')) DEFAULT 'ACTIVE',
  is_global           BOOLEAN DEFAULT false,
  source_book         TEXT,
  source_author       TEXT,
  source_page_start   INTEGER,
  source_page_end     INTEGER,
  source_document_url TEXT,
  source_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  pos_item_id         TEXT,
  cost_per_yield      NUMERIC DEFAULT 0,
  gross_margin        NUMERIC DEFAULT 0,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

COMMENT ON COLUMN recipes.pos_item_id IS 'Links recipe to a synced POS item catalog entry';

DROP POLICY IF EXISTS "recipes_select_policy" ON recipes;
CREATE POLICY "recipes_select_policy" ON recipes
  FOR SELECT USING (
    is_global = true OR status = 'GLOBAL' OR (organization_id IS NOT NULL AND is_org_member(organization_id))
  );

DROP POLICY IF EXISTS "superadmin_manage_global_recipes" ON recipes;
CREATE POLICY "superadmin_manage_global_recipes" ON recipes
  FOR ALL USING (
    (is_global = true OR status = 'GLOBAL') AND is_superadmin()
  )
  WITH CHECK (
    (is_global = true OR status = 'GLOBAL') AND is_superadmin()
  );

DROP POLICY IF EXISTS "org_members_full_crud_recipes" ON recipes;
DROP POLICY IF EXISTS "org_members_manage_tenant_recipes" ON recipes;
CREATE POLICY "org_members_manage_tenant_recipes" ON recipes
  FOR ALL USING (
    (is_global = false OR is_global IS NULL) AND status != 'GLOBAL' AND organization_id IS NOT NULL AND is_org_member(organization_id)
  )
  WITH CHECK (
    (is_global = false OR is_global IS NULL) AND status != 'GLOBAL' AND organization_id IS NOT NULL AND is_org_member(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 16. items (Tenant Items Ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          item_category NOT NULL DEFAULT 'INGREDIENT',
  purchase_unit     purchase_unit NOT NULL DEFAULT 'LB',
  units_per_case    NUMERIC,
  each_weight_g     NUMERIC,
  density_g_ml      NUMERIC NOT NULL DEFAULT 1.0,
  shelf_life_days   INTEGER,
  is_animal_product BOOLEAN DEFAULT false,
  is_meat           BOOLEAN DEFAULT false,
  is_seafood        BOOLEAN DEFAULT false,
  is_dairy          BOOLEAN DEFAULT false,
  is_egg            BOOLEAN DEFAULT false,
  is_gluten_source  BOOLEAN DEFAULT false,
  allergens         TEXT[] DEFAULT '{}',
  fdc_id            INTEGER,
  nutrition_macros  JSONB DEFAULT '{}'::jsonb,
  current_cost_per_g NUMERIC,
  embedding         vector(768),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

DROP POLICY IF EXISTS "org_members_full_crud_items" ON items;
CREATE POLICY "org_members_full_crud_items" ON items
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_items_org       ON items(organization_id);
CREATE INDEX IF NOT EXISTS idx_items_name_trgm ON items USING gin(name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 17. recipe_ingredients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id             UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  master_item_id        UUID REFERENCES master_items(id) ON DELETE SET NULL,
  item_id               UUID REFERENCES items(id) ON DELETE SET NULL,
  calculation_type      TEXT NOT NULL CHECK (calculation_type IN ('fixed_weight', 'bakers_percentage')),
  base_calculation_group BOOLEAN DEFAULT false NOT NULL,
  amount                NUMERIC NOT NULL,
  unit                  TEXT NOT NULL,
  prep_notes            TEXT,
  prep_action           TEXT,
  ice_type              TEXT CHECK (ice_type IN ('NONE', 'CUBED', 'CRUSHED', 'LARGE_ROCK', 'PEBBLE')),
  is_garnish            BOOLEAN DEFAULT false,
  component             TEXT,
  raw_name              TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_recipe_ingredients" ON recipe_ingredients;
CREATE POLICY "org_members_full_crud_recipe_ingredients" ON recipe_ingredients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND (r.status = 'GLOBAL' OR (r.organization_id IS NOT NULL AND is_org_member(r.organization_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.organization_id IS NOT NULL AND is_org_member(r.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 18. recipe_tag_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_tag_assignments (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES recipe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_recipe_tag_assignments" ON recipe_tag_assignments;
CREATE POLICY "org_members_full_crud_recipe_tag_assignments" ON recipe_tag_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_tag_assignments.recipe_id
        AND (r.status = 'GLOBAL' OR (r.organization_id IS NOT NULL AND is_org_member(r.organization_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_tag_assignments.recipe_id
        AND r.organization_id IS NOT NULL AND is_org_member(r.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 19. formula_versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS formula_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id      UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title          TEXT NOT NULL,
  yield_count    NUMERIC NOT NULL,
  yield_unit     TEXT NOT NULL,
  vessel_id      UUID REFERENCES vessel_profiles(id) ON DELETE SET NULL,
  instructions   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ingredients    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_formula_versions" ON formula_versions;
CREATE POLICY "org_members_full_crud_formula_versions" ON formula_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = formula_versions.recipe_id
        AND (r.status = 'GLOBAL' OR (r.organization_id IS NOT NULL AND is_org_member(r.organization_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = formula_versions.recipe_id
        AND r.organization_id IS NOT NULL AND is_org_member(r.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 20. recipe_nutrition_cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_nutrition_cache (
  recipe_id             UUID PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  servings              NUMERIC NOT NULL DEFAULT 1,
  per_serving_nutrition JSONB NOT NULL DEFAULT '{}'::jsonb,
  per_100g_nutrition    JSONB NOT NULL DEFAULT '{}'::jsonb,
  dietary_flags         JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at           TIMESTAMP WITH TIME ZONE DEFAULT now()
);

DROP POLICY IF EXISTS "org_members_full_crud_recipe_nutrition_cache" ON recipe_nutrition_cache;
CREATE POLICY "org_members_full_crud_recipe_nutrition_cache" ON recipe_nutrition_cache
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_nutrition_cache.recipe_id
        AND (r.status = 'GLOBAL' OR (r.organization_id IS NOT NULL AND is_org_member(r.organization_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_nutrition_cache.recipe_id
        AND r.organization_id IS NOT NULL AND is_org_member(r.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 21. vendors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  order_method            TEXT NOT NULL DEFAULT 'MANUAL' CHECK (order_method IN ('EMAIL', 'SMS', 'MANUAL', 'email', 'text')),
  order_days              JSONB DEFAULT '[]'::jsonb,
  email                   TEXT,
  phone                   TEXT,
  customer_account_number TEXT,
  terms                   TEXT,
  route                   TEXT,
  sales_rep               TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_vendors" ON vendors;
CREATE POLICY "org_members_full_crud_vendors" ON vendors
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 22. whiteboard_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whiteboard_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_name        TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT true NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_whiteboard_items" ON whiteboard_items;
CREATE POLICY "org_members_full_crud_whiteboard_items" ON whiteboard_items
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 23. purchase_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'RECEIVED', 'RECONCILED')),
  order_date      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_purchase_orders" ON purchase_orders;
CREATE POLICY "org_members_full_crud_purchase_orders" ON purchase_orders
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 24. purchase_order_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  raw_name        TEXT NOT NULL,
  ordered_qty     NUMERIC NOT NULL,
  price_per_unit  NUMERIC DEFAULT 0 NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_purchase_order_items" ON purchase_order_items;
CREATE POLICY "org_members_full_crud_purchase_order_items" ON purchase_order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND is_org_member(po.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND is_org_member(po.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 25. pos_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pos_provider    TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, pos_provider, external_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_categories" ON public.pos_categories;
CREATE POLICY "org_members_full_crud_pos_categories" ON public.pos_categories
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 26. pos_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES public.pos_categories(id) ON DELETE SET NULL,
  pos_provider    TEXT NOT NULL CHECK (pos_provider IN ('SQUARE', 'TOAST', 'MANUAL')),
  external_id     TEXT,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  image_url       TEXT,
  is_sold_out     BOOLEAN DEFAULT false NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT unique_org_pos_item UNIQUE (organization_id, pos_provider, external_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_items" ON pos_items;
CREATE POLICY "org_members_full_crud_pos_items" ON pos_items
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_pos_items_org ON pos_items(organization_id);

-- ---------------------------------------------------------------------------
-- 27. pos_modifier_groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_modifier_groups (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pos_provider           TEXT NOT NULL CHECK (pos_provider IN ('SQUARE', 'TOAST', 'MANUAL')),
  external_id            TEXT,
  name                   TEXT NOT NULL,
  min_selected_modifiers INTEGER,
  max_selected_modifiers INTEGER,
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT unique_org_pos_modifier_group UNIQUE (organization_id, pos_provider, external_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_modifier_groups" ON pos_modifier_groups;
CREATE POLICY "org_members_full_crud_pos_modifier_groups" ON pos_modifier_groups
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_pos_modifier_groups_org ON pos_modifier_groups(organization_id);

-- ---------------------------------------------------------------------------
-- 28. pos_modifier_options
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_modifier_options (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES pos_modifier_groups(id) ON DELETE CASCADE,
  pos_provider      TEXT NOT NULL CHECK (pos_provider IN ('SQUARE', 'TOAST', 'MANUAL')),
  external_id       TEXT,
  name              TEXT NOT NULL,
  price             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_sold_out       BOOLEAN DEFAULT false NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT unique_org_pos_modifier_option UNIQUE (organization_id, pos_provider, external_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_modifier_options" ON pos_modifier_options;
CREATE POLICY "org_members_full_crud_pos_modifier_options" ON pos_modifier_options
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_pos_modifier_options_group ON pos_modifier_options(modifier_group_id);

-- ---------------------------------------------------------------------------
-- 29. pos_item_modifier_groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_item_modifier_groups (
  pos_item_id       UUID NOT NULL REFERENCES pos_items(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES pos_modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (pos_item_id, modifier_group_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_item_modifier_groups" ON pos_item_modifier_groups;
CREATE POLICY "org_members_full_crud_pos_item_modifier_groups" ON pos_item_modifier_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pos_items pi
      WHERE pi.id = pos_item_modifier_groups.pos_item_id
        AND is_org_member(pi.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pos_items pi
      WHERE pi.id = pos_item_modifier_groups.pos_item_id
        AND is_org_member(pi.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 30. pos_item_local_overlays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_item_local_overlays (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pos_item_id     UUID NOT NULL UNIQUE REFERENCES pos_items(id) ON DELETE CASCADE,
  name            TEXT,
  description     TEXT,
  price           NUMERIC(10,2),
  is_sold_out     BOOLEAN,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_item_local_overlays" ON pos_item_local_overlays;
CREATE POLICY "org_members_full_crud_pos_item_local_overlays" ON pos_item_local_overlays
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_pos_item_local_overlays_item ON pos_item_local_overlays(pos_item_id);

-- ---------------------------------------------------------------------------
-- 31. pos_discounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_discounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pos_provider         TEXT NOT NULL,
  external_id          TEXT NOT NULL,
  name                 TEXT NOT NULL,
  discount_type        TEXT NOT NULL,
  amount_or_percentage NUMERIC NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, pos_provider, external_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_discounts" ON public.pos_discounts;
CREATE POLICY "org_members_full_crud_pos_discounts" ON public.pos_discounts
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 32. pos_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pos_provider         TEXT NOT NULL,
  external_id          TEXT NOT NULL,
  location_id          TEXT,
  state                TEXT NOT NULL,
  total_money          NUMERIC NOT NULL DEFAULT 0,
  total_discount_money NUMERIC NOT NULL DEFAULT 0,
  total_tax_money      NUMERIC NOT NULL DEFAULT 0,
  closed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_pos_order UNIQUE (organization_id, pos_provider, external_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_orders" ON public.pos_orders;
CREATE POLICY "org_members_full_crud_pos_orders" ON public.pos_orders
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 33. pos_order_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_order_line_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pos_order_id         UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  pos_item_id          UUID REFERENCES public.pos_items(id) ON DELETE SET NULL,
  external_id          TEXT NOT NULL,
  name                 TEXT NOT NULL DEFAULT 'Unnamed Item',
  quantity             NUMERIC NOT NULL DEFAULT 1,
  base_price_money     NUMERIC NOT NULL DEFAULT 0,
  gross_sales_money    NUMERIC NOT NULL DEFAULT 0,
  total_discount_money NUMERIC NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'OPEN',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_pos_order_line_item UNIQUE (pos_order_id, external_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_order_line_items" ON public.pos_order_line_items;
CREATE POLICY "org_members_full_crud_pos_order_line_items" ON public.pos_order_line_items
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 34. pos_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pos_item_id             UUID REFERENCES pos_items(id) ON DELETE SET NULL,
  quantity_sold           INTEGER NOT NULL DEFAULT 1,
  gross_revenue           NUMERIC NOT NULL,
  discount_amount         NUMERIC DEFAULT 0,
  transaction_time        TIMESTAMPTZ NOT NULL,
  source                  TEXT NOT NULL DEFAULT 'square',
  external_transaction_id TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_pos_ext_txn UNIQUE (external_transaction_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_transactions" ON pos_transactions;
CREATE POLICY "org_members_full_crud_pos_transactions" ON pos_transactions
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_pos_transactions_org_time ON pos_transactions(organization_id, transaction_time DESC);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_item     ON pos_transactions(pos_item_id);
CREATE INDEX IF NOT EXISTS idx_pos_txn_ext_id            ON pos_transactions(external_transaction_id) WHERE external_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 35. pos_item_recipe_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_item_recipe_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pos_item_id      UUID NOT NULL REFERENCES pos_items(id) ON DELETE CASCADE,
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  portion_fraction NUMERIC NOT NULL DEFAULT 1.0,
  CONSTRAINT uq_pos_item_recipe UNIQUE (pos_item_id, recipe_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_pos_links" ON pos_item_recipe_links;
CREATE POLICY "org_members_full_crud_pos_links" ON pos_item_recipe_links
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_pos_item_recipe_links_pos    ON pos_item_recipe_links(pos_item_id);
CREATE INDEX IF NOT EXISTS idx_pos_item_recipe_links_recipe ON pos_item_recipe_links(recipe_id);

-- ---------------------------------------------------------------------------
-- 36. price_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id         UUID REFERENCES vendors(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_unit     purchase_unit NOT NULL,
  unit_cost         NUMERIC NOT NULL,
  effective_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  note              TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

DROP POLICY IF EXISTS "org_members_full_crud_price_history" ON price_history;
CREATE POLICY "org_members_full_crud_price_history" ON price_history
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_price_history_item_date ON price_history(item_id, effective_date DESC);

-- ---------------------------------------------------------------------------
-- 37. wastage_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wastage_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  amount_g        NUMERIC NOT NULL,
  reason          TEXT,
  recorded_at     TIMESTAMPTZ DEFAULT now(),
  recorded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_wastage_ledger" ON wastage_ledger;
CREATE POLICY "org_members_full_crud_wastage_ledger" ON wastage_ledger
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_wastage_org_date ON wastage_ledger(organization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_wastage_item      ON wastage_ledger(item_id);

-- ---------------------------------------------------------------------------
-- 38. inventory_on_hand
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_on_hand (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity_g      NUMERIC NOT NULL DEFAULT 0,
  lot_number      TEXT,
  lot_expiry      DATE,
  location        TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_inventory_item_lot UNIQUE (organization_id, item_id, lot_number)
);

DROP POLICY IF EXISTS "org_members_full_crud_inventory" ON inventory_on_hand;
CREATE POLICY "org_members_full_crud_inventory" ON inventory_on_hand
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_inventory_org_item ON inventory_on_hand(organization_id, item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry   ON inventory_on_hand(lot_expiry ASC) WHERE lot_expiry IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 39. container_mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS container_mapping (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  vessel_id        UUID NOT NULL REFERENCES vessel_profiles(id) ON DELETE CASCADE,
  target_weight_g  NUMERIC NOT NULL,
  notes            TEXT,
  CONSTRAINT uq_container_mapping UNIQUE (recipe_id, vessel_id)
);

DROP POLICY IF EXISTS "org_members_full_crud_container_mapping" ON container_mapping;
CREATE POLICY "org_members_full_crud_container_mapping" ON container_mapping
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = container_mapping.recipe_id
        AND (r.status = 'GLOBAL' OR (r.organization_id IS NOT NULL AND is_org_member(r.organization_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = container_mapping.recipe_id
        AND r.organization_id IS NOT NULL AND is_org_member(r.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 40. par_level_suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS par_level_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  suggested_par_g   NUMERIC NOT NULL,
  current_par_g     NUMERIC,
  avg_daily_usage_g NUMERIC,
  lead_time_days    NUMERIC,
  safety_factor     NUMERIC DEFAULT 1.25,
  confidence        NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  reasoning         TEXT,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  generated_at      TIMESTAMPTZ DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_par_level_suggestions" ON par_level_suggestions;
CREATE POLICY "org_members_full_crud_par_level_suggestions" ON par_level_suggestions
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_par_suggestions_org_status ON par_level_suggestions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_par_suggestions_item       ON par_level_suggestions(item_id);

-- ---------------------------------------------------------------------------
-- 41. ingestion_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID,
  source              TEXT NOT NULL,
  source_name         TEXT,
  source_document_url TEXT,
  raw_text            TEXT,
  parsed_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_ingestion_reviews" ON ingestion_reviews;
CREATE POLICY "org_members_full_crud_ingestion_reviews" ON ingestion_reviews
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 42. vendor_item_aliases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_item_aliases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_id          UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  vendor_item_string TEXT NOT NULL,
  item_id            UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_vendor_item_aliases UNIQUE (organization_id, vendor_id, vendor_item_string)
);

DROP POLICY IF EXISTS "org_members_full_crud_vendor_item_aliases" ON vendor_item_aliases;
CREATE POLICY "org_members_full_crud_vendor_item_aliases" ON vendor_item_aliases
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 43. notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  link            TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "user_read_own_notifications" ON notifications;
CREATE POLICY "user_read_own_notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "user_update_own_notifications" ON notifications;
CREATE POLICY "user_update_own_notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "service_role_manage_notifications" ON notifications;
CREATE POLICY "service_role_manage_notifications" ON notifications
  FOR ALL TO service_role USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ---------------------------------------------------------------------------
-- 44. processed_webhook_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id   TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "service_role_manage_webhook_events" ON processed_webhook_events;
CREATE POLICY "service_role_manage_webhook_events" ON processed_webhook_events
  FOR ALL TO service_role USING (true);

REVOKE ALL ON processed_webhook_events FROM authenticated;

-- ---------------------------------------------------------------------------
-- 45. tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_number    TEXT,
  section         TEXT,
  status          TEXT CHECK (status IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_tickets" ON public.tickets;
CREATE POLICY "org_members_full_crud_tickets" ON public.tickets
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 46. orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  status          TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_orders" ON public.orders;
CREATE POLICY "org_members_full_crud_orders" ON public.orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = orders.ticket_id
        AND is_org_member(t.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = orders.ticket_id
        AND is_org_member(t.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 47. order_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,
  quantity        NUMERIC NOT NULL DEFAULT 1,
  unit_price      NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_order_items" ON public.order_items;
CREATE POLICY "org_members_full_crud_order_items" ON public.order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN tickets t ON t.id = o.ticket_id
      WHERE o.id = order_items.order_id
        AND is_org_member(t.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN tickets t ON t.id = o.ticket_id
      WHERE o.id = order_items.order_id
        AND is_org_member(t.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 48. shifts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time      TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time        TIMESTAMP WITH TIME ZONE,
  role            TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_shifts" ON public.shifts;
CREATE POLICY "org_members_full_crud_shifts" ON public.shifts
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 49. time_clocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_clocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in        TIMESTAMP WITH TIME ZONE NOT NULL,
  clock_out       TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_time_clocks" ON public.time_clocks;
CREATE POLICY "org_members_full_crud_time_clocks" ON public.time_clocks
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 50. invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  po_id           UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  invoice_number  TEXT NOT NULL,
  total_amount    NUMERIC NOT NULL,
  invoice_date    DATE NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_invoices" ON public.invoices;
CREATE POLICY "org_members_full_crud_invoices" ON public.invoices
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 51. invoice_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  raw_name        TEXT NOT NULL,
  item_id         UUID REFERENCES items(id) ON DELETE SET NULL,
  quantity        NUMERIC NOT NULL,
  unit_price      NUMERIC NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_invoice_items" ON public.invoice_items;
CREATE POLICY "org_members_full_crud_invoice_items" ON public.invoice_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND is_org_member(inv.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND is_org_member(inv.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 52. wastage_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wastage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES items(id) ON DELETE SET NULL,
  recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,
  quantity        NUMERIC NOT NULL,
  reason          TEXT,
  recorded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_wastage_logs" ON public.wastage_logs;
CREATE POLICY "org_members_full_crud_wastage_logs" ON public.wastage_logs
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 53. core_knowledge_vectors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.core_knowledge_vectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  embedding       vector(768),
  source_meta     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_global       BOOLEAN DEFAULT false,
  document_type   TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "core_knowledge_vectors_select_policy" ON public.core_knowledge_vectors;
CREATE POLICY "core_knowledge_vectors_select_policy" ON public.core_knowledge_vectors
  FOR SELECT USING (
    is_global = true OR organization_id IS NULL OR is_org_member(organization_id)
  );

DROP POLICY IF EXISTS "superadmin_manage_global_core_knowledge_vectors" ON public.core_knowledge_vectors;
CREATE POLICY "superadmin_manage_global_core_knowledge_vectors" ON public.core_knowledge_vectors
  FOR ALL USING (
    is_global = true AND is_superadmin()
  )
  WITH CHECK (
    is_global = true AND is_superadmin()
  );

DROP POLICY IF EXISTS "org_members_crud_core_knowledge_vectors" ON public.core_knowledge_vectors;
DROP POLICY IF EXISTS "org_members_manage_tenant_core_knowledge_vectors" ON public.core_knowledge_vectors;
CREATE POLICY "org_members_manage_tenant_core_knowledge_vectors" ON public.core_knowledge_vectors
  FOR ALL USING (
    (is_global = false OR is_global IS NULL) AND organization_id IS NOT NULL AND is_org_member(organization_id)
  )
  WITH CHECK (
    (is_global = false OR is_global IS NULL) AND organization_id IS NOT NULL AND is_org_member(organization_id)
  );

CREATE INDEX IF NOT EXISTS idx_core_knowledge_vectors_org ON public.core_knowledge_vectors(organization_id);
CREATE INDEX IF NOT EXISTS idx_core_knowledge_vectors_global ON public.core_knowledge_vectors(is_global);
CREATE INDEX IF NOT EXISTS idx_core_knowledge_vectors_doc_type ON public.core_knowledge_vectors(document_type);

-- ---------------------------------------------------------------------------
-- 54. tenant_library_books
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_library_books (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  total_pages     INTEGER DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

DROP POLICY IF EXISTS "org_members_full_crud_tenant_library_books" ON public.tenant_library_books;
CREATE POLICY "org_members_full_crud_tenant_library_books" ON public.tenant_library_books
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_tenant_library_books_org ON public.tenant_library_books(organization_id);

-- ---------------------------------------------------------------------------
-- 55. ingredient_substitutions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ingredient_substitutions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_ingredient_id     UUID NOT NULL REFERENCES public.master_items(id) ON DELETE CASCADE,
  substitute_ingredient_id UUID NOT NULL REFERENCES public.master_items(id) ON DELETE CASCADE,
  multiplier               NUMERIC NOT NULL DEFAULT 1.0,
  impact_metrics           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at               TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT uq_ingredient_substitutions UNIQUE NULLS NOT DISTINCT (organization_id, parent_ingredient_id, substitute_ingredient_id)
);

DROP POLICY IF EXISTS "ingredient_substitutions_select_policy" ON public.ingredient_substitutions;
CREATE POLICY "ingredient_substitutions_select_policy" ON public.ingredient_substitutions
  FOR SELECT USING (organization_id IS NULL OR is_org_member(organization_id));

DROP POLICY IF EXISTS "org_members_crud_ingredient_substitutions" ON public.ingredient_substitutions;
CREATE POLICY "org_members_crud_ingredient_substitutions" ON public.ingredient_substitutions
  FOR ALL USING (organization_id IS NOT NULL AND is_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_ingredient_subs_parent ON public.ingredient_substitutions(parent_ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_subs_sub    ON public.ingredient_substitutions(substitute_ingredient_id);

-- ---------------------------------------------------------------------------
-- 56. Functions & Vector RPCs
-- ---------------------------------------------------------------------------

-- update_item_current_cost
CREATE OR REPLACE FUNCTION update_item_current_cost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  grams_per_unit      NUMERIC;
  item_density        NUMERIC;
  item_each_weight    NUMERIC;
  item_units_per_case NUMERIC;
BEGIN
  SELECT density_g_ml, each_weight_g, units_per_case
  INTO item_density, item_each_weight, item_units_per_case
  FROM items WHERE id = NEW.item_id;

  grams_per_unit := CASE NEW.purchase_unit::TEXT
    WHEN 'LB'   THEN 453.59237
    WHEN 'KG'   THEN 1000.0
    WHEN 'OZ'   THEN 28.349523
    WHEN 'G'    THEN 1.0
    WHEN 'GAL'  THEN 3785.41 * COALESCE(item_density, 1.0)
    WHEN 'QT'   THEN 946.353 * COALESCE(item_density, 1.0)
    WHEN 'L'    THEN 1000.0  * COALESCE(item_density, 1.0)
    WHEN 'ML'   THEN 1.0     * COALESCE(item_density, 1.0)
    WHEN 'EACH' THEN COALESCE(item_each_weight, 1.0)
    WHEN 'CASE' THEN COALESCE(item_each_weight, 1.0) * COALESCE(item_units_per_case, 1.0)
    ELSE 1.0
  END;

  UPDATE items
  SET current_cost_per_g = NEW.unit_cost / NULLIF(grams_per_unit, 0),
      updated_at = now()
  WHERE id = NEW.item_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_history_cost_rollup ON price_history;
CREATE TRIGGER trg_price_history_cost_rollup
  AFTER INSERT ON price_history
  FOR EACH ROW EXECUTE FUNCTION update_item_current_cost();

-- handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_vendors_updated_at ON vendors;
CREATE TRIGGER set_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- match_items (RPC)
CREATE OR REPLACE FUNCTION public.match_items(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  org_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.name,
    (1 - (items.embedding <=> query_embedding))::float AS similarity
  FROM public.items
  WHERE items.organization_id = org_id
    AND items.embedding IS NOT NULL
    AND (1 - (items.embedding <=> query_embedding)) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- match_master_items (RPC)
CREATE OR REPLACE FUNCTION public.match_master_items(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  name text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    master_items.id,
    master_items.name,
    (1 - (master_items.embedding <=> query_embedding))::float AS similarity
  FROM public.master_items
  WHERE master_items.embedding IS NOT NULL
    AND (1 - (master_items.embedding <=> query_embedding)) > match_threshold
  ORDER BY master_items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 54. Neo4j Sync Trigger Function & Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_neo4j_sync()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  res_id BIGINT;
  sync_url TEXT;
BEGIN
  BEGIN
    SELECT value INTO sync_url FROM public.app_settings WHERE key = 'neo4j_sync_url';
  EXCEPTION WHEN OTHERS THEN
    sync_url := NULL;
  END;

  sync_url := COALESCE(
    sync_url,
    'http://host.docker.internal:3001/webhooks/neo4j-sync'
  );

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END
  );

  SELECT net.http_post(
    url := sync_url,
    body := payload,
    headers := '{"Content-Type": "application/json", "x-supabase-signature": "sous-tools-neo4j-sync-secret-key"}'::jsonb
  ) INTO res_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Neo4j sync triggers
DROP TRIGGER IF EXISTS on_auth_user_sync ON auth.users;
CREATE TRIGGER on_auth_user_sync
  AFTER INSERT OR UPDATE OR DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_organization_sync ON public.organizations;
CREATE TRIGGER on_organization_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_org_members_sync ON public.org_members;
CREATE TRIGGER on_org_members_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_user_profiles_sync ON public.user_profiles;
CREATE TRIGGER on_user_profiles_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_user_roles_sync ON public.user_roles;
CREATE TRIGGER on_user_roles_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_integrations_sync ON public.integrations;
CREATE TRIGGER on_integrations_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_signage_devices_sync ON public.signage_devices;
CREATE TRIGGER on_signage_devices_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.signage_devices
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_signage_decks_sync ON public.signage_decks;
CREATE TRIGGER on_signage_decks_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.signage_decks
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_signage_layouts_sync ON public.signage_layouts;
CREATE TRIGGER on_signage_layouts_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.signage_layouts
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_signage_displays_sync ON public.signage_displays;
CREATE TRIGGER on_signage_displays_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.signage_displays
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_vessel_profiles_sync ON public.vessel_profiles;
CREATE TRIGGER on_vessel_profiles_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.vessel_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_master_items_sync ON public.master_items;
CREATE TRIGGER on_master_items_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.master_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_recipe_categories_sync ON public.recipe_categories;
CREATE TRIGGER on_recipe_categories_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_recipe_tags_sync ON public.recipe_tags;
CREATE TRIGGER on_recipe_tags_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_tags
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_recipe_sync ON public.recipes;
CREATE TRIGGER on_recipe_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_recipe_ingredient_sync ON public.recipe_ingredients;
CREATE TRIGGER on_recipe_ingredient_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_recipe_tag_assignments_sync ON public.recipe_tag_assignments;
CREATE TRIGGER on_recipe_tag_assignments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_tag_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_formula_versions_sync ON public.formula_versions;
CREATE TRIGGER on_formula_versions_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.formula_versions
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_recipe_nutrition_cache_sync ON public.recipe_nutrition_cache;
CREATE TRIGGER on_recipe_nutrition_cache_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_nutrition_cache
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_vendor_sync ON public.vendors;
CREATE TRIGGER on_vendor_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_whiteboard_items_sync ON public.whiteboard_items;
CREATE TRIGGER on_whiteboard_items_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.whiteboard_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_purchase_order_sync ON public.purchase_orders;
CREATE TRIGGER on_purchase_order_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_purchase_order_item_sync ON public.purchase_order_items;
CREATE TRIGGER on_purchase_order_item_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_categories_sync ON public.pos_categories;
CREATE TRIGGER on_pos_categories_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_items_sync ON public.pos_items;
CREATE TRIGGER on_pos_items_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_modifier_groups_sync ON public.pos_modifier_groups;
CREATE TRIGGER on_pos_modifier_groups_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_modifier_options_sync ON public.pos_modifier_options;
CREATE TRIGGER on_pos_modifier_options_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_modifier_options
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_item_modifier_groups_sync ON public.pos_item_modifier_groups;
CREATE TRIGGER on_pos_item_modifier_groups_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_item_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_item_local_overlays_sync ON public.pos_item_local_overlays;
CREATE TRIGGER on_pos_item_local_overlays_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_item_local_overlays
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_discounts_sync ON public.pos_discounts;
CREATE TRIGGER on_pos_discounts_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_discounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_orders_sync ON public.pos_orders;
CREATE TRIGGER on_pos_orders_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_order_line_items_sync ON public.pos_order_line_items;
CREATE TRIGGER on_pos_order_line_items_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_transactions_sync ON public.pos_transactions;
CREATE TRIGGER on_pos_transactions_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_pos_item_recipe_links_sync ON public.pos_item_recipe_links;
CREATE TRIGGER on_pos_item_recipe_links_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_item_recipe_links
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_item_sync ON public.items;
CREATE TRIGGER on_item_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_price_history_sync ON public.price_history;
CREATE TRIGGER on_price_history_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.price_history
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_wastage_ledger_sync ON public.wastage_ledger;
CREATE TRIGGER on_wastage_ledger_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.wastage_ledger
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_inventory_on_hand_sync ON public.inventory_on_hand;
CREATE TRIGGER on_inventory_on_hand_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_on_hand
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_container_mapping_sync ON public.container_mapping;
CREATE TRIGGER on_container_mapping_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.container_mapping
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_par_level_suggestions_sync ON public.par_level_suggestions;
CREATE TRIGGER on_par_level_suggestions_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.par_level_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_ingestion_reviews_sync ON public.ingestion_reviews;
CREATE TRIGGER on_ingestion_reviews_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.ingestion_reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_vendor_item_alias_sync ON public.vendor_item_aliases;
CREATE TRIGGER on_vendor_item_alias_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.vendor_item_aliases
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_notifications_sync ON public.notifications;
CREATE TRIGGER on_notifications_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_ticket_sync ON public.tickets;
CREATE TRIGGER on_ticket_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_order_sync ON public.orders;
CREATE TRIGGER on_order_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_order_item_sync ON public.order_items;
CREATE TRIGGER on_order_item_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_shift_sync ON public.shifts;
CREATE TRIGGER on_shift_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_time_clock_sync ON public.time_clocks;
CREATE TRIGGER on_time_clock_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.time_clocks
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_invoice_sync ON public.invoices;
CREATE TRIGGER on_invoice_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_invoice_item_sync ON public.invoice_items;
CREATE TRIGGER on_invoice_item_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_wastage_log_sync ON public.wastage_logs;
CREATE TRIGGER on_wastage_log_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.wastage_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_core_knowledge_vectors_sync ON public.core_knowledge_vectors;
CREATE TRIGGER on_core_knowledge_vectors_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.core_knowledge_vectors
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_tenant_library_books_sync ON public.tenant_library_books;
CREATE TRIGGER on_tenant_library_books_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_library_books
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

DROP TRIGGER IF EXISTS on_ingredient_substitutions_sync ON public.ingredient_substitutions;
CREATE TRIGGER on_ingredient_substitutions_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.ingredient_substitutions
  FOR EACH ROW EXECUTE FUNCTION public.handle_neo4j_sync();

-- ---------------------------------------------------------------------------
-- 55. Views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW sales_velocity_7d AS
SELECT
  pos_item_id,
  organization_id,
  SUM(quantity_sold) AS units_7d,
  SUM(gross_revenue) AS revenue_7d
FROM pos_transactions
WHERE transaction_time >= NOW() - INTERVAL '7 days'
GROUP BY pos_item_id, organization_id;

CREATE OR REPLACE VIEW sales_velocity_30d AS
SELECT
  pos_item_id,
  organization_id,
  SUM(quantity_sold) AS units_30d,
  SUM(gross_revenue) AS revenue_30d
FROM pos_transactions
WHERE transaction_time >= NOW() - INTERVAL '30 days'
GROUP BY pos_item_id, organization_id;

-- ---------------------------------------------------------------------------
-- 56. Storage Buckets & Storage RLS
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ingestion-sources',
  'ingestion-sources',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
) ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Anyone can read ingestion sources" ON storage.objects;
CREATE POLICY "Anyone can read ingestion sources"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'ingestion-sources');

DROP POLICY IF EXISTS "Org members can upload ingestion sources" ON storage.objects;
CREATE POLICY "Org members can upload ingestion sources"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ingestion-sources');

DROP POLICY IF EXISTS "Service role can manage ingestion sources" ON storage.objects;
CREATE POLICY "Service role can manage ingestion sources"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'ingestion-sources');

-- ---------------------------------------------------------------------------
-- 57. RLS Enforcement on ALL Tables
-- ---------------------------------------------------------------------------
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members FORCE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE signage_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE signage_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_decks FORCE ROW LEVEL SECURITY;
ALTER TABLE signage_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_layouts FORCE ROW LEVEL SECURITY;
ALTER TABLE signage_displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_displays FORCE ROW LEVEL SECURITY;
ALTER TABLE vessel_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE master_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_items FORCE ROW LEVEL SECURITY;
ALTER TABLE recipe_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE recipe_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients FORCE ROW LEVEL SECURITY;
ALTER TABLE recipe_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tag_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE formula_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE formula_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE recipe_nutrition_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_nutrition_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_items FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_items FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_modifier_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_modifier_options FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_item_modifier_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_item_local_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_item_local_overlays FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_discounts FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_order_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_item_recipe_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_item_recipe_links FORCE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history FORCE ROW LEVEL SECURITY;
ALTER TABLE wastage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_on_hand ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_on_hand FORCE ROW LEVEL SECURITY;
ALTER TABLE container_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_mapping FORCE ROW LEVEL SECURITY;
ALTER TABLE par_level_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE par_level_suggestions FORCE ROW LEVEL SECURITY;
ALTER TABLE ingestion_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE vendor_item_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_item_aliases FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE time_clocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clocks FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE wastage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE core_knowledge_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_knowledge_vectors FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_library_books FORCE ROW LEVEL SECURITY;
ALTER TABLE ingredient_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_substitutions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 58. Schema Grants & Default Privileges
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION update_item_current_cost() TO service_role;

GRANT SELECT ON sales_velocity_7d  TO anon, authenticated, service_role;
GRANT SELECT ON sales_velocity_30d TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
