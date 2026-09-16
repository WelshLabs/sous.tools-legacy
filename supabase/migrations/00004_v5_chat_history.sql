CREATE TABLE IF NOT EXISTS chat_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_full_crud_chat_conversations" ON chat_conversations;
CREATE POLICY "org_members_full_crud_chat_conversations" ON chat_conversations
  FOR ALL USING (
    organization_id = 'd0000000-0000-0000-0000-000000000000'::uuid
    OR is_org_member(organization_id)
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    organization_id = 'd0000000-0000-0000-0000-000000000000'::uuid
    OR is_org_member(organization_id)
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_full_crud_chat_messages" ON chat_messages;
CREATE POLICY "org_members_full_crud_chat_messages" ON chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (
          c.organization_id = 'd0000000-0000-0000-0000-000000000000'::uuid
          OR is_org_member(c.organization_id)
          OR auth.role() = 'service_role'
          OR current_user = 'postgres'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (
          c.organization_id = 'd0000000-0000-0000-0000-000000000000'::uuid
          OR is_org_member(c.organization_id)
          OR auth.role() = 'service_role'
          OR current_user = 'postgres'
        )
    )
  );
