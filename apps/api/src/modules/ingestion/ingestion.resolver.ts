import { Resolver, Query, Mutation, Args, Context } from "@nestjs/graphql";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { IngestionService } from "./ingestion.service";
import GraphQLJSON from "graphql-type-json";
import {
  IngestionReviewRecordGQL,
  IngestionUploadPayloadGQL,
  IngestionUploadInputGQL,
  InvoiceGQL,
} from "./ingestion.types";

@Resolver(() => IngestionReviewRecordGQL)
export class IngestionResolver {
  constructor(
    @InjectQueue("ingestion") private readonly ingestionQueue: Queue,
    private readonly ingestionService: IngestionService,
  ) {}

  private getOrgId(ctx: any): string {
    return (
      ctx.req?.user?.user_metadata?.organization_id ||
      ctx.req?.user?.app_metadata?.organization_id ||
      ctx.req?.user?.organization_id ||
      "d0000000-0000-0000-0000-000000000000"
    );
  }

  @Query(() => IngestionReviewRecordGQL, {
    name: "ingestionReview",
    nullable: true,
  })
  async getReview(@Args("id") id: string): Promise<any> {
    return this.ingestionService.getReviewRecord(id);
  }

  @Query(() => [InvoiceGQL], { name: "invoices" })
  async getInvoices(@Context() ctx: any): Promise<any[]> {
    const orgId = this.getOrgId(ctx);
    return this.ingestionService.getInvoices(orgId);
  }

  @Query(() => GraphQLJSON, { name: "unmappedDataReport", nullable: true })
  async getUnmappedDataReport(@Context() ctx: any): Promise<any> {
    const orgId = this.getOrgId(ctx);
    return this.ingestionService.aggregateRawUnmappedData(orgId);
  }

  @Mutation(() => IngestionUploadPayloadGQL, { name: "uploadIngestionDocument" })
  async uploadDocument(
    @Args("input") input: IngestionUploadInputGQL,
    @Context() ctx: any,
  ): Promise<any> {
    const orgId = this.getOrgId(ctx);

    const reviewRecord = await this.ingestionService.createReviewRecord({
      organizationId: orgId,
      source: input.source || "upload",
      sourceName: input.sourceName || "Uploaded File",
      sourceDocumentUrl: input.sourceDocumentUrl,
      parsedData: { pages: [], processing: true } as any,
    });

    const job = await this.ingestionQueue.add("process-document", {
      organizationId: orgId,
      source: input.source || "upload",
      sourceName: input.sourceName || "Uploaded File",
      sourceDocumentUrl: input.sourceDocumentUrl,
      pagesInput: input.pagesInput,
      reviewId: reviewRecord.id,
      conversationId: input.conversationId,
    });

    return {
      success: true,
      jobId: job.id,
      message: "Document ingestion queued successfully.",
      reviewId: reviewRecord.id,
    };
  }

  @Mutation(() => IngestionReviewRecordGQL, {
    name: "updateIngestionReviewRecord",
  })
  async updateReviewRecord(
    @Args("id") id: string,
    @Args("parsedData", { type: () => GraphQLJSON }) parsedData: any,
  ): Promise<any> {
    return this.ingestionService.updateReviewRecordState(id, parsedData);
  }

  @Mutation(() => GraphQLJSON, { name: "commitIngestionReview" })
  async commitReview(
    @Args("reviewId") reviewId: string,
    @Args("approvedPayload", { type: () => GraphQLJSON }) approvedPayload: any,
    @Context() ctx: any,
  ): Promise<any> {
    const orgId = this.getOrgId(ctx);
    const userId = ctx.req?.user?.id || ctx.req?.user?.sub;
    return this.ingestionService.commitReviewPayload(
      reviewId,
      approvedPayload,
      orgId,
      userId,
    );
  }

  @Mutation(() => Boolean, { name: "submitManualCorrection" })
  async submitCorrection(
    @Args("correction", { type: () => GraphQLJSON }) correction: any,
    @Context() ctx: any,
  ): Promise<boolean> {
    const orgId = this.getOrgId(ctx);
    correction.organizationId = orgId;
    await this.ingestionService.recordManualCorrection(correction);
    return true;
  }
}
