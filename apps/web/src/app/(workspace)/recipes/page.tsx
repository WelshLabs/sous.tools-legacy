import { graphqlClient } from "@soustools/api-client";
import { type Recipe } from "@soustools/api-types";
import { RecipeListContainer } from "@soustools/domain-recipes";

export const dynamic = "force-dynamic";

const GET_RECIPES_QUERY = `
  query GetRecipes {
    recipes {
      id
      organization_id
      title
      name
      yieldCount
      yield_quantity
      yieldUnit
      yield_unit
      status
      instructions
      created_at
      updated_at
    }
  }
`;

export default async function RecipesPage() {
  let recipes: Recipe[] = [];
  try {
    const res = await graphqlClient.request<{ recipes: any[] }>(
      GET_RECIPES_QUERY,
    );
    recipes = (res.data?.recipes || []).map((r: any) => ({
      id: r.id,
      organizationId: r.organization_id,
      title: r.title || r.name || "Untitled Recipe",
      yieldCount: r.yieldCount || r.yield_quantity || 1,
      yieldUnit: r.yieldUnit || r.yield_unit || "servings",
      status: r.status || "APPROVED",
      vesselId: r.vessel_id || r.vesselId || null,
      instructions: r.instructions || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch (err) {
    console.error("Failed to fetch recipes via GraphQL:", err);
  }

  return (
    <div className="px-4 py-6">
      <RecipeListContainer initialRecipes={recipes} />
    </div>
  );
}
