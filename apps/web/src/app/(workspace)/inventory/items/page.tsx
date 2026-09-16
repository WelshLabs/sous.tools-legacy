import { graphqlClient } from "@soustools/api-client";
import { ItemsLedgerContainer } from "@soustools/domain-inventory";

export const dynamic = "force-dynamic";

const GET_ITEMS_QUERY = `
  query GetItems {
    items {
      id
      organization_id
      name
      category
      purchase_unit
      units_per_case
      each_weight_g
      density_g_ml
      shelf_life_days
      allergens
      is_animal_product
      is_meat
      is_seafood
      is_dairy
      is_egg
      is_gluten_source
      current_cost_per_g
      fdc_id
      nutrition_macros
      created_at
      updated_at
    }
  }
`;

export default async function ItemsLedgerPage() {
  let items = [];

  try {
    const res = await graphqlClient.request<{ items: any[] }>(GET_ITEMS_QUERY);
    items = res.data?.items || [];
  } catch (err) {
    console.error("Failed to load items ledger via GraphQL:", err);
  }

  return <ItemsLedgerContainer initialItems={items} />;
}
