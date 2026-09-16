/* eslint-disable max-lines */
import { type RecipeIngredient } from "@soustools/api-types";
import { convertUnit, COUNT_UNITS } from "./unit-conversion";
import {
  getIngredientEstimatedWeight,
  formatIngredientAmountWithEstimate,
} from "./culinary-encyclopedia";
import { type BakersFormulaSummary } from "../types";

export {
  convertUnit,
  WEIGHT_CONVERSIONS,
  VOLUME_CONVERSIONS,
  COUNT_UNITS,
} from "./unit-conversion";

export {
  lookupEncyclopedia,
  getIngredientEstimatedWeight,
  formatIngredientAmountWithEstimate,
  CULINARY_ENCYCLOPEDIA,
  type CulinaryEncyclopediaEntry,
  type EstimatedWeightResult,
} from "./culinary-encyclopedia";

export interface ScaledIngredientResult {
  ingredientId: string;
  name: string;
  originalAmount: number;
  originalUnit: string;
  scaledAmount: number;
  scaledUnit: string;
  calculationType: "fixed_weight" | "bakers_percentage";
  baseCalculationGroup: boolean;
  percentageOfBase?: number; // Baker's percentage if applicable
  weightInGrams: number; // Calculated final weight in grams (or estimated weight for count items)
  isCountUnit?: boolean;
  estimateText?: string;
  subBreakdown?: string;
}

/**
 * Calculates scaled values for all recipe ingredients based on scaling inputs.
 */
export function calculateRecipeScale(
  ingredients: RecipeIngredient[],
  baseYield: number,
  options: {
    targetYield?: number;
    targetTotalWeight?: number;
    targetVesselVolume?: number;
    defaultVesselVolume?: number;
    customIngredientWeights?: Record<string, { amount: number; unit: string }>; // anchor overrides
    customPercentages?: Record<string, number>; // interactive baker's % adjustments
  } = {},
): {
  multiplier: number;
  items: ScaledIngredientResult[];
  bakersSummary: BakersFormulaSummary;
} {
  if (ingredients.length === 0) {
    return {
      multiplier: 1,
      items: [],
      bakersSummary: {
        totalFlourWeightG: 0,
        totalLiquidWeightG: 0,
        hydrationPercentage: 0,
        totalFormulaPercentage: 0,
        isBakersRecipe: false,
      },
    };
  }

  // 1. Calculate the weight of each ingredient in grams to find base total/flour weights
  const ingredientBaseWeightsG: Record<string, number> = {};
  const componentBaseFlourWeightsG: Record<string, number> = {};

  // Resolve fixed weight / base flour values first
  ingredients.forEach((ing) => {
    const density = ing.masterIngredient?.densityGMl ?? 1.0;
    const name = ing.masterIngredient?.name ?? ing.rawName ?? "";
    const unit = (ing.unit || "g").toLowerCase().trim();
    const isCount = COUNT_UNITS.has(unit);
    const isBakers =
      ing.calculationType === "bakers_percentage" && !ing.baseCalculationGroup;

    if (!isBakers) {
      let weightG = 0;
      if (isCount) {
        const est = getIngredientEstimatedWeight(
          name,
          ing.amount,
          ing.unit || "ea",
          density,
        );
        weightG = est ? est.totalWeightG : ing.amount; // fallback if unknown count weight
      } else {
        weightG = convertUnit(
          ing.amount,
          ing.unit || "g",
          "g",
          density,
          undefined,
          undefined,
          name,
        );
      }

      ingredientBaseWeightsG[ing.id] = weightG;

      if (ing.baseCalculationGroup) {
        const comp = ing.component || "Base Recipe";
        componentBaseFlourWeightsG[comp] =
          (componentBaseFlourWeightsG[comp] || 0) + weightG;
      }
    }
  });

  // If there are no explicitly marked base flour items, but there are baker's percentage items,
  // find any flour/flour-like ingredients or default first fixed ingredient as base
  let totalBaseFlourG = Object.values(componentBaseFlourWeightsG).reduce(
    (a, b) => a + b,
    0,
  );
  if (totalBaseFlourG === 0) {
    // Check if any ingredient is flour
    const flourIng = ingredients.find(
      (i) =>
        (i.masterIngredient?.name || i.rawName || "")
          .toLowerCase()
          .includes("flour") && i.calculationType !== "bakers_percentage",
    );
    if (flourIng) {
      const comp = flourIng.component || "Base Recipe";
      const w = ingredientBaseWeightsG[flourIng.id] || flourIng.amount;
      componentBaseFlourWeightsG[comp] = w;
      totalBaseFlourG = w;
    }
  }

  // Resolve baker's percentage values based on base flour weight
  ingredients.forEach((ing) => {
    if (
      ing.calculationType === "bakers_percentage" &&
      !ing.baseCalculationGroup
    ) {
      const comp = ing.component || "Base Recipe";
      const baseWeightG =
        componentBaseFlourWeightsG[comp] || totalBaseFlourG || 100;
      const pct = options.customPercentages?.[ing.id] ?? ing.amount;
      // Amount represents percentage (e.g. 65%)
      const weightG = baseWeightG * (pct / 100);
      ingredientBaseWeightsG[ing.id] = weightG;
    }
  });

  // Calculate base total weight of the recipe
  const baseTotalWeightG = Object.values(ingredientBaseWeightsG).reduce(
    (a, b) => a + b,
    0,
  );

  // 2. Determine the scaling multiplier
  let multiplier = 1.0;

  if (
    options.customIngredientWeights &&
    Object.keys(options.customIngredientWeights).length > 0
  ) {
    // Scaled relative to a specific ingredient weight override (anchoring)
    const [anchorId, targetWeight] = Object.entries(
      options.customIngredientWeights,
    )[0];
    const anchorIng = ingredients.find((ing) => ing.id === anchorId);
    if (anchorIng) {
      const density = anchorIng.masterIngredient?.densityGMl ?? 1.0;
      const name = anchorIng.masterIngredient?.name ?? anchorIng.rawName ?? "";
      const isCount = COUNT_UNITS.has(targetWeight.unit.toLowerCase().trim());

      let targetWeightG = 0;
      if (isCount) {
        const est = getIngredientEstimatedWeight(
          name,
          targetWeight.amount,
          targetWeight.unit,
          density,
        );
        targetWeightG = est ? est.totalWeightG : targetWeight.amount;
      } else {
        targetWeightG = convertUnit(
          targetWeight.amount,
          targetWeight.unit,
          "g",
          density,
          undefined,
          undefined,
          name,
        );
      }

      const baseWeightG = ingredientBaseWeightsG[anchorId] ?? 0;

      if (baseWeightG > 0) {
        multiplier = targetWeightG / baseWeightG;
      } else if (anchorIng.amount > 0) {
        multiplier = targetWeight.amount / anchorIng.amount;
      }
    }
  } else if (options.targetVesselVolume && options.defaultVesselVolume) {
    // Scaled relative to vessel volumes
    multiplier = options.targetVesselVolume / options.defaultVesselVolume;
  } else if (options.targetTotalWeight && baseTotalWeightG > 0) {
    // Scaled relative to total weight
    multiplier = options.targetTotalWeight / baseTotalWeightG;
  } else if (options.targetYield) {
    // Scaled relative to portions
    multiplier = options.targetYield / (baseYield || 1);
  }

  // Prevent divide-by-zero or negative multiplier issues
  if (isNaN(multiplier) || !isFinite(multiplier) || multiplier <= 0) {
    multiplier = 1.0;
  }

  // 3. Map ingredients to scaled outputs
  let totalScaledFlourG = 0;
  let totalScaledLiquidG = 0;
  let hasBakersPercentages = false;

  const items = ingredients.map((ing): ScaledIngredientResult => {
    const density = ing.masterIngredient?.densityGMl ?? 1.0;
    const name =
      ing.masterIngredient?.name ?? ing.rawName ?? "Unknown Ingredient";
    const isCount = COUNT_UNITS.has((ing.unit || "").toLowerCase().trim());

    let scaledAmount = 0;
    let scaledUnit = ing.unit;
    let weightInGrams = 0;
    let percentageOfBase: number | undefined;

    if (
      ing.baseCalculationGroup ||
      ing.calculationType !== "bakers_percentage"
    ) {
      scaledAmount = ing.amount * multiplier;
      weightInGrams = (ingredientBaseWeightsG[ing.id] ?? 0) * multiplier;

      if (ing.baseCalculationGroup) {
        hasBakersPercentages = true;
        percentageOfBase = 100;
        totalScaledFlourG += weightInGrams;
      }
    } else {
      // bakers_percentage
      hasBakersPercentages = true;
      const comp = ing.component || "Base Recipe";
      const targetFlourG =
        (componentBaseFlourWeightsG[comp] || totalBaseFlourG || 100) *
        multiplier;
      const pct = options.customPercentages?.[ing.id] ?? ing.amount;
      percentageOfBase = pct;
      weightInGrams = targetFlourG * (pct / 100);

      // If unit in DB is '%', display the calculated target weight in grams
      if (ing.unit === "%") {
        scaledAmount = weightInGrams;
        scaledUnit = "g";
      } else if (isCount) {
        // Count unit in baker's percentage (e.g. eggs as % of flour)
        const est = getIngredientEstimatedWeight(name, 1, ing.unit, density);
        const singleG = est ? est.totalWeightG : 50;
        scaledAmount = weightInGrams / singleG;
        scaledUnit = ing.unit;
      } else {
        scaledAmount = convertUnit(
          weightInGrams,
          "g",
          ing.unit,
          density,
          undefined,
          undefined,
          name,
        );
      }
    }

    // Check if ingredient is a liquid/water for hydration calculation
    const lowerName = name.toLowerCase();
    const isLiquid =
      lowerName.includes("water") ||
      lowerName.includes("milk") ||
      lowerName.includes("juice") ||
      lowerName.includes("liquid") ||
      lowerName.includes("beer") ||
      lowerName.includes("cider");
    if (isLiquid) {
      totalScaledLiquidG += weightInGrams;
    }

    // Lookup culinary estimate text for display (e.g. `2 ea` -> `(~100g)`)
    let estimateText: string | undefined;
    let subBreakdown: string | undefined;
    if (isCount) {
      const formatted = formatIngredientAmountWithEstimate(
        scaledAmount,
        scaledUnit,
        name,
        density,
      );
      estimateText = formatted.estimateText;
      subBreakdown = formatted.subBreakdown;
    }

    return {
      ingredientId: ing.id,
      name,
      originalAmount: ing.amount,
      originalUnit: ing.unit,
      scaledAmount,
      scaledUnit,
      calculationType: ing.calculationType as
        "fixed_weight" | "bakers_percentage",
      baseCalculationGroup: ing.baseCalculationGroup,
      percentageOfBase,
      weightInGrams,
      isCountUnit: isCount,
      estimateText,
      subBreakdown,
    };
  });

  const hydrationPercentage =
    totalScaledFlourG > 0
      ? Number(((totalScaledLiquidG / totalScaledFlourG) * 100).toFixed(1))
      : 0;

  const totalFormulaPercentage =
    totalScaledFlourG > 0
      ? Number(
          (
            (items.reduce((acc, item) => acc + item.weightInGrams, 0) /
              totalScaledFlourG) *
            100
          ).toFixed(1),
        )
      : 100;

  return {
    multiplier,
    items,
    bakersSummary: {
      totalFlourWeightG: Math.round(totalScaledFlourG),
      totalLiquidWeightG: Math.round(totalScaledLiquidG),
      hydrationPercentage,
      totalFormulaPercentage,
      isBakersRecipe: hasBakersPercentages || totalScaledFlourG > 0,
    },
  };
}
