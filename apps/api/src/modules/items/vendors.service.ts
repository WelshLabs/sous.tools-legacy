import { Injectable, NotFoundException } from "@nestjs/common";
import { supabase } from "../../core/database/supabase";

export interface CreateVendorDto {
  name: string;
  order_days?: string[];
  order_method?: "EMAIL" | "SMS" | "MANUAL" | "";
  email?: string | null;
  phone?: string | null;
}

export type UpdateVendorDto = Partial<CreateVendorDto>;

@Injectable()
export class VendorsService {
  async findAll(orgId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    return data || [];
  }

  async findOne(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        error?.message || `Vendor with ID ${id} not found`,
      );
    }
    return data;
  }

  async create(
    orgId: string,
    dto: any,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      organization_id: orgId,
      name: dto.name,
      order_days: dto.order_days || dto.delivery_days || [],
      order_method: dto.order_method || "MANUAL",
      email: dto.email || dto.rep_email || null,
      phone: dto.phone || dto.rep_phone || null,
      sales_rep: dto.sales_rep || dto.rep_name || null,
    };
    const { data, error } = await supabase
      .from("vendors")
      .insert([payload])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  async update(
    id: string,
    dto: any,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};
    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.order_method !== undefined) payload.order_method = dto.order_method;
    if (dto.email !== undefined || dto.rep_email !== undefined) {
      payload.email = dto.email !== undefined ? dto.email : dto.rep_email;
    }
    if (dto.phone !== undefined || dto.rep_phone !== undefined) {
      payload.phone = dto.phone !== undefined ? dto.phone : dto.rep_phone;
    }
    if (dto.sales_rep !== undefined || dto.rep_name !== undefined) {
      payload.sales_rep =
        dto.sales_rep !== undefined ? dto.sales_rep : dto.rep_name;
    }
    if (dto.order_days !== undefined || dto.delivery_days !== undefined) {
      payload.order_days =
        dto.order_days !== undefined ? dto.order_days : dto.delivery_days;
    }
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("vendors")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  async remove(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from("vendors")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }
}
