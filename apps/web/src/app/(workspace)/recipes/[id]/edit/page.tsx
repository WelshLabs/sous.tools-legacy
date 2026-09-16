import { graphqlClient } from "@soustools/api-client";
import { RecipeBuilderContainer } from "@soustools/domain-recipes";

interface EditRecipePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

const GET_RECIPE_FOR_EDIT_QUERY = `
  query GetRecipeForEdit($id: String!) {
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
        rawName
        custom_name
        amount
        quantity_amount
        unit
        quantity_unit
        calculation_type
        base_calculation_group
        is_reference
        bakers_percentage
        original_input_string
        standard_weight_g
        prep_notes
        component
        sort_order
      }
    }
    recipeIngredientsCatalog {
      id
      name
      organization_id
      density_g_ml
      current_cost_per_g
      fdc_id
    }
  }
`;

export default async function EditRecipePage({ params }: EditRecipePageProps) {
  const { id } = await params;

  let recipe = null;

  try {
    const res = await graphqlClient.request<{
      recipe: any;
      recipeIngredientsCatalog: any[];
    }>(GET_RECIPE_FOR_EDIT_QUERY, { id });
    const r = res.data?.recipe;
    if (r) {
      recipe = {
        id: r.id,
        organizationId: r.organization_id,
        organization_id: r.organization_id,
        title: r.title || r.name || "Untitled Recipe",
        name: r.title || r.name || "Untitled Recipe",
        yieldCount: r.yieldCount || r.yield_quantity || 1,
        yield_quantity: r.yieldCount || r.yield_quantity || 1,
        yieldUnit: r.yieldUnit || r.yield_unit || "servings",
        yield_unit: r.yieldUnit || r.yield_unit || "servings",
        status: r.status || "DRAFT",
        instructions: r.instructions || [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        recipeIngredients: (r.recipe_ingredients || []).map((ri: any) => ({
          id: ri.id,
          recipeId: ri.recipe_id,
          recipe_id: ri.recipe_id,
          masterIngredientId: ri.master_item_id || null,
          master_item_id: ri.master_item_id || null,
          rawName: ri.raw_name || ri.custom_name || "Ingredient",
          custom_name: ri.raw_name || ri.custom_name || "Ingredient",
          amount: Number(ri.amount ?? ri.quantity_amount ?? 1),
          quantity_amount: Number(ri.amount ?? ri.quantity_amount ?? 1),
          unit: ri.unit || ri.quantity_unit || "g",
          quantity_unit: ri.unit || ri.quantity_unit || "g",
          calculationType: ri.calculation_type || "fixed_weight",
          calculation_type: ri.calculation_type || "fixed_weight",
          baseCalculationGroup: Boolean(ri.base_calculation_group),
          isReference: Boolean(ri.is_reference),
          bakersPercentage: ri.bakers_percentage ?? null,
          originalInputString: ri.original_input_string ?? null,
          standardWeightG: ri.standard_weight_g ?? null,
          prepNotes: ri.prep_notes ?? null,
          component: ri.component ?? null,
          sortOrder: ri.sort_order ?? 0,
          createdAt: new Date().toISOString(),
        })),
      };
      (recipe as any).catalog = (res.data?.recipeIngredientsCatalog || []).map(
        (item: any) => ({
          id: item.id,
          organizationId: item.organization_id,
          name: item.name,
          densityGMl: Number(item.density_g_ml || 1),
          currentCostPerG: Number(item.current_cost_per_g || 0),
          fdcId: item.fdc_id ? Number(item.fdc_id) : null,
        }),
      );
    }
  } catch (err) {
    console.error("Failed to fetch recipe for edit via GraphQL:", err);
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
      <RecipeBuilderContainer
        initialData={recipe as any}
        vessels={[]}
        masterIngredients={(recipe as any).catalog || []}
      />
    </div>
  );
}
