import { ObjectType, Field, ID, Float, Int, InputType } from "@nestjs/graphql";
import GraphQLJSON from "graphql-type-json";

@ObjectType()
export class RecipeIngredientGQL {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, { nullable: true })
  recipe_id?: string;

  @Field(() => ID, { nullable: true })
  recipeId?: string;

  @Field(() => ID, { nullable: true })
  master_item_id?: string;

  @Field(() => ID, { nullable: true })
  masterIngredientId?: string;

  @Field(() => ID, { nullable: true })
  sub_recipe_id?: string;

  @Field(() => ID, { nullable: true })
  subRecipeId?: string;

  @Field(() => String, { nullable: true })
  custom_name?: string;

  @Field(() => String, { nullable: true })
  rawName?: string;

  @Field(() => Float, { nullable: true })
  amount?: number;

  @Field(() => Float, { nullable: true })
  quantity_amount?: number;

  @Field(() => String, { nullable: true })
  unit?: string;

  @Field(() => String, { nullable: true })
  quantity_unit?: string;

  @Field(() => Float, { nullable: true })
  cost_contribution?: number;

  @Field(() => Int, { nullable: true })
  sort_order?: number;

  @Field(() => String, { nullable: true })
  calculation_type?: string;

  @Field(() => Boolean, { nullable: true })
  base_calculation_group?: boolean;

  @Field(() => Boolean, { nullable: true })
  is_reference?: boolean;

  @Field(() => Float, { nullable: true })
  bakers_percentage?: number;

  @Field(() => String, { nullable: true })
  original_input_string?: string;

  @Field(() => Float, { nullable: true })
  standard_weight_g?: number;

  @Field(() => String, { nullable: true })
  prep_notes?: string;

  @Field(() => String, { nullable: true })
  component?: string;

  @Field(() => String, { nullable: true })
  created_at?: string;
}

@ObjectType()
export class RecipeTagGQL {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  color?: string;
}

@ObjectType()
export class RecipeCategoryGQL {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;
}

@ObjectType()
export class RecipeGQL {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  organization_id!: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  title?: string;

  @Field(() => String, { nullable: true })
  status?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => Float, { nullable: true })
  yield_quantity?: number;

  @Field(() => Float, { nullable: true })
  yieldCount?: number;

  @Field(() => String, { nullable: true })
  yield_unit?: string;

  @Field(() => String, { nullable: true })
  yieldUnit?: string;

  @Field(() => Float, { nullable: true })
  serving_size?: number;

  @Field(() => String, { nullable: true })
  serving_unit?: string;

  @Field(() => Float, { nullable: true })
  target_cost_per_serving?: number;

  @Field(() => Float, { nullable: true })
  calculated_cost_per_serving?: number;

  @Field(() => Int, { nullable: true })
  prep_time_minutes?: number;

  @Field(() => Int, { nullable: true })
  cook_time_minutes?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  instructions?: any;

  @Field(() => [String], { nullable: true })
  allergens?: string[];

  @Field(() => [RecipeIngredientGQL], { nullable: true })
  recipe_ingredients?: RecipeIngredientGQL[];

  @Field(() => [RecipeTagGQL], { nullable: true })
  recipe_tags?: RecipeTagGQL[];

  @Field(() => String, { nullable: true })
  created_at?: string;

  @Field(() => String, { nullable: true })
  updated_at?: string;
}

@InputType()
export class RecipeIngredientInputGQL {
  @Field(() => ID, { nullable: true })
  master_item_id?: string;

  @Field(() => ID, { nullable: true })
  sub_recipe_id?: string;

  @Field(() => String, { nullable: true })
  custom_name?: string;

  @Field(() => Float)
  quantity_amount!: number;

  @Field(() => String)
  quantity_unit!: string;

  @Field(() => Int, { nullable: true })
  sort_order?: number;
}

@InputType()
export class CreateRecipeInputGQL {
  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => Float, { nullable: true })
  yield_quantity?: number;

  @Field(() => String, { nullable: true })
  yield_unit?: string;

  @Field(() => Float, { nullable: true })
  serving_size?: number;

  @Field(() => String, { nullable: true })
  serving_unit?: string;

  @Field(() => Int, { nullable: true })
  prep_time_minutes?: number;

  @Field(() => Int, { nullable: true })
  cook_time_minutes?: number;

  @Field(() => [String], { nullable: true })
  instructions?: string[];

  @Field(() => [RecipeIngredientInputGQL], { nullable: true })
  ingredients?: RecipeIngredientInputGQL[];

  @Field(() => [String], { nullable: true })
  tag_ids?: string[];
}

@InputType()
export class UpdateRecipeInputGQL {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => Float, { nullable: true })
  yield_quantity?: number;

  @Field(() => String, { nullable: true })
  yield_unit?: string;

  @Field(() => Float, { nullable: true })
  serving_size?: number;

  @Field(() => String, { nullable: true })
  serving_unit?: string;

  @Field(() => Int, { nullable: true })
  prep_time_minutes?: number;

  @Field(() => Int, { nullable: true })
  cook_time_minutes?: number;

  @Field(() => [String], { nullable: true })
  instructions?: string[];

  @Field(() => [RecipeIngredientInputGQL], { nullable: true })
  ingredients?: RecipeIngredientInputGQL[];

  @Field(() => [String], { nullable: true })
  tag_ids?: string[];
}

@ObjectType()
export class VesselProfileGQL {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  organization_id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  shape?: string;

  @Field(() => Float, { nullable: true })
  volume_liters?: number;

  @Field(() => Float, { nullable: true })
  tare_weight_g?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  dimensions_cm?: any;

  @Field(() => String, { nullable: true })
  created_at?: string;

  @Field(() => String, { nullable: true })
  updated_at?: string;
}

@InputType()
export class CreateVesselInputGQL {
  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  shape?: string;

  @Field(() => Float, { nullable: true })
  volume_liters?: number;

  @Field(() => Float, { nullable: true })
  tare_weight_g?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  dimensions_cm?: any;
}

@InputType()
export class UpdateVesselInputGQL {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  shape?: string;

  @Field(() => Float, { nullable: true })
  volume_liters?: number;

  @Field(() => Float, { nullable: true })
  tare_weight_g?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  dimensions_cm?: any;
}

@ObjectType()
export class RecipeVersionGQL {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  recipe_id!: string;

  @Field(() => Int)
  version_number!: number;

  @Field(() => String, { nullable: true })
  change_summary?: string;

  @Field(() => GraphQLJSON)
  snapshot_data!: any;

  @Field(() => String, { nullable: true })
  created_at?: string;
}
