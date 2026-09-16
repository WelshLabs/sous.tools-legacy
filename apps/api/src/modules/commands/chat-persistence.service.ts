import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { OmniMessage } from "@soustools/api-types";
import { SupabaseService } from "../../core/database/supabase";

@Injectable()
export class ChatPersistenceService {
  private readonly logger = new Logger(ChatPersistenceService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Single choke point for every write to chat_conversations / chat_messages.
   * Both the live WebSocket gateway/service and the BullMQ ingestion processor
   * must call this method so message ordering and org/user attribution stay
   * consistent no matter which process writes the message.
   */
  public async appendMessage(
    conversationId: string,
    orgId: string,
    userId: string | undefined,
    msg: OmniMessage,
  ): Promise<void> {
    if (!conversationId) {
      this.logger.warn(
        "appendMessage called without conversationId; skipping write.",
      );
      return;
    }

    const effectiveOrgId =
      orgId && orgId !== "unknown"
        ? orgId
        : "d0000000-0000-0000-0000-000000000000";

    const { data: existingConv } = await this.supabase
      .from("chat_conversations")
      .select("id, user_id, title")
      .eq("id", conversationId)
      .maybeSingle();

    if (!existingConv) {
      const title =
        msg.role === "user" && msg.content
          ? msg.content.slice(0, 80)
          : "New Conversation";
      const { error: insertConvErr } = await this.supabase
        .from("chat_conversations")
        .insert({
          id: conversationId,
          organization_id: effectiveOrgId,
          user_id: userId || null,
          title,
        })
        .select()
        .maybeSingle();
      if (insertConvErr) {
        this.logger.warn(
          `Failed to insert chat_conversation ${conversationId}: ${insertConvErr.message || insertConvErr}`,
        );
      }
    } else {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (userId && !existingConv.user_id) {
        updates.user_id = userId;
      }
      if (
        (!existingConv.title || existingConv.title === "New Conversation") &&
        msg.role === "user" &&
        msg.content
      ) {
        updates.title = msg.content.slice(0, 80);
      }
      const { error: updateConvErr } = await this.supabase
        .from("chat_conversations")
        .update(updates)
        .eq("id", conversationId)
        .select()
        .maybeSingle();
      if (updateConvErr) {
        this.logger.warn(
          `Failed to update chat_conversation ${conversationId}: ${updateConvErr.message || updateConvErr}`,
        );
      }
    }

    // Upsert message by id so streaming updates that reuse an id will update
    // the existing record instead of failing or creating duplicates.
    const messageRow = {
      id: msg.id || randomUUID(),
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      attachments: msg.attachments || [],
      ui_action: (msg as any).uiAction || null,
      recipe_data: (msg as any).recipeData || null,
      invoice_data: (msg as any).invoiceData || null,
      updated_at: new Date().toISOString(),
    } as any;

    try {
      const { error } = await this.supabase
        .from("chat_messages")
        .upsert(messageRow, { onConflict: "id" })
        .select()
        .maybeSingle();
      if (error) {
        this.logger.warn(
          `Failed to upsert chat_message for conv ${conversationId}: ${error.message || error}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to upsert chat_message for conv ${conversationId}: ${err}`,
      );
    }
  }
}
