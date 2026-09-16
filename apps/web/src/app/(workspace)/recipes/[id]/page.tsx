import { graphqlClient } from "@soustools/api-client";
import { RecipeViewerContainer } from "@soustools/domain-recipes";

interface RecipePageProps {
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

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params;

  let recipe = null;
  const vessels: any[] = [];
  const costData = null;
  const nutritionData = null;
  const versionHistory: any[] = [];

  try {
    const res = await graphqlClient.request<{ recipe: any }>(GET_RECIPE_QUERY, {
      id,
    });
    const r = res.data?.recipe;
    if (r) {
      recipe = {
        id: r.id,
        organizationId: r.organization_id,
        title: r.title || r.name || "Untitled Recipe",
        yieldCount: r.yieldCount || r.yield_quantity || 1,
        yieldUnit: r.yieldUnit || r.yield_unit || "servings",
        status: r.status || "APPROVED",
        instructions: r.instructions || [],
        recipeIngredients: (r.recipe_ingredients || []).map((ri: any) => ({
          id: ri.id,
          recipeId: ri.recipe_id || ri.recipeId,
          masterIngredientId: ri.master_item_id || ri.masterIngredientId,
          subRecipeId: ri.sub_recipe_id || ri.subRecipeId,
          rawName: ri.custom_name || ri.rawName || "Ingredient",
          amount: Number(ri.quantity_amount ?? ri.amount ?? 1),
          unit: ri.quantity_unit || ri.unit || "g",
          calculationType: "fixed_weight",
          costContribution: ri.cost_contribution,
          sortOrder: ri.sort_order,
        })),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
  } catch (err) {
    console.error("Failed to fetch initial recipe viewer data via GraphQL:", err);
  }

  if (!recipe) {
    return (
      <div className="text-muted-foreground p-12 text-center">
        Recipe not found.
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <RecipeViewerContainer
        recipe={recipe as any}
        vessels={vessels}
        costData={costData}
        nutritionData={nutritionData}
        versionHistory={versionHistory}
      />
    </div>
  );
}
