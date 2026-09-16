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
