"use client";

import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { type OmniMessage } from "@soustools/api-types";
import { useOmnibarContext } from "./OmniBarContext";
import { usePathname, useSearchParams } from "next/navigation";
import { graphqlClient } from "@soustools/api-client";

const AGENT_TRAJECTORY_SUBSCRIPTION = `
  subscription OnAgentTrajectory($conversationId: String) {
    agentTrajectory(conversationId: $conversationId) {
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
  mutation ExecuteOmniCommand($command: String!, $path: String, $contextPayload: JSON) {
    executeOmniCommand(command: $command, path: $path, contextPayload: $contextPayload) {
      id
      conversationId
      role
      content
      timestamp
    }
  }
`;

export function useOmniSocket(): {
  socket: null;
  errorMessage: string | null;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  isListening: boolean;
  setIsListening: Dispatch<SetStateAction<boolean>>;
} {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    contextPayload,
    chatHistory,
    addMessage,
    setIsProcessing,
    markLoadingComplete,
    setExecuteBackgroundCommand,
    setChatHistory,
  } = useOmnibarContext();

  // Route real-time agent thought process steps over GraphQL subscriptions
  useEffect(() => {
    const convId = searchParams?.get?.("chat") || (contextPayload as any)?.conversationId;
    if (!convId) return;

    setIsListening(true);

    const unsubscribe = graphqlClient.subscribe<{
      agentTrajectory: any;
    }>({
      query: AGENT_TRAJECTORY_SUBSCRIPTION,
      variables: { conversationId: convId },
      onNext: (data) => {
        if (data?.agentTrajectory) {
          const step = data.agentTrajectory;
          if (step.conversationId && step.conversationId !== convId) {
            return;
          }
          let parsedUiAction: any = undefined;
          let parsedRecipeData: any = undefined;
          let parsedInvoiceData: any = undefined;

          try {
            if (step.uiAction) {
              parsedUiAction =
                typeof step.uiAction === "string"
                  ? JSON.parse(step.uiAction)
                  : step.uiAction;
            }
          } catch (e) {
            console.warn("Failed to parse uiAction from subscription:", e);
          }
          try {
            if (step.recipeData) {
              parsedRecipeData =
                typeof step.recipeData === "string"
                  ? JSON.parse(step.recipeData)
                  : step.recipeData;
            }
          } catch (e) {
            console.warn("Failed to parse recipeData from subscription:", e);
          }
          try {
            if (step.invoiceData) {
              parsedInvoiceData =
                typeof step.invoiceData === "string"
                  ? JSON.parse(step.invoiceData)
                  : step.invoiceData;
            }
          } catch (e) {
            console.warn("Failed to parse invoiceData from subscription:", e);
          }

          const msg: OmniMessage = {
            id: step.id || crypto.randomUUID(),
            role: step.role as OmniMessage["role"],
            content: step.content,
            timestamp: new Date(step.timestamp),
            isLoading: step.isLoading ?? undefined,
            uiAction: parsedUiAction,
            recipeData: parsedRecipeData,
            invoiceData: parsedInvoiceData,
          };
          addMessage(msg);
          if (msg.role === "model") {
            setIsProcessing(false);
            markLoadingComplete();
          }
        }
      },
      onError: (err) => {
        console.warn("[OmniBar] GraphQL subscription notice:", err);
      },
    });

    return () => {
      try {
        unsubscribe();
      } catch {}
      setIsListening(false);
    };
  }, [addMessage, setIsProcessing, markLoadingComplete, searchParams, contextPayload]);

  // Execute Background Command handler via GraphQL mutation
  useEffect(() => {
    const executeBackgroundCommand = (text: string) => {
      if (!text.trim()) return;
      setIsProcessing(true);
      const newUserMessage: OmniMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      const updatedHistory = [...chatHistory, newUserMessage];
      setChatHistory(updatedHistory);

      graphqlClient
        .request<{ executeOmniCommand: any }>(EXECUTE_OMNI_COMMAND_MUTATION, {
          command: text,
          path: pathname,
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
          console.error("[OmniBar] Command execution error:", err);
          setErrorMessage(err.message || "Failed to execute command.");
        })
        .finally(() => {
          setIsProcessing(false);
          markLoadingComplete();
        });
    };
    setExecuteBackgroundCommand(executeBackgroundCommand);
  }, [
    chatHistory,
    pathname,
    contextPayload,
    setExecuteBackgroundCommand,
    setChatHistory,
    setIsProcessing,
    markLoadingComplete,
    addMessage,
  ]);

  return { socket: null, errorMessage, setErrorMessage, isListening, setIsListening };
}
