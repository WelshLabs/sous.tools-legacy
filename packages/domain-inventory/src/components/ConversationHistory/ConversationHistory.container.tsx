"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { graphqlClient } from "@soustools/api-client";
import {
  ConversationHistoryView,
  type ConversationItem,
} from "./ConversationHistory.view";

export interface ConversationHistoryContainerProps {
  activeId?: string;
  defaultCollapsed?: boolean;
}

const GET_CONVERSATIONS_QUERY = `
  query GetConversations {
    conversations {
      id
      title
      updated_at
    }
  }
`;

const AGENT_TRAJECTORY_SUBSCRIPTION = `
  subscription OnAgentTrajectory {
    agentTrajectory {
      id
      conversationId
    }
  }
`;

export function ConversationHistoryContainer({
  activeId,
  defaultCollapsed,
}: ConversationHistoryContainerProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(
    defaultCollapsed !== undefined ? defaultCollapsed : !activeId,
  );

  const fetchConversations = useCallback(() => {
    graphqlClient
      .request<{ conversations: any[] }>(GET_CONVERSATIONS_QUERY)
      .then((res) => {
        console.log(res);
        const raw = res.data?.conversations || [];
        const mapped: ConversationItem[] = raw.map((c: any) => ({
          id: c.id,
          title: c.title || "Conversation",
          lastMessage: "",
          updatedAt: c.updated_at,
        }));
        setConversations(mapped);
      })
      .catch((err: any) =>
        console.warn("Failed to fetch conversation history via GraphQL:", err),
      )
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, activeId]);

  useEffect(() => {
    if (activeId) {
      setIsCollapsed(false);
    }
  }, [activeId]);

  useEffect(() => {
    const unsubscribe = graphqlClient.subscribe({
      query: AGENT_TRAJECTORY_SUBSCRIPTION,
      onNext: () => {
        fetchConversations();
      },
      onError: () => {
        // subscription fallback
      },
    });

    return () => {
      unsubscribe();
    };
  }, [fetchConversations]);

  const handleSelect = (id: string) => {
    router.push(`/home?chat=${id}`);
  };

  const handleNewChat = () => {
    router.push("/home");
  };

  return (
    <ConversationHistoryView
      conversations={conversations}
      activeId={activeId}
      isLoading={isLoading}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      onSelect={handleSelect}
      onNewChat={handleNewChat}
    />
  );
}
