import { SettingsPanelContainer } from "@soustools/domain-settings";
import { graphqlClient } from "@soustools/api-client";
import { serverConfig } from "@soustools/config/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let integrations = [];
  try {
    const { data } = await graphqlClient.request<{
      integrationStatuses: any[];
    }>(`
      query GetIntegrationStatuses {
        integrationStatuses {
          provider
          connected
          connectedAs
        }
      }
    `);
    if (data?.integrationStatuses) {
      integrations = data.integrationStatuses;
    }
  } catch (err) {
    console.error("Failed to load integrations status", err);
  }

  const initialTokens = {};
  const userProfile = {
    name: "Admin User",
    email: "admin@soustools.local",
    role: "admin",
  };

  const isDev = serverConfig.NODE_ENV === "development";

  return (
    <SettingsPanelContainer
      integrations={integrations}
      isDev={isDev}
      initialTokens={initialTokens}
      userProfile={userProfile}
    />
  );
}
