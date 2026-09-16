import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { UseGuards, Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { WsSupabaseAuthGuard } from "../../core/guards/ws-supabase-auth.guard";
import { CommandsService } from "./commands.service";
import { ChatPersistenceService } from "./chat-persistence.service";
import {
  type OmnibarCommandPayload,
  OmnibarCommandPayloadSchema,
  type OmniMessage,
} from "@soustools/api-types";
import { randomUUID } from "crypto";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe";
import { UseFilters } from "@nestjs/common";
import { AllWsExceptionsFilter } from "../../shared/filters/ws-exception.filter";

@UseFilters(new AllWsExceptionsFilter())
@WebSocketGateway({
  namespace: "/commands",
  cors: {
    origin: [
      "https://dev.sous.tools",
      "https://sous.tools",
      "http://localhost:3000",
    ],
    credentials: true,
  },
  maxHttpBufferSize: 5e7, // 50MB for image & PDF uploads
})
export class CommandsGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CommandsGateway.name);

  constructor(
    private readonly commandsService: CommandsService,
    private readonly chatPersistence: ChatPersistenceService,
  ) {}

  /**
   * Broadcast real-time ingestion events to connected WebSocket clients
   */
  async emitIngestionUpdate(payload: {
    reviewId: string;
    conversationId?: string;
    parsedData?: any;
    status: string;
    message?: string;
    orgId?: string;
    userId?: string;
  }) {
    this.logger.log(
      `Emitting WebSocket ingestion:updated for review ${payload.reviewId}`,
    );
    if (this.server) {
      if (payload.conversationId) {
        this.server
          .to(`conversation-${payload.conversationId}`)
          .emit("ingestion:updated", payload);

        if (payload.status === "RENDER" && payload.message) {
          const msg = {
            id: randomUUID(),
            role: "render_component" as any,
            content: payload.message,
            timestamp: new Date(),
          };

          // Persist before emitting to ensure client refresh can load the
          // render_component message and associated UI payload.
          try {
            await this.chatPersistence.appendMessage(
              payload.conversationId,
              payload.orgId || "",
              payload.userId,
              msg,
            );
          } catch (e) {
            this.logger.warn("Failed to persist render_component", e);
          }

          // Emit to connected sockets and publish trajectory after persistence.
          this.server
            .to(`conversation-${payload.conversationId}`)
            .emit("chat_message", msg);
          this.commandsService
            .emitTrajectoryMessage(payload.conversationId, payload.orgId || "", msg)
            .catch((e) =>
              this.logger.warn(
                "Failed to publish trajectory message to Redis",
                e,
              ),
            );
        }
      } else {
        this.server.emit("ingestion:updated", payload);
      }

      if (payload.status === "COMPLETED") {
        this.server.emit("notification:new", {
          title: "Ingestion Processing Complete",
          message: `Review document ${payload.reviewId.substring(0, 8)} is ready.`,
          link: `/home?chat=${payload.conversationId}`,
          payload: {
            type: "INGESTION_READY",
            reviewId: payload.reviewId,
            conversationId: payload.conversationId,
          },
        });
      }
    }
  }

  emitChatMessageToConversation(
    conversationId: string,
    message: any,
    orgId?: string,
  ) {
    if (this.server && conversationId) {
      this.server
        .to(`conversation-${conversationId}`)
        .emit("chat_message", message);
    }
    if (conversationId && message) {
      this.commandsService
        .emitTrajectoryMessage(conversationId, orgId || "", message)
        .catch((e) =>
          this.logger.warn(
            "Failed to publish chat message trajectory to Redis",
            e,
          ),
        );
    }
  }

  @UseGuards(WsSupabaseAuthGuard)
  @SubscribeMessage("executeCommand")
  async handleExecuteCommand(
    @MessageBody(new ZodValidationPipe(OmnibarCommandPayloadSchema))
    payload: OmnibarCommandPayload,
    @ConnectedSocket() client: Socket & { user?: any },
  ) {
    this.logger.log(
      `Received chat history via WebSocket (${payload.chatHistory?.length || 0} messages)`,
    );

    const orgId =
      client.user?.user_metadata?.organization_id ||
      client.user?.app_metadata?.organization_id ||
      "d0000000-0000-0000-0000-000000000000";

    payload.context = payload.context || {};
    payload.context.userId = client.user?.id;

    if (payload.context.conversationId) {
      client.join(`conversation-${payload.context.conversationId}`);
    }

    const emitMessage = (message: OmniMessage) => {
      client.emit("chat_message", message);
    };

    try {
      await this.commandsService.handleCommand(payload, orgId, emitMessage);
    } catch (error: any) {
      this.logger.error("Error processing command stream", error);
      client.emit("command_status", {
        state: "error",
        message:
          error.message ||
          "An unexpected error occurred while executing the command",
      });
    }
  }
}
