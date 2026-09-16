/* eslint-disable max-lines */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type {
  Recipe,
  VesselProfile,
  MasterIngredient,
  RecipeNutritionCache,
} from "@soustools/api-types";
import type {
  ScaledIngredient,
  RecipeCostData,
  VersionRow,
  InventoryItem,
  WastageReason,
  BakersFormulaSummary,
} from "../../types";
import { calculateRecipeScale } from "../../utils/scaling";
import { RecipeViewerView } from "./RecipeViewer.view";

export type ScaleMode = "yield" | "weight" | "bakers" | "vessel";

export interface CustomWeightOpts {
  mode: "weight";
  weight: number;
}

export interface RecipeViewerProps {
  recipe: Recipe;
  vessels: VesselProfile[];
  masterIngredients?: MasterIngredient[];
  scaledIngredients?: ScaledIngredient[];
  finalMultiplier?: number;
  costData?: RecipeCostData | null;
  nutritionData?: RecipeNutritionCache | null | undefined;
  versionHistory?: VersionRow[];

  onScaleChange?: (multiplier: number, customOpts?: CustomWeightOpts) => void;
  onIngredientWeightChange?: (
    ingId: string,
    amount: number,
    unit: string,
  ) => void;
  onIngredientUnitChange?: (ingId: string, newUnit: string) => void;
  onBakersPercentageChange?: (ingId: string, percentage: number) => void;
  onCostFactorsChange?: (wastePct: number, portions: number) => void;

  onSaveVersion?: () => Promise<void>;
  onRestoreVersion?: (version: VersionRow) => void;
  onDownloadLabel?: () => void;

  onSearchItems?: (query: string) => Promise<InventoryItem[]>;
  onSubmitWastage?: (payload: {
    itemId: string;
    amountG: number;
    reason: WastageReason;
  }) => Promise<boolean>;

  backHref?: string;
  loadingCost?: boolean;
  savingCost?: boolean;
  loadingNutrition?: boolean;
  loadingHistory?: boolean;
}

const UNIT_TO_G: Record<string, number> = {
  g: 1,
  oz: 28.35,
  lb: 453.59,
  kg: 1000,
  ea: 50,
};

export function RecipeViewer(props: RecipeViewerProps) {
  const {
    recipe,
    vessels,
    masterIngredients: initialMasterIngredients,
    costData: initialCostData = null,
    nutritionData = null,
    versionHistory = [],
    onScaleChange: externalOnScaleChange,
    onIngredientWeightChange: externalOnIngredientWeightChange,
    onIngredientUnitChange: _externalOnIngredientUnitChange,
    onBakersPercentageChange: externalOnBakersPercentageChange,
    onCostFactorsChange: externalOnCostFactorsChange,
    onSaveVersion: externalOnSaveVersion,
    onRestoreVersion: externalOnRestoreVersion,
    onDownloadLabel: externalOnDownloadLabel,
    onSearchItems: externalOnSearchItems,
    onSubmitWastage: externalOnSubmitWastage,
    backHref = "/recipes",
  } = props;

  const [liveIngredients, setLiveIngredients] = useState<MasterIngredient[]>(
    initialMasterIngredients || [],
  );

  useEffect(() => {
    if (initialMasterIngredients && initialMasterIngredients.length > 0) {
      setLiveIngredients(initialMasterIngredients);
    }
  }, [initialMasterIngredients]);

  const [internalCostData, setInternalCostData] =
    useState<RecipeCostData | null>(initialCostData);

  useEffect(() => {
    setInternalCostData(initialCostData);
  }, [initialCostData]);

  const [multiplier, setMultiplier] = useState(1.0);
  const [customWeights, setCustomWeights] = useState<
    Record<string, { amount: number; unit: string }>
  >({});
  const [customPercentages, setCustomPercentages] = useState<
    Record<string, number>
  >({});

  const scalingOptions = useMemo(() => {
    const opts: Record<string, unknown> = { customPercentages };
    if (Object.keys(customWeights).length > 0) {
      opts.customIngredientWeights = customWeights;
      return opts;
    }
    if (multiplier !== 1.0) {
      opts.targetYield = (recipe.yieldCount || 1) * multiplier;
      return opts;
    }
    return opts;
  }, [customWeights, multiplier, recipe.yieldCount, customPercentages]);

  const { multiplier: computedMultiplier, items: computedScaledIngredients } =
    useMemo(() => {
      return calculateRecipeScale(
        recipe.recipeIngredients || [],
        recipe.yieldCount || 1,
        scalingOptions,
      );
    }, [recipe.recipeIngredients, recipe.yieldCount, scalingOptions]);

  const finalMultiplier = props.finalMultiplier ?? computedMultiplier;
  const scaledIngredients =
    props.scaledIngredients ?? computedScaledIngredients;

  const handleScaleChange = useCallback(
    (mult: number, customOpts?: CustomWeightOpts) => {
      if (externalOnScaleChange) {
        externalOnScaleChange(mult, customOpts);
        return;
      }
      if (customOpts && customOpts.mode === "weight") {
        const { multiplier: m } = calculateRecipeScale(
          recipe.recipeIngredients || [],
          recipe.yieldCount || 1,
          {
            targetTotalWeight: customOpts.weight,
            customPercentages,
          },
        );
        setMultiplier(m);
      } else {
        setMultiplier(mult);
      }
      setCustomWeights({});
    },
    [
      externalOnScaleChange,
      recipe.recipeIngredients,
      recipe.yieldCount,
      customPercentages,
    ],
  );

  const handleIngredientWeightChange = useCallback(
    (ingId: string, amount: number, unit: string) => {
      if (externalOnIngredientWeightChange) {
        externalOnIngredientWeightChange(ingId, amount, unit);
        return;
      }
      if (amount > 0) {
        setCustomWeights({ [ingId]: { amount, unit } });
      } else {
        setCustomWeights({});
        setMultiplier(1.0);
      }
    },
    [externalOnIngredientWeightChange],
  );

  const handleBakersPercentageChange = useCallback(
    (ingId: string, percentage: number) => {
      if (externalOnBakersPercentageChange) {
        externalOnBakersPercentageChange(ingId, percentage);
        return;
      }
      setCustomPercentages((prev) => ({
        ...prev,
        [ingId]: percentage,
      }));
    },
    [externalOnBakersPercentageChange],
  );

  const handleCostFactorsChange = useCallback(
    async (waste: number, port: number) => {
      if (externalOnCostFactorsChange) {
        externalOnCostFactorsChange(waste, port);
        return;
      }
      try {
        const res = await fetch(
          `/api/recipes/${recipe.id}/cost?wastePct=${waste}&portions=${port}`,
        );
        const json = await res.json();
        if (json.success && json.data) {
          setInternalCostData(json.data);
        }
      } catch (err) {
        console.error("Failed to refetch cost data:", err);
      }
    },
    [externalOnCostFactorsChange, recipe.id],
  );

  const handleSaveVersion = useCallback(async () => {
    if (externalOnSaveVersion) {
      await externalOnSaveVersion();
    }
  }, [externalOnSaveVersion]);

  const handleRestoreVersion = useCallback(
    (v: VersionRow) => {
      if (externalOnRestoreVersion) {
        externalOnRestoreVersion(v);
      }
    },
    [externalOnRestoreVersion],
  );

  const handleDownloadLabel = useCallback(() => {
    if (externalOnDownloadLabel) {
      externalOnDownloadLabel();
    }
  }, [externalOnDownloadLabel]);

  const handleSearchItems = useCallback(
    async (q: string) => {
      if (externalOnSearchItems) {
        return externalOnSearchItems(q);
      }
      return [];
    },
    [externalOnSearchItems],
  );

  const handleSubmitWastage = useCallback(
    async (payload: {
      itemId: string;
      amountG: number;
      reason: WastageReason;
    }) => {
      if (externalOnSubmitWastage) {
        return externalOnSubmitWastage(payload);
      }
      return true;
    },
    [externalOnSubmitWastage],
  );

  // RecipeViewer states
  const [isWastageOpen, setIsWastageOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isBakersMode, setIsBakersMode] = useState(false);

  // Scaling states
  const [scaleMode, setScaleMode] = useState<ScaleMode>("yield");
  const [targetYield, setTargetYield] = useState(recipe.yieldCount || 1);
  const [targetWeight, setTargetWeight] = useState("");
  const [targetBakersFlour, setTargetBakersFlour] = useState("");
  const [selectedVesselId, setSelectedVesselId] = useState(
    recipe.vesselId || "",
  );

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isHistoryOpen) setIsHistoryOpen(false);
        if (isWastageOpen) setIsWastageOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isHistoryOpen, isWastageOpen]);

  // Compute Baker's summary metrics
  const bakersSummary: BakersFormulaSummary = useMemo(() => {
    const { bakersSummary: summary } = calculateRecipeScale(
      recipe.recipeIngredients || [],
      recipe.yieldCount || 1,
    );
    return summary;
  }, [recipe.recipeIngredients, recipe.yieldCount]);

  const recipeYieldCount = recipe.yieldCount || 1;
  useEffect(() => {
    if (scaleMode === "yield") {
      handleScaleChange(targetYield / recipeYieldCount);
    }
  }, [scaleMode, targetYield, recipeYieldCount, handleScaleChange]);

  const recipeVesselId = recipe.vesselId;
  useEffect(() => {
    if (scaleMode === "vessel" && selectedVesselId) {
      const currentVessel = vessels.find((v) => v.id === recipeVesselId);
      const targetVessel = vessels.find((v) => v.id === selectedVesselId);
      if (currentVessel && targetVessel && currentVessel.volumeMl > 0) {
        handleScaleChange(targetVessel.volumeMl / currentVessel.volumeMl);
      }
    }
  }, [scaleMode, selectedVesselId, vessels, recipeVesselId, handleScaleChange]);

  const handleWeightChange = (val: string) => {
    setTargetWeight(val);
    const weightNum = parseFloat(val) || 0;
    if (weightNum > 0) {
      handleScaleChange(0, { mode: "weight", weight: weightNum });
    } else {
      handleScaleChange(1.0);
    }
  };

  const handleBakersFlourChange = (val: string) => {
    setTargetBakersFlour(val);
    const targetFlourG = parseFloat(val) || 0;
    const baseFlourG = bakersSummary.totalFlourWeightG || 1;
    if (targetFlourG > 0 && baseFlourG > 0) {
      handleScaleChange(targetFlourG / baseFlourG);
    } else {
      handleScaleChange(1.0);
    }
  };

  // RecipeCostPanel states
  const [savedFlash, setSavedFlash] = useState(false);
  const [wastePct, setWastePct] = useState(0);
  const [portions, setPortions] = useState(1);

  const handleSaveCost = async () => {
    await handleSaveVersion();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const handleCostFactorsChangeLocal = (
    newWastePct: number,
    newPortions: number,
  ) => {
    setWastePct(newWastePct);
    setPortions(newPortions);
    handleCostFactorsChange(newWastePct, newPortions);
  };

  // WastageEntryModal / Form states
  const [wastageSearchQuery, setWastageSearchQuery] = useState("");
  const [wastageItems, setWastageItems] = useState<InventoryItem[]>([]);
  const [wastageSelectedItem, setWastageSelectedItem] =
    useState<InventoryItem | null>(null);
  const [wastageAmount, setWastageAmount] = useState("");
  const [wastageUnit, setWastageUnit] = useState("g");
  const [wastageReason, setWastageReason] = useState<WastageReason>("TRIM");
  const [wastageSubmitting, setWastageSubmitting] = useState(false);

  useEffect(() => {
    if (
      !wastageSearchQuery ||
      wastageSelectedItem?.name === wastageSearchQuery
    ) {
      setWastageItems([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results = await handleSearchItems(wastageSearchQuery);
        setWastageItems(results.slice(0, 8));
      } catch (err) {
        console.error("Search failed", err);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [wastageSearchQuery, wastageSelectedItem, handleSearchItems]);

  const handleWastageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(wastageAmount);
    if (!wastageSelectedItem || isNaN(num) || num <= 0) return;
    setWastageSubmitting(true);
    try {
      const success = await handleSubmitWastage({
        itemId: wastageSelectedItem.id,
        amountG: num * (UNIT_TO_G[wastageUnit] || 1),
        reason: wastageReason,
      });
      if (success) {
        setIsWastageOpen(false);
        setWastageAmount("");
        setWastageSelectedItem(null);
        setWastageSearchQuery("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWastageSubmitting(false);
    }
  };

  return (
    <RecipeViewerView
      {...props}
      recipe={recipe}
      vessels={vessels}
      masterIngredients={liveIngredients}
      costData={internalCostData}
      nutritionData={nutritionData}
      versionHistory={versionHistory}
      scaledIngredients={scaledIngredients}
      finalMultiplier={finalMultiplier}
      backHref={backHref}
      onIngredientWeightChange={handleIngredientWeightChange}
      onBakersPercentageChange={handleBakersPercentageChange}
      onRestoreVersion={handleRestoreVersion}
      onDownloadLabel={handleDownloadLabel}
      bakersSummary={bakersSummary}
      isWastageOpen={isWastageOpen}
      setIsWastageOpen={setIsWastageOpen}
      isHistoryOpen={isHistoryOpen}
      setIsHistoryOpen={setIsHistoryOpen}
      isBakersMode={isBakersMode}
      setIsBakersMode={setIsBakersMode}
      scaleMode={scaleMode}
      setScaleMode={setScaleMode}
      targetYield={targetYield}
      setTargetYield={setTargetYield}
      targetWeight={targetWeight}
      handleWeightChange={handleWeightChange}
      targetBakersFlour={targetBakersFlour}
      handleBakersFlourChange={handleBakersFlourChange}
      selectedVesselId={selectedVesselId}
      setSelectedVesselId={setSelectedVesselId}
      savedFlash={savedFlash}
      handleSaveCost={handleSaveCost}
      wastePct={wastePct}
      portions={portions}
      handleCostFactorsChange={handleCostFactorsChangeLocal}
      wastageSearchQuery={wastageSearchQuery}
      setWastageSearchQuery={setWastageSearchQuery}
      wastageItems={wastageItems}
      setWastageItems={setWastageItems}
      wastageSelectedItem={wastageSelectedItem}
      setWastageSelectedItem={setWastageSelectedItem}
      wastageAmount={wastageAmount}
      setWastageAmount={setWastageAmount}
      wastageUnit={wastageUnit}
      setWastageUnit={setWastageUnit}
      wastageReason={wastageReason}
      setWastageReason={setWastageReason}
      wastageSubmitting={wastageSubmitting}
      handleWastageSubmit={handleWastageSubmit}
    />
  );
}

export { RecipeViewer as RecipeViewerContainer };
