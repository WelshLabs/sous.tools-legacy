import { create } from "zustand";
import { type OmniMessage } from "@soustools/api-types";
import type { Socket } from "socket.io-client";

export interface StagedFile {
  id: string;
  url: string | null;
  status: "uploading" | "complete" | "error";
  file?: File;
  /** Local object URL for image thumbnail preview. Revoked on unmount. */
  previewUrl?: string;
}

export interface OmniBarState {
  contextPayload: Record<string, unknown>;
  setContextPayload: (payload: Record<string, unknown>) => void;

  chatHistory: OmniMessage[];
  setChatHistory: (history: OmniMessage[]) => void;
  addMessage: (message: OmniMessage) => void;
  markLoadingComplete: () => void;

  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;

  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;

  isDragging: boolean;
  setIsDragging: (isDragging: boolean) => void;

  inputText: string;
  setInputText: (text: string) => void;

  showGoogleDriveBrowser: boolean;
  setShowGoogleDriveBrowser: (show: boolean) => void;
  stagedFiles: StagedFile[];
  setStagedFiles: (
    files: StagedFile[] | ((prev: StagedFile[]) => StagedFile[]),
  ) => void;

  isGoogleDriveConnected: boolean;
  setIsGoogleDriveConnected: (connected: boolean) => void;

  socket: Socket | null;
  setSocket: (socket: Socket | null) => void;

  executeBackgroundCommand: (text: string) => void;
  setExecuteBackgroundCommand: (fn: (text: string) => void) => void;
}

export const useOmnibarContext = create<OmniBarState>((set) => ({
  contextPayload: {},
  setContextPayload: (payload) => set({ contextPayload: payload }),

  chatHistory: [],
  setChatHistory: (history) => set({ chatHistory: history }),
  addMessage: (message) =>
    set((state) => {
      const msgId = message.id || crypto.randomUUID();
      const normalizedMsg = { ...message, id: msgId };
      const existing = state.chatHistory;
      const last = existing[existing.length - 1];

      // If the incoming message has a valid defined id and matches the last message,
      // merge it into the last entry (e.g. streaming tokens into the active bubble).
      if (last && last.id && last.id === msgId) {
        const merged = { ...last, ...normalizedMsg };
        return { chatHistory: [...existing.slice(0, -1), merged] };
      }

      return { chatHistory: [...existing, normalizedMsg] };
    }),
  markLoadingComplete: () =>
    set((state) => ({
      chatHistory: state.chatHistory.map((msg) =>
        msg.role === "agent_step" ? { ...msg, isLoading: false } : msg,
      ),
    })),

  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),

  isProcessing: false,
  setIsProcessing: (isProcessing) => set({ isProcessing }),

  isDragging: false,
  setIsDragging: (isDragging) => set({ isDragging }),

  inputText: "",
  setInputText: (inputText) => set({ inputText }),

  showGoogleDriveBrowser: false,
  setShowGoogleDriveBrowser: (showGoogleDriveBrowser) =>
    set({ showGoogleDriveBrowser }),
  stagedFiles: [],
  setStagedFiles: (update) =>
    set((state) => ({
      stagedFiles:
        typeof update === "function" ? update(state.stagedFiles) : update,
    })),

  isGoogleDriveConnected: false,
  setIsGoogleDriveConnected: (isGoogleDriveConnected) =>
    set({ isGoogleDriveConnected }),

  socket: null,
  setSocket: (socket) => set({ socket }),

  executeBackgroundCommand: () => {},
  setExecuteBackgroundCommand: (fn) => set({ executeBackgroundCommand: fn }),
}));
