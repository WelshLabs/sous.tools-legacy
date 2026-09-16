import { graphqlClient } from "@soustools/api-client";
import { VendorsPanelContainer } from "@soustools/domain-inventory";

export const dynamic = "force-dynamic";

const GET_VENDORS_QUERY = `
  query GetVendors {
    vendors {
      id
      organization_id
      name
      rep_name
      rep_phone
      rep_email
      order_method
      cutoff_time
      minimum_order
      delivery_days
      created_at
      updated_at
    }
  }
`;

export default async function VendorsPage() {
  let vendors: any[] = [];

  try {
    const res =
      await graphqlClient.request<{ vendors: any[] }>(GET_VENDORS_QUERY);
    if (res.data?.vendors) {
      vendors = res.data.vendors.map((v: any) => ({
        id: v.id,
        organization_id: v.organization_id,
        name: v.name,
        order_method: v.order_method || "MANUAL",
        email: v.rep_email || v.email || "",
        phone: v.rep_phone || v.phone || "",
        order_days: v.delivery_days || v.order_days || [],
        created_at: v.created_at || new Date().toISOString(),
      }));
    }
  } catch (err) {
    console.error("Failed to load vendors via GraphQL:", err);
  }

  return <VendorsPanelContainer initialVendors={vendors} />;
}
