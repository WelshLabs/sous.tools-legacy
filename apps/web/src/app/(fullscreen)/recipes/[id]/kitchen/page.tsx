import { graphqlClient } from "@soustools/api-client";
import { ActiveKitchenContainer } from "@soustools/domain-recipes";

interface KitchenPageProps {
  params: Promise<{ id: string }>;
}

const GET_RECIPE_QUERY = `
  query GetRecipe($id: String!) {
    recipe(id: $id) {
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
      recipe_ingredients {
        id
        recipe_id
        master_item_id
        sub_recipe_id
        custom_name
        rawName
        quantity_amount
        amount
        quantity_unit
        unit
        cost_contribution
        sort_order
      }
    }
  }
`;

export const dynamic = "force-dynamic";

export default async function KitchenPage({ params }: KitchenPageProps) {
  const { id } = await params;

  let recipe = null;
  try {
    const res = await graphqlClient.request<{ recipe: any }>(GET_RECIPE_QUERY, {
      id,
    });
    const r = res.data?.recipe;
    if (r) {
      const parsedInstructions = Array.isArray(r.instructions)
        ? r.instructions.map((step: any, index: number) => ({
            id: step.id || String(index + 1),
            stepNumber: step.stepNumber || index + 1,
            text: typeof step === "string" ? step : step.text || "",
            durationMinutes: step.durationMinutes,
            temperatureC: step.temperatureC,
            timers: step.timers || [],
          }))
        : [];

      recipe = {
        id: r.id,
        organizationId: r.organization_id,
        title: r.title || r.name || "Untitled Recipe",
        yieldCount: r.yieldCount || r.yield_quantity || 1,
        yieldUnit: r.yieldUnit || r.yield_unit || "servings",
        status: r.status || "APPROVED",
        instructions: parsedInstructions,
        recipeIngredients: (r.recipe_ingredients || []).map((ri: any) => ({
          id: ri.id,
          recipeId: ri.recipe_id || ri.recipeId,
          masterIngredientId: ri.master_item_id || ri.masterIngredientId,
          subRecipeId: ri.sub_recipe_id || ri.subRecipeId,
          rawName: ri.custom_name || ri.rawName || "Ingredient",
          amount: Number(ri.quantity_amount ?? ri.amount ?? 1),
          unit: ri.quantity_unit || ri.unit || "g",
          costContribution: ri.cost_contribution,
          sortOrder: ri.sort_order,
        })),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
  } catch (err) {
    console.error("Failed to fetch recipe for kitchen mode via GraphQL:", err);
  }

  if (!recipe) {
    return (
      <div className="text-muted-foreground p-12 text-center">
        Recipe not found.
      </div>
    );
  }

  return (
    <div className="bg-card min-h-screen">
      <ActiveKitchenContainer
        recipe={recipe as any}
        backHref={`/recipes/${recipe.id}`}
      />
    </div>
  );
}
