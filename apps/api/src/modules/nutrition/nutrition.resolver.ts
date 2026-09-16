import { Resolver, Query, Args } from "@nestjs/graphql";
import { NutritionService } from "./nutrition.service";
import { UsdaResolverService } from "./usda-resolver.service";
import { RecipeNutritionPayloadGQL } from "./nutrition.types";
import { createAdminClient } from "../../core/database/supabase";
import GraphQLJSON from "graphql-type-json";

@Resolver(() => RecipeNutritionPayloadGQL)
export class NutritionResolver {
  constructor(
    private readonly nutritionService: NutritionService,
    private readonly usdaResolver: UsdaResolverService,
  ) {}

  @Query(() => RecipeNutritionPayloadGQL, {
    name: "recipeNutrition",
    nullable: true,
  })
  async getRecipeNutrition(
    @Args("recipeId") recipeId: string,
  ): Promise<RecipeNutritionPayloadGQL | null> {
    const supabase = createAdminClient();

    let { data: cache } = await supabase
      .from("recipe_nutrition_cache")
      .select("*")
      .eq("recipe_id", recipeId)
      .single();

    if (!cache || !cache.computed_at) {
      const { data: recipeData } = await supabase
        .from("recipes")
        .select(
          `
          *,
          recipe_ingredients(
            amount,
            unit,
            master_ingredient:master_items(
              id,
              name,
              nutrition_macros,
              allergens,
              is_animal_product,
              is_meat,
              is_seafood,
              is_dairy,
              is_egg,
              is_gluten_source
            )
          )
        `,
        )
        .eq("id", recipeId)
        .single();

      if (!recipeData) return null;

      const computedCache =
        await this.nutritionService.aggregateRecipeNutrition(recipeData as any);
      supabase
        .from("recipe_nutrition_cache")
        .upsert(computedCache as any)
        .then();
      cache = computedCache as any;
    }

    return {
      recipeId: cache.recipe_id || cache.recipeId,
      servings: Number(cache.servings),
      perServingNutrition:
        cache.per_serving_nutrition || cache.perServingNutrition,
      per100gNutrition: cache.per_100g_nutrition || cache.per100gNutrition,
      dietaryFlags: cache.dietary_flags || cache.dietaryFlags,
      computedAt: cache.computed_at || cache.computedAt,
    };
  }

  @Query(() => GraphQLJSON, { name: "usdaSearch", nullable: true })
  async usdaSearch(@Args("query") query: string): Promise<any> {
    if (!query) return null;
    const topMatches = await this.usdaResolver.searchTop5(query);
    if (topMatches && topMatches.length > 0) {
      return topMatches;
    }
    const single = await this.usdaResolver.resolveIngredient(query);
    return single ? [single] : [];
  }
}
