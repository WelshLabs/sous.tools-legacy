-- Add deleted_at globally to the primary tables
ALTER TABLE IF EXISTS recipes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS pos_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS displays ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS display_layouts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS square_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS square_line_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add version column for Optimistic Concurrency Control (OCC)
ALTER TABLE IF EXISTS recipes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE IF EXISTS pos_items ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Create indexes for performance on deleted_at
CREATE INDEX IF NOT EXISTS idx_recipes_deleted_at ON recipes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pos_items_deleted_at ON pos_items(deleted_at);
