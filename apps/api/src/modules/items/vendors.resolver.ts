import { Resolver, Query, Mutation, Args, Context } from "@nestjs/graphql";
import { VendorsService } from "./vendors.service";
import {
  VendorGQL,
  CreateVendorInputGQL,
  UpdateVendorInputGQL,
} from "./items.types";

@Resolver(() => VendorGQL)
export class VendorsResolver {
  constructor(private readonly vendorsService: VendorsService) {}

  private getOrgId(ctx: any): string {
    return (
      ctx.req?.user?.user_metadata?.organization_id ||
      ctx.req?.user?.app_metadata?.organization_id ||
      ctx.req?.user?.organization_id ||
      "d0000000-0000-0000-0000-000000000000"
    );
  }

  private mapVendorRow(row: Record<string, unknown>): Record<string, unknown> {
    if (!row) return row;
    return {
      ...row,
      rep_email: row.rep_email ?? row.email ?? null,
      rep_phone: row.rep_phone ?? row.phone ?? null,
      rep_name: row.rep_name ?? row.sales_rep ?? null,
      delivery_days: row.delivery_days ?? row.order_days ?? [],
    };
  }

  @Query(() => [VendorGQL], { name: "vendors" })
  async getVendors(@Context() ctx: any): Promise<any[]> {
    const orgId = this.getOrgId(ctx);
    const rows = await this.vendorsService.findAll(orgId);
    return rows.map((r) => this.mapVendorRow(r));
  }

  @Query(() => VendorGQL, { name: "vendor", nullable: true })
  async getVendor(@Args("id") id: string): Promise<any> {
    const row = await this.vendorsService.findOne(id);
    return this.mapVendorRow(row);
  }

  @Mutation(() => VendorGQL, { name: "createVendor" })
  async createVendor(
    @Args("input") input: CreateVendorInputGQL,
    @Context() ctx: any,
  ): Promise<any> {
    const orgId = this.getOrgId(ctx);
    const row = await this.vendorsService.create(orgId, input as any);
    return this.mapVendorRow(row);
  }

  @Mutation(() => VendorGQL, { name: "updateVendor" })
  async updateVendor(
    @Args("id") id: string,
    @Args("input") input: UpdateVendorInputGQL,
  ): Promise<any> {
    const row = await this.vendorsService.update(id, input as any);
    return this.mapVendorRow(row);
  }
}
