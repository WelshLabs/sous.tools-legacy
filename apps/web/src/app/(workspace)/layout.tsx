import React, { Suspense } from "react";
import { AppBar, OmniBarProvider } from "@soustools/design-system";
import { logoutAction } from "@/app/actions/auth";
import { GoogleDriveBrowserWrapper } from "@/components/GoogleDriveBrowserWrapper";
import { graphqlClient } from "@soustools/api-client";

const GET_UNREAD_NOTIFICATIONS_QUERY = `
  query GetUnreadNotifications {
    unreadNotifications {
      id
      title
      message
      link
      createdAt
      readAt
    }
  }
`;

export default async function WorkspaceLayout({
  children,
  modal,
}: {
  children: any;
  modal: any;
}) {
  let notifications = [];
  try {
    const res = await graphqlClient.request<{ unreadNotifications: any[] }>(
      GET_UNREAD_NOTIFICATIONS_QUERY,
    );
    if (res.data?.unreadNotifications) {
      notifications = res.data.unreadNotifications;
    }
  } catch (error: any) {
    if (
      error &&
      (error.digest === "DYNAMIC_SERVER_USAGE" ||
        error.message?.includes("Dynamic server usage") ||
        error.message?.includes("dynamic-server-error"))
    ) {
      throw error;
    }
    console.error("Failed to fetch notifications:", error);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppBar
        notifications={notifications || []}
        onLogoutAction={logoutAction}
        isAdmin={true}
      />
      <main
        id="workspace-main"
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
      >
        <Suspense fallback={<div>Loading workspace...</div>}>
          <OmniBarProvider>
            {children}
            {modal}
            <GoogleDriveBrowserWrapper />
          </OmniBarProvider>
        </Suspense>
      </main>
    </div>
  );
}
