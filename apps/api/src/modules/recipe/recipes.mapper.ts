import {
  Recipe,
  VesselProfile,
  RecipeIngredient,
  MasterIngredient,
  NutritionMacros,
} from "@soustools/api-types";

/**
 * Maps database row to Recipe API type.
 * @tenant-docs-export
 */
export function mapRecipeRow(row: Record<string, unknown>): Recipe {
  const vesselRaw = row.vessel as Record<string, unknown> | null;
  const ingredientsRaw = row.recipe_ingredients as
    Record<string, unknown>[] | null;

  const vessel: VesselProfile | undefined = vesselRaw
    ? {
        id: String(vesselRaw.id),
        organizationId: String(vesselRaw.organization_id),
        name: String(vesselRaw.name),
        shape: vesselRaw.shape as "ROUND" | "RECTANGULAR",
        length: vesselRaw.length !== null ? Number(vesselRaw.length) : null,
        width: vesselRaw.width !== null ? Number(vesselRaw.width) : null,
        height: vesselRaw.height !== null ? Number(vesselRaw.height) : null,
        diameter:
          vesselRaw.diameter !== null ? Number(vesselRaw.diameter) : null,
        volumeMl: Number(vesselRaw.volume_ml),
        createdAt: String(vesselRaw.created_at),
      }
    : undefined;

  const recipeIngredients: RecipeIngredient[] = ingredientsRaw
    ? ingredientsRaw.map((ri) => {
        const mi = (ri.items || ri.master_items) as Record<
          string,
          unknown
        > | null;
        const macros = (mi?.nutrition_macros || {}) as Record<string, unknown>;
        const nutritionMacros: NutritionMacros = {
          calories:
            macros.calories !== undefined && macros.calories !== null
              ? Number(macros.calories)
              : null,
          proteinG:
            macros.proteinG !== undefined && macros.proteinG !== null
              ? Number(macros.proteinG)
              : null,
          carbsG:
            macros.carbsG !== undefined && macros.carbsG !== null
              ? Number(macros.carbsG)
              : null,
          fatG:
            macros.fatG !== undefined && macros.fatG !== null
              ? Number(macros.fatG)
              : null,
        };

        const masterIngredient: MasterIngredient | undefined = mi
          ? {
              id: String(mi.id),
              organizationId: String(mi.organization_id),
              name: String(mi.name),
              densityGMl: Number(mi.density_g_ml || 1.0),
              nutritionMacros,
              allergens: Array.isArray(mi.allergens)
                ? (mi.allergens as string[])
                : [],
              ingredientType: mi.ingredient_type
                ? String(mi.ingredient_type)
                : null,
              isAnimalProduct: Boolean(mi.is_animal_product),
              isMeat: Boolean(mi.is_meat),
              isSeafood: Boolean(mi.is_seafood),
              isDairy: Boolean(mi.is_dairy),
              isEgg: Boolean(mi.is_egg),
              isGlutenSource: Boolean(mi.is_gluten_source),
              fdcId:
                mi.fdc_id !== null && mi.fdc_id !== undefined
                  ? Number(mi.fdc_id)
                  : null,
              nutritionVerifiedAt: mi.nutrition_verified_at
                ? String(mi.nutrition_verified_at)
                : null,
              createdAt: String(mi.created_at),
              updatedAt: String(mi.updated_at),
            }
          : undefined;

        const masterId = ri.item_id
          ? String(ri.item_id)
          : ri.master_item_id
            ? String(ri.master_item_id)
            : null;
        const amt = Number(ri.amount || ri.quantity_amount || 0);
        const u = String(ri.unit || ri.quantity_unit || "g");
        const rName = ri.raw_name || ri.custom_name ? String(ri.raw_name || ri.custom_name) : null;

        return {
          id: String(ri.id),
          recipeId: String(ri.recipe_id),
          recipe_id: String(ri.recipe_id),
          masterIngredientId: masterId,
          master_item_id: masterId,
          subRecipeId: ri.sub_recipe_id ? String(ri.sub_recipe_id) : null,
          sub_recipe_id: ri.sub_recipe_id ? String(ri.sub_recipe_id) : null,
          calculation_type: (ri.calculation_type || "fixed_weight") as string,
          calculationType: (ri.calculation_type || "fixed_weight") as
            "fixed_weight" | "bakers_percentage",
          baseCalculationGroup: Boolean(ri.base_calculation_group),
          base_calculation_group: Boolean(ri.base_calculation_group),
          isReference: Boolean(ri.is_reference),
          is_reference: Boolean(ri.is_reference),
          bakersPercentage:
            ri.bakers_percentage !== null && ri.bakers_percentage !== undefined
              ? Number(ri.bakers_percentage)
              : null,
          bakers_percentage:
            ri.bakers_percentage !== null && ri.bakers_percentage !== undefined
              ? Number(ri.bakers_percentage)
              : null,
          originalInputString: ri.original_input_string
            ? String(ri.original_input_string)
            : null,
          original_input_string: ri.original_input_string
            ? String(ri.original_input_string)
            : null,
          standardWeightG:
            ri.standard_weight_g !== null && ri.standard_weight_g !== undefined
              ? Number(ri.standard_weight_g)
              : null,
          standard_weight_g:
            ri.standard_weight_g !== null && ri.standard_weight_g !== undefined
              ? Number(ri.standard_weight_g)
              : null,
          amount: amt,
          quantity_amount: amt,
          unit: u,
          quantity_unit: u,
          prepNotes: ri.prep_notes ? String(ri.prep_notes) : null,
          prep_notes: ri.prep_notes ? String(ri.prep_notes) : null,
          rawName: rName,
          custom_name: rName,
          component: ri.component ? String(ri.component) : null,
          sort_order: ri.sort_order !== null && ri.sort_order !== undefined ? Number(ri.sort_order) : 0,
          cost_contribution: ri.cost_contribution !== null && ri.cost_contribution !== undefined
            ? Number(ri.cost_contribution)
            : null,
          createdAt: String(ri.created_at || new Date().toISOString()),
          created_at: String(ri.created_at || new Date().toISOString()),
          masterIngredient,
        };
      })
    : [];

  const tagsRaw = row.recipe_tag_assignments as
    Record<string, unknown>[] | null;
  const tagIds = tagsRaw ? tagsRaw.map((t) => String(t.tag_id)) : [];

  const title = String(row.title || row.name || "Untitled Recipe");
  const yieldCount = Number(row.yield_count || row.yield_quantity || 1);
  const yieldUnit = String(row.yield_unit || "servings");
  const orgId = String(row.organization_id || "");

  return {
    id: String(row.id),
    organizationId: orgId,
    organization_id: orgId,
    title,
    name: title,
    yieldCount,
    yield_quantity: yieldCount,
    yieldUnit,
    yield_unit: yieldUnit,
    vesselId: row.vessel_id ? String(row.vessel_id) : null,
    instructions: (row.instructions || []) as Recipe["instructions"],
    createdAt: String(row.created_at || new Date().toISOString()),
    created_at: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
    categoryId: row.category_id ? String(row.category_id) : null,
    status: (row.status || "PENDING_REVIEW") as Recipe["status"],
    sourceBook: row.source_book ? String(row.source_book) : null,
    sourceAuthor: row.source_author ? String(row.source_author) : null,
    sourcePageStart:
      row.source_page_start !== null && row.source_page_start !== undefined
        ? Number(row.source_page_start)
        : null,
    sourcePageEnd:
      row.source_page_end !== null && row.source_page_end !== undefined
        ? Number(row.source_page_end)
        : null,
    vessel,
    recipeIngredients,
    recipe_ingredients: recipeIngredients as any,
    tagIds,
  } as Recipe;
}
