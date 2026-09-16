import {
  Resolver,
  Subscription,
  Query,
  Mutation,
  Args,
  Context,
} from "@nestjs/graphql";
import { Inject } from "@nestjs/common";
import { type RedisPubSub } from "graphql-redis-subscriptions";
import { CommandsService } from "./commands.service";
import {
  AgentTrajectoryStep,
  ChatConversationGQL,
  AGENT_TRAJECTORY_TOPIC,
} from "./commands.types";
import { PUB_SUB } from "../../core/graphql/pubsub";
import GraphQLJSON from "graphql-type-json";
import { randomUUID } from "crypto";
import { type OmniMessage, type OmnibarCommandPayload } from "@soustools/api-types";

@Resolver(() => AgentTrajectoryStep)
export class CommandsResolver {
  constructor(
    private readonly commandsService: CommandsService,
    @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
  ) {}

  @Query(() => [ChatConversationGQL], {
    name: "conversations",
    description: "List chat conversations for the current user and org",
  })
  async getConversations(@Context() ctx: any): Promise<ChatConversationGQL[]> {
    const userId = ctx.req?.user?.id;
    const orgId =
      ctx.req?.user?.user_metadata?.organization_id ||
      ctx.req?.user?.app_metadata?.organization_id;
    const list = await this.commandsService.listConversationsForUser(userId, orgId);
    return list.map((c) => ({
      id: c.id,
      title: c.title ?? undefined,
      updated_at: c.updated_at,
    }));
  }

  @Query(() => [AgentTrajectoryStep], {
    name: "conversationMessages",
    description:
      "Get all messages and trajectory history for a specific conversation",
  })
  async getConversationMessages(
    @Args("conversationId", { type: () => String }) conversationId: string,
  ): Promise<AgentTrajectoryStep[]> {
    const messages =
      await this.commandsService.getConversationMessages(conversationId);
    return messages.map((m) => ({
      id: m.id,
      conversationId,
      role: m.role,
      content: m.content,
      timestamp:
        m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
      isLoading: m.isLoading,
      uiAction: m.uiAction
        ? typeof m.uiAction === "string"
          ? m.uiAction
          : JSON.stringify(m.uiAction)
        : undefined,
      recipeData: m.recipeData
        ? typeof m.recipeData === "string"
          ? m.recipeData
          : JSON.stringify(m.recipeData)
        : undefined,
      invoiceData: m.invoiceData
        ? typeof m.invoiceData === "string"
          ? m.invoiceData
          : JSON.stringify(m.invoiceData)
        : undefined,
    }));
  }

  @Mutation(() => AgentTrajectoryStep, {
    name: "executeOmniCommand",
    description:
      "Execute omnibar command and stream trajectory steps in real-time via GraphQL",
  })
  async executeCommand(
    @Args("command") command: string,
    @Args("path", { nullable: true }) path?: string,
    @Args("conversationId", { nullable: true }) conversationId?: string,
    @Args("contextPayload", { type: () => GraphQLJSON, nullable: true })
    contextPayload?: any,
    @Context() ctx?: any,
  ): Promise<AgentTrajectoryStep> {
    const userId = ctx?.req?.user?.id;
    const orgId =
      ctx?.req?.user?.user_metadata?.organization_id ||
      ctx?.req?.user?.app_metadata?.organization_id ||
      "d0000000-0000-0000-0000-000000000000";

    const convId = conversationId || randomUUID();
    const attachments = contextPayload?.attachments || [];
    const userMsg: OmniMessage = {
      id: randomUUID(),
      role: "user",
      content: command,
      timestamp: new Date(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const payload: OmnibarCommandPayload = {
      chatHistory: [userMsg],
      attachments: attachments.length > 0 ? attachments : undefined,
      source: "omnibar",
      path: path || "/home",
      context: {
        ...(contextPayload || {}),
        attachments: attachments.length > 0 ? attachments : undefined,
        conversationId: convId,
        userId,
      },
    };

    const result = await this.commandsService.handleCommand(
      payload,
      orgId,
      // Emit trajectory steps to subscribers while the command executes
      (msg: OmniMessage) => {
        // fire-and-forget; CommandsService.emitTrajectoryMessage handles errors internally
        this.commandsService.emitTrajectoryMessage(convId, orgId, msg).catch((e) =>
          this.commandsService["logger"].warn("Failed to emit trajectory from resolver", e),
        );
      },
    );

    return {
      id: randomUUID(),
      conversationId: convId,
      role: "model",
      content: result?.message || "Command processed.",
      timestamp: new Date(),
    };
  }

  @Subscription(() => AgentTrajectoryStep, {
    name: "agentTrajectory",
    description:
      "Stream agent trajectory steps, thought processes, and results in real-time via graphql-ws",
    filter: (payload, variables) => {
      if (variables?.conversationId && payload.conversationId) {
        return payload.conversationId === variables.conversationId;
      }
      if (variables?.orgId && payload.orgId) {
        return payload.orgId === variables.orgId;
      }
      return true;
    },
    resolve: (payload) => payload.agentTrajectory || payload,
  })
  agentTrajectory(
    @Args("conversationId", { type: () => String, nullable: true })
    _conversationId?: string,
    @Args("orgId", { type: () => String, nullable: true }) _orgId?: string,
  ) {
    return this.pubSub.asyncIterableIterator(AGENT_TRAJECTORY_TOPIC);
  }
}
