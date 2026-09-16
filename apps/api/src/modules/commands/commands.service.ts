import { Injectable, Logger, Inject } from "@nestjs/common";
import { OmnibarCommandPayload, OmniMessage } from "@soustools/api-types";
import { randomUUID } from "crypto";
import { supabase } from "../../core/database/supabase";
import { ChatPersistenceService } from "./chat-persistence.service";
import { ToolRegistryService } from "./tool-registry.service";
import { PUB_SUB, type RedisPubSub } from "../../core/graphql/pubsub";
import { AGENT_TRAJECTORY_TOPIC } from "./commands.types";

@Injectable()
export class CommandsService {
  private readonly logger = new Logger(CommandsService.name);

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly chatPersistence: ChatPersistenceService,
    @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
  ) {}

  public async emitTrajectoryMessage(
    conversationId: string,
    _orgId: string,
    message: OmniMessage,
    emitMessage?: (msg: OmniMessage) => void,
  ): Promise<void> {
    if (emitMessage) {
      try {
        emitMessage(message);
      } catch (err) {
        this.logger.warn("Failed in emitMessage callback:", err);
      }
    }
    try {
      await this.pubSub.publish(AGENT_TRAJECTORY_TOPIC, {
        conversationId,
        orgId: _orgId,
        agentTrajectory: {
          id: message.id || (message as any).id,
          conversationId,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp || new Date(),
          uiAction: (message as any).uiAction || null,
        },
      });
    } catch (err) {
      this.logger.error("Failed to publish trajectory to Redis PubSub", err);
    }
  }

  private mapToGeminiContent(chatHistory: OmniMessage[]): any[] {
    return chatHistory.map((msg) => {
      let textContent = msg.content || "";
      if (msg.attachments && msg.attachments.length > 0) {
        const fileNames = msg.attachments
          .map((a: any) => a.name || "uploaded file")
          .join(", ");
        textContent += `\n[Attached Files: ${fileNames}]`;
      }
      return {
        role:
          msg.role === "model" || msg.role === "agent_step"
            ? "assistant"
            : "user",
        content: textContent,
      };
    });
  }

  async handleCommand(
    payload: OmnibarCommandPayload,
    orgId: string,
    emitMessage?: (msg: OmniMessage) => void,
  ) {
    this.logger.log(`\n🤖 AI COMMAND RECEIVED [${payload.source}]`);
    const history = Array.isArray(payload.chatHistory) ? payload.chatHistory : [];
    const conversationId = payload.context?.conversationId || randomUUID();

    const wrappedEmitMessage = (msg: OmniMessage) => {
      this.emitTrajectoryMessage(conversationId, orgId, msg, emitMessage).catch(e => 
        this.logger.warn("Failed to emit trajectory", e)
      );
    };

    const userId = payload.context?.userId;
    const lastUserMessage = history[history.length - 1];
    if (lastUserMessage && lastUserMessage.role === "user") {
      this.chatPersistence
        .appendMessage(conversationId, orgId, userId, lastUserMessage)
        .catch((e) => this.logger.warn("Failed to persist user message", e));
    }

    try {
      const contents = this.mapToGeminiContent(history);

      // We will loop to handle function calls
      let isDone = false;
      let finalResult = null;
      let iterations = 0;

      while (!isDone && iterations < 5) {
        iterations++;

        const hasAttachments =
          (lastUserMessage?.attachments &&
            lastUserMessage.attachments.length > 0) ||
          ((payload as any).attachments &&
            (payload as any).attachments.length > 0);

        const llmPayload: any = {
          model: "omnibar",
          messages: [
            {
              role: "system",
              content:
                "You are the Sous Chef of a high-volume restaurant. Acknowledge direct new commands from the head chef with kitchen vernacular ('Heard, Chef' or 'Yes, Chef'). Do NOT repeat 'Heard chef' in reaction to your own tool steps, assistant thoughts, or intermediate messages. You have a professional, sharp, slightly witty service-industry personality. If the user's message contains attachments, files, invoices, or recipes, you MUST call the ingest_document tool with the attachment url.",
            },
            ...contents,
          ],
          tools: this.toolRegistry.getLlmToolDefinitions(),
        };

        if (hasAttachments && iterations === 1) {
          llmPayload.tool_choice = {
            type: "function",
            function: { name: "ingest_document" },
          };
        }

        const res = await fetch("https://ai.sous.tools/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer sk-1234`,
          },
          body: JSON.stringify(llmPayload),
        });

        this.logger.log(
          "LiteLLMServed By:",
          res.headers.get("x-litellm-model-id"),
        );
        this.logger.log(
          "LiteLLM Provider:",
          res.headers.get("x-litellm-model-api-base"),
        );
        this.logger.log(
          "LiteLLM Call ID:",
          res.headers.get("x-litellm-call-id"),
        );

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`LiteLLM Error: ${res.status} ${errBody}`);
        }
        const body = await res.json();
        const response = body.choices[0].message;

        if (response.tool_calls && response.tool_calls.length > 0) {
          const call = response.tool_calls[0].function;
          const functionName = call.name;
          const args = JSON.parse(call.arguments || "{}");

          this.logger.log(`🛠️ Tool invoked: ${functionName}`, args);

          let toolResponseData: any = {};

          try {
            toolResponseData = await this.toolRegistry.executeTool(
              functionName,
              args,
              {
                orgId,
                userId,
                conversationId,
                payload,
                lastUserMessage,
                emitMessage: wrappedEmitMessage,
              },
            );
          } catch (toolErr: any) {
            this.logger.error(`Error executing tool ${functionName}:`, toolErr);
            toolResponseData = {
              success: false,
              error:
                toolErr.message || `Failed to execute tool ${functionName}`,
            };
          }

          // Append model's full response content to history
          contents.push(response);

          // Append tool response to history
          contents.push({
            role: "tool",
            tool_call_id: response.tool_calls[0].id,
            name: functionName,
            content: JSON.stringify(toolResponseData),
          });
        } else if (response.content) {
          isDone = true;
          finalResult = { action: "SUCCESS", message: response.content };

          const modelMsg: OmniMessage = {
            id: randomUUID(),
            role: "model",
            content: response.content,
            timestamp: new Date(),
          };

          if (emitMessage) {
            wrappedEmitMessage(modelMsg);
          }
          this.chatPersistence
            .appendMessage(conversationId, orgId, userId, modelMsg)
            .catch((e) =>
              this.logger.warn("Failed to persist model message", e),
            );
        } else {
          isDone = true;
          finalResult = {
            action: "ERROR",
            message: "No recognizable response from model.",
          };
        }
      }

      return finalResult;
    } catch (error) {
      this.logger.error("Failed to parse or execute command via Gemini", error);
      const fallbackMsg = "I failed to understand that command, Chef.";
      if (emitMessage) {
        wrappedEmitMessage({
          id: randomUUID(),
          role: "model",
          content: fallbackMsg,
          timestamp: new Date(),
        });
      }
      return {
        action: "ERROR",
        message: fallbackMsg,
      };
    }
  }

  async listConversationsForUser(
    userId?: string,
    orgId?: string,
  ): Promise<Array<{ id: string; title: string | null; updated_at: string }>> {
    const effectiveOrgId =
      orgId || "d0000000-0000-0000-0000-000000000000";

    const orConditions: string[] = [
      `organization_id.eq.${effectiveOrgId}`,
      `organization_id.eq.d0000000-0000-0000-0000-000000000000`,
    ];
    if (userId) {
      orConditions.push(`user_id.eq.${userId}`);
      orConditions.push(`user_id.eq.d0000000-0000-0000-0000-000000000000`);
      orConditions.push(`user_id.is.null`);
    }

    const { data, error } = await supabase
      .from("chat_conversations")
      .select("id, title, updated_at")
      .or(orConditions.join(","))
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      this.logger.warn(
        "Failed to list filtered conversations, falling back to all:",
        error,
      );
      const { data: allData } = await supabase
        .from("chat_conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      return allData || [];
    }

    return data || [];
  }

  async getConversationMessages(
    conversationId: string,
  ): Promise<OmniMessage[]> {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      this.logger.error("Failed to fetch messages", error);
      throw new Error("Failed to fetch messages");
    }

    return (data || []).map((row) => ({
      id: row.id,
      role: row.role as OmniMessage["role"],
      content: row.content,
      attachments: row.attachments || undefined,
      timestamp: new Date(row.created_at),
      uiAction: row.ui_action || undefined,
      recipeData: row.recipe_data || undefined,
      invoiceData: row.invoice_data || undefined,
    }));
  }

  public async persistMessage(
    conversationId: string,
    orgId: string,
    userId: string | undefined,
    msg: OmniMessage,
  ) {
    // Delegate to ChatPersistenceService to ensure consistent upsert behavior
    await this.chatPersistence.appendMessage(conversationId, orgId, userId, msg);
  }
}
