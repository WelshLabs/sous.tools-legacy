import { Injectable, Optional } from "@nestjs/common";
import { supabase } from "../../core/database/supabase";
import { Recipe, RecipeIngredient } from "@soustools/api-types";
import { mapRecipeRow } from "./recipes.mapper";
import { RecipeMathService } from "./recipe-math.service";

/**
 * RecipesService manages recipe queries and CRUD operations.
 * @tenant-docs-export
 */
@Injectable()
export class RecipesService {
  constructor(
    @Optional() private readonly recipeMathService?: RecipeMathService,
  ) {}

  async findAll(orgId: string): Promise<Recipe[]> {
    const { data, error } = await supabase
      .from("recipes")
      .select("*, vessel:vessel_profiles(*), recipe_tag_assignments(tag_id)")
      .eq("organization_id", orgId)
      .order("title", { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map((row) =>
      mapRecipeRow(row as Record<string, unknown>),
    );
  }

  async findOne(id: string): Promise<Recipe> {
    const { data, error } = await supabase
      .from("recipes")
      .select(
        `
        *,
        vessel:vessel_profiles(*),
        recipe_ingredients (*),
        recipe_tag_assignments(tag_id)
      `,
      )
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    return mapRecipeRow(data as Record<string, unknown>);
  }

  async create(
    orgId: string,
    recipePayload: Omit<
      Recipe,
      "id" | "organizationId" | "createdAt" | "recipeIngredients" | "vessel"
    >,
    ingredientsPayload: Omit<
      RecipeIngredient,
      "id" | "recipeId" | "createdAt" | "masterIngredient"
    >[],
  ): Promise<Recipe> {
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert([
        {
          organization_id: orgId,
          title: recipePayload.title,
          yield_count: recipePayload.yieldCount,
          yield_unit: recipePayload.yieldUnit,
          vessel_id: recipePayload.vesselId,
          instructions: recipePayload.instructions,
          category_id: recipePayload.categoryId,
          status: recipePayload.status || "PENDING_REVIEW",
          source_book: recipePayload.sourceBook,
          source_author: recipePayload.sourceAuthor,
          source_page_start: recipePayload.sourcePageStart,
          source_page_end: recipePayload.sourcePageEnd,
        },
      ])
      .select()
      .single();

    if (recipeError) throw new Error(recipeError.message);

    if (ingredientsPayload && ingredientsPayload.length > 0) {
      const normalized = this.recipeMathService
        ? this.recipeMathService.normalizeRecipeIngredients(
            ingredientsPayload.map((ing) => ({
              ...ing,
              rawName: ing.rawName || "",
              amount: ing.amount,
              unit: ing.unit,
              masterIngredientId: ing.masterIngredientId,
              isReference: ing.isReference,
              baseCalculationGroup: ing.baseCalculationGroup,
              calculationType: ing.calculationType,
              bakersPercentage: ing.bakersPercentage,
              originalInputString: ing.originalInputString,
              standardWeightG: ing.standardWeightG,
              prepNotes: ing.prepNotes,
              component: ing.component,
            })),
          )
        : null;

      const dbIngredients = ingredientsPayload.map((ing, idx) => {
        const norm = normalized ? normalized[idx] : null;
        return {
          recipe_id: recipe.id,
          item_id: ing.masterIngredientId,
          calculation_type: norm?.calculationType || ing.calculationType,
          base_calculation_group: Boolean(
            norm?.baseCalculationGroup ?? ing.baseCalculationGroup,
          ),
          is_reference: Boolean(norm?.isReference ?? ing.isReference),
          bakers_percentage:
            norm?.bakersPercentage ?? ing.bakersPercentage ?? null,
          original_input_string:
            norm?.originalInputString || ing.originalInputString || null,
          standard_weight_g:
            norm?.standardWeightG ?? ing.standardWeightG ?? null,
          amount: norm?.standardAmount ?? ing.amount,
          unit: norm?.standardUnit ?? ing.unit,
          raw_name: ing.rawName || null,
          prep_notes: ing.prepNotes || null,
          component: ing.component || null,
        };
      });

      const { error: ingError } = await supabase
        .from("recipe_ingredients")
        .insert(dbIngredients);

      if (ingError) {
        await supabase.from("recipes").delete().eq("id", recipe.id);
        throw new Error(ingError.message);
      }
    }

    return this.findOne(recipe.id);
  }

  async update(
    id: string,
    recipePayload: Partial<Recipe>,
    ingredientsPayload?: Omit<
      RecipeIngredient,
      "id" | "recipeId" | "createdAt" | "masterIngredient"
    >[],
  ): Promise<Recipe> {
    const updateData: Record<string, unknown> = {};
    if (recipePayload.title !== undefined)
      updateData.title = recipePayload.title;
    if (recipePayload.yieldCount !== undefined)
      updateData.yield_count = recipePayload.yieldCount;
    if (recipePayload.yieldUnit !== undefined)
      updateData.yield_unit = recipePayload.yieldUnit;
    if (recipePayload.vesselId !== undefined)
      updateData.vessel_id = recipePayload.vesselId;
    if (recipePayload.instructions !== undefined)
      updateData.instructions = recipePayload.instructions;
    if (recipePayload.categoryId !== undefined)
      updateData.category_id = recipePayload.categoryId;
    if (recipePayload.status !== undefined)
      updateData.status = recipePayload.status;
    if (recipePayload.sourceBook !== undefined)
      updateData.source_book = recipePayload.sourceBook;
    if (recipePayload.sourceAuthor !== undefined)
      updateData.source_author = recipePayload.sourceAuthor;
    if (recipePayload.sourcePageStart !== undefined)
      updateData.source_page_start = recipePayload.sourcePageStart;
    if (recipePayload.sourcePageEnd !== undefined)
      updateData.source_page_end = recipePayload.sourcePageEnd;

    const { error: recipeError } = await supabase
      .from("recipes")
      .update(updateData)
      .eq("id", id);

    if (recipeError) throw new Error(recipeError.message);

    if (ingredientsPayload !== undefined) {
      const { error: clearError } = await supabase
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", id);

      if (clearError) throw new Error(clearError.message);

      if (ingredientsPayload.length > 0) {
        const normalized = this.recipeMathService
          ? this.recipeMathService.normalizeRecipeIngredients(
              ingredientsPayload.map((ing) => ({
                ...ing,
                rawName: ing.rawName || "",
                amount: ing.amount,
                unit: ing.unit,
                masterIngredientId: ing.masterIngredientId,
                isReference: ing.isReference,
                baseCalculationGroup: ing.baseCalculationGroup,
                calculationType: ing.calculationType,
                bakersPercentage: ing.bakersPercentage,
                originalInputString: ing.originalInputString,
                standardWeightG: ing.standardWeightG,
                prepNotes: ing.prepNotes,
                component: ing.component,
              })),
            )
          : null;

        const dbIngredients = ingredientsPayload.map((ing, idx) => {
          const norm = normalized ? normalized[idx] : null;
          return {
            recipe_id: id,
            item_id: ing.masterIngredientId,
            calculation_type: norm?.calculationType || ing.calculationType,
            base_calculation_group: Boolean(
              norm?.baseCalculationGroup ?? ing.baseCalculationGroup,
            ),
            is_reference: Boolean(norm?.isReference ?? ing.isReference),
            bakers_percentage:
              norm?.bakersPercentage ?? ing.bakersPercentage ?? null,
            original_input_string:
              norm?.originalInputString || ing.originalInputString || null,
            standard_weight_g:
              norm?.standardWeightG ?? ing.standardWeightG ?? null,
            amount: norm?.standardAmount ?? ing.amount,
            unit: norm?.standardUnit ?? ing.unit,
            raw_name: ing.rawName || null,
            prep_notes: ing.prepNotes || null,
            component: ing.component || null,
          };
        });

        const { error: ingError } = await supabase
          .from("recipe_ingredients")
          .insert(dbIngredients);

        if (ingError) throw new Error(ingError.message);
      }
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<Recipe> {
    const recipe = await this.findOne(id);
    const { error } = await supabase.from("recipes").delete().eq("id", id);

    if (error) throw new Error(error.message);
    return recipe;
  }
}
