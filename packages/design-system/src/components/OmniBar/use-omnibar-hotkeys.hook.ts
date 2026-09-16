"use client";

import { useRouter } from "next/navigation";
import { useOmnibarContext } from "./OmniBarContext";
import { type OmniMessage } from "@soustools/api-types";
import { graphqlClient } from "@soustools/api-client";

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

export function useOmniBarHotkeys({
  isFocusPage,
  pathname,
  setErrorMessage,
}: {
  socket?: any;
  isFocusPage: boolean;
  pathname: string;
  setErrorMessage: (msg: string | null) => void;
}) {
  const router = useRouter();
  const {
    isProcessing,
    inputText,
    setInputText,
    setIsProcessing,
    setIsOpen,
    addMessage,
    setChatHistory,
    contextPayload,
    stagedFiles,
    setStagedFiles,
    markLoadingComplete,
  } = useOmnibarContext();

  /**
   * Core submit logic — shared between Enter keypress and the Submit button.
   * Sends both the text prompt AND any staged file attachments in a single payload.
   * Clears the staging area after dispatch.
   */
  const handleSubmit = async () => {
    if (isProcessing) return;

    const textToSubmit = inputText.trim();
    const hasFiles = stagedFiles.length > 0;

    // Allow submit if there is text OR staged files (or both)
    if (!textToSubmit && !hasFiles) return;

    const filesToSubmit = [...stagedFiles];
    setInputText("");
    setStagedFiles([]);
    setIsProcessing(true);
    setErrorMessage(null);

    // Build attachments array from staged files for the backend
    const attachments = await Promise.all(
      filesToSubmit.map(async (f) => {
        let dataUrl = f.url ?? f.previewUrl ?? null;
        if (f.file) {
          dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(f.file!);
          });
        }
        return {
          id: f.id,
          name: f.file?.name ?? "unknown",
          mimeType: f.file?.type ?? "application/octet-stream",
          url: dataUrl,
        };
      }),
    );

    // Always route to /home with chat session when submitting a query
    const searchParams = new URLSearchParams(window.location.search);
    const existingChatId = searchParams.get("chat");
    let currentChatId = existingChatId;

    if (pathname !== "/home" || !existingChatId) {
      currentChatId = existingChatId || crypto.randomUUID();
      const params = new URLSearchParams();
      params.set("chat", currentChatId);
      router.push(`/home?${params.toString()}`);
    }
    setIsOpen(true);

    // Build a human-readable user message that reflects what was submitted
    const attachmentSummary = hasFiles
      ? `[${filesToSubmit.length} attachment${filesToSubmit.length > 1 ? "s" : ""}]`
      : "";
    const userContent = [attachmentSummary, textToSubmit]
      .filter(Boolean)
      .join(" ");

    const newUserMessage: OmniMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent || "[1 attachment]",
      timestamp: new Date(),
      attachments,
    };

    addMessage(newUserMessage);

    try {
      const res = await graphqlClient.request<{ executeOmniCommand: any }>(
        EXECUTE_OMNI_COMMAND_MUTATION,
        {
          command: userContent || "Analyze document",
          path: pathname,
          conversationId: currentChatId,
          contextPayload: {
            ...contextPayload,
            attachments,
          },
        },
      );

      if (res.data?.executeOmniCommand) {
        const step = res.data.executeOmniCommand;
        addMessage({
          id: step.id,
          role: step.role as OmniMessage["role"],
          content: step.content,
          timestamp: new Date(step.timestamp),
        });
      }
    } catch (err: unknown) {
      console.error("Failed to execute command via GraphQL:", err);
      const errorMessage =
        err instanceof Error ? err.message : "GraphQL network error occurred.";
      setErrorMessage(errorMessage);
    } finally {
      setIsProcessing(false);
      markLoadingComplete();
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (isFocusPage) {
        setChatHistory([]);
        setInputText("");
      } else {
        setIsOpen(false);
      }
    }
  };

  return { handleKeyDown, handleSubmit };
}
