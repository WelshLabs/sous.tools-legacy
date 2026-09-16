"use client";

import { useState, useMemo, useEffect } from "react";
import { useOmnibarContext } from "@soustools/design-system";
import { graphqlClient } from "@soustools/api-client";
import { type OmniMessage } from "@soustools/api-types";
import { AnswerViewView } from "./AnswerView.view";

export interface AnswerViewContainerProps {
  initialQuery?: string;
  initialReviewId?: string;
}

const DASHBOARD_STATS_QUERY = `
  query GetDashboardStats {
    dashboardStats {
      revenue {
        name
        value
      }
      ticketTimes {
        time
        minutes
      }
    }
  }
`;

const CONVERSATION_MESSAGES_QUERY = `
  query GetConversationMessages($conversationId: String!) {
    conversationMessages(conversationId: $conversationId) {
      id
      conversationId
      role
      content
      timestamp
      isLoading
      uiAction
      recipeData
      invoiceData
    }
  }
`;

const EXECUTE_OMNI_COMMAND_MUTATION = `
  mutation ExecuteOmniCommand($command: String!, $path: String, $conversationId: String, $contextPayload: JSON) {
    executeOmniCommand(command: $command, path: $path, conversationId: $conversationId, contextPayload: $contextPayload) {
      id
      conversationId
      role
      content
      timestamp
    }
  }
`;

export function AnswerViewContainer({
  initialQuery = "",
  initialReviewId,
}: AnswerViewContainerProps) {
  const {
    chatHistory,
    setChatHistory,
    addMessage,
    isProcessing,
    setIsProcessing,
    markLoadingComplete,
    contextPayload,
  } = useOmnibarContext();

  const [prepListItems, setPrepListItems] = useState([
    { id: "1", text: "Dice 10lbs yellow onions for soup base", done: false },
    { id: "2", text: "Trim & portion ribeye loins (12oz steaks)", done: false },
    { id: "3", text: "Simmer beef bone broth (8 hours low heat)", done: true },
    { id: "4", text: "Grate Gruyère cheese for crock topping", done: false },
  ]);

  const [realRevenueData, setRealRevenueData] = useState([
    { name: "Mon", value: 193 },
    { name: "Tue", value: 213 },
    { name: "Wed", value: 130 },
    { name: "Thu", value: 172 },
    { name: "Fri", value: 54 },
    { name: "Sat", value: 0 },
    { name: "Sun", value: 0 },
  ]);
  const [realTicketTimeData, setRealTicketTimeData] = useState<
    Array<{ time: string; minutes: number }>
  >([]);

  useEffect(() => {
    graphqlClient
      .request<{ dashboardStats: any }>(DASHBOARD_STATS_QUERY)
      .then((res) => {
        if (Array.isArray(res.data?.dashboardStats?.revenue))
          setRealRevenueData(res.data.dashboardStats.revenue);
        if (Array.isArray(res.data?.dashboardStats?.ticketTimes))
          setRealTicketTimeData(res.data.dashboardStats.ticketTimes);
      })
      .catch((err: unknown) =>
        console.error("Failed to fetch dashboard stats:", err),
      );
  }, []);

  const [hasFetchedHistory, setHasFetchedHistory] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setHasFetchedHistory(false);

    if (!initialReviewId) {
      setChatHistory([]);
      if (isCurrent) setHasFetchedHistory(true);
      return;
    }
    graphqlClient
      .request<{ conversationMessages: any[] }>(CONVERSATION_MESSAGES_QUERY, {
        conversationId: initialReviewId,
      })
      .then((res) => {
        const raw = res.data?.conversationMessages || [];
        const msgs: OmniMessage[] = raw.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
          isLoading: m.isLoading,
          uiAction: m.uiAction
            ? typeof m.uiAction === "string"
              ? JSON.parse(m.uiAction)
              : m.uiAction
            : undefined,
          recipeData: m.recipeData
            ? typeof m.recipeData === "string"
              ? JSON.parse(m.recipeData)
              : m.recipeData
            : undefined,
          invoiceData: m.invoiceData
            ? typeof m.invoiceData === "string"
              ? JSON.parse(m.invoiceData)
              : m.invoiceData
            : undefined,
        }));
        if (isCurrent) setChatHistory(msgs);
      })
      .catch((err: unknown) =>
        console.error("Failed to fetch chat history via GraphQL:", err),
      )
      .finally(() => {
        if (isCurrent) setHasFetchedHistory(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [initialReviewId, setChatHistory]);

  useEffect(() => {
    if (!hasFetchedHistory || !initialQuery || !initialQuery.trim()) return;
    const exists = chatHistory.some(
      (m) => m.role === "user" && m.content.includes(initialQuery),
    );
    if (exists) return;

    setIsProcessing(true);
    const newMsg: OmniMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: initialQuery,
      timestamp: new Date(),
    };

    addMessage(newMsg);

    graphqlClient
      .request<{ executeOmniCommand: any }>(EXECUTE_OMNI_COMMAND_MUTATION, {
        command: initialQuery,
        path: "/home",
        conversationId: initialReviewId,
        contextPayload,
      })
      .then((res) => {
        if (res.data?.executeOmniCommand) {
          const step = res.data.executeOmniCommand;
          addMessage({
            id: step.id,
            role: step.role as OmniMessage["role"],
            content: step.content,
            timestamp: new Date(step.timestamp),
          });
        }
      })
      .catch((err) => {
        console.error("Failed to execute initial query command:", err);
      })
      .finally(() => {
        setIsProcessing(false);
        markLoadingComplete();
      });
  }, [
    initialQuery,
    hasFetchedHistory,
    chatHistory,
    initialReviewId,
    setIsProcessing,
    setChatHistory,
    contextPayload,
    markLoadingComplete,
  ]);

  useEffect(() => {
    const main = document.getElementById("workspace-main");
    if (main) {
      setTimeout(
        () => main.scrollTo({ top: main.scrollHeight, behavior: "smooth" }),
        50,
      );
    }
  }, [chatHistory.length, isProcessing]);

  const latestUserMessage = useMemo(() => {
    const userMsgs = chatHistory.filter((m) => m.role === "user");
    return userMsgs[userMsgs.length - 1]?.content || initialQuery;
  }, [chatHistory, initialQuery]);

  const componentDirective = useMemo(() => {
    const renderMsg = chatHistory.findLast(
      (m) => (m.role as string) === "render_component",
    );
    if (renderMsg?.content) {
      try {
        return JSON.parse(renderMsg.content) as { componentName?: string };
      } catch {
        // no-op
      }
    }
    return null;
  }, [chatHistory]);

  const track2Type = useMemo(() => {
    if (componentDirective?.componentName)
      return componentDirective.componentName;
    const q = (latestUserMessage || "").toLowerCase().trim();
    if (!q) return null;
    if (q.includes("revenue") || q.includes("sales") || q.includes("chart"))
      return "REVENUE_CHART";
    if (q.includes("ticket") || q.includes("time") || q.includes("throttle"))
      return "TICKET_TIME_CHART";
    if (q.includes("prep") || q.includes("task") || q.includes("todo"))
      return "PREP_LIST";
    if (q.includes("search") || q.includes("find") || q.includes("google"))
      return "SEARCH_RESULTS";
    if (q.includes("item") || q.includes("inventory") || q.includes("supplier"))
      return "INGREDIENT_TABLE";
    return null;
  }, [componentDirective, latestUserMessage]);

  const handleTogglePrepItem = (id: string) => {
    setPrepListItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
  };

  return (
    <AnswerViewView
      chatHistory={chatHistory}
      isProcessing={isProcessing}
      track2Type={track2Type}
      realRevenueData={realRevenueData}
      realTicketTimeData={realTicketTimeData}
      prepListItems={prepListItems}
      onTogglePrepItem={handleTogglePrepItem}
    />
  );
}
