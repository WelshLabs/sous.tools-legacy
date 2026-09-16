-- Add UI metadata columns to chat_messages so render directives and parsed payloads
-- can be stored alongside the message for client refresh/load consistency.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS ui_action JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recipe_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoice_data JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_ui_action ON chat_messages USING GIN (ui_action jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipe_data ON chat_messages USING GIN (recipe_data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_chat_messages_invoice_data ON chat_messages USING GIN (invoice_data jsonb_path_ops);
