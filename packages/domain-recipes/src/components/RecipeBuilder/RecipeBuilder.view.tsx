"use client";

/* eslint-disable max-lines */

import React, { useMemo, useState } from "react";
import { Button } from "@soustools/design-system";
import {
  ChefHat,
  ArrowLeft,
  Plus,
  Trash2,
  Clock,
  Percent,
  Check,
  ChevronDown,
  Search,
} from "lucide-react";
import Link from "next/link";
import {
  type VesselProfile,
  type MasterIngredient,
} from "@soustools/api-types";
import {
  type RecipeIngredientLine,
  type RecipeInstructionStep,
} from "../../types";
import { formatIngredientAmountWithEstimate } from "../../utils/culinary-encyclopedia";

export interface RecipeBuilderViewProps {
  title: string;
  setTitle: (val: string) => void;
  yieldCount: number;
  setYieldCount: (val: number) => void;
  yieldUnit: string;
  setYieldUnit: (val: string) => void;
  vesselId: string;
  setVesselId: (val: string) => void;
  status: string;
  setStatus: (val: string) => void;
  isBakersPercentage: boolean;
  setIsBakersPercentage: (val: boolean) => void;
  ingredients: RecipeIngredientLine[];
  onAddIngredientLine: () => void;
  onRemoveIngredientLine: (idx: number) => void;
  onUpdateIngredientLine: (
    idx: number,
    fields: Partial<RecipeIngredientLine>,
  ) => void;
  steps: RecipeInstructionStep[];
  onAddInstructionStep: () => void;
  onRemoveInstructionStep: (idx: number) => void;
  onUpdateInstructionStep: (
    idx: number,
    fields: Partial<RecipeInstructionStep>,
  ) => void;
  vessels: VesselProfile[];
  masterIngredients: MasterIngredient[];
  loading: boolean;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  backHref: string;
  isEditing: boolean;
}

export function RecipeBuilderView({
  title,
  setTitle,
  yieldCount,
  setYieldCount,
  yieldUnit,
  setYieldUnit,
  vesselId,
  setVesselId,
  status,
  setStatus,
  isBakersPercentage,
  setIsBakersPercentage,
  ingredients,
  onAddIngredientLine,
  onRemoveIngredientLine,
  onUpdateIngredientLine,
  steps,
  onAddInstructionStep,
  onRemoveInstructionStep,
  onUpdateInstructionStep,
  vessels,
  masterIngredients,
  loading,
  saving,
  onSubmit,
  backHref,
  isEditing,
}: RecipeBuilderViewProps) {
  // Calculate Baker's metrics in real-time
  const totalFlourWeight = ingredients
    .filter((i) => i.baseCalculationGroup)
    .reduce((acc, i) => acc + (i.amount || 0), 0);

  const totalLiquidWeight = ingredients
    .filter((i) => {
      const mi = masterIngredients.find((m) => m.id === i.masterIngredientId);
      const name = (mi?.name || i.rawName || "").toLowerCase();
      return (
        name.includes("water") ||
        name.includes("milk") ||
        name.includes("juice") ||
        name.includes("liquid")
      );
    })
    .reduce((acc, i) => {
      if (i.calculationType === "bakers_percentage") {
        return acc + totalFlourWeight * ((i.amount || 0) / 100);
      }
      return acc + (i.amount || 0);
    }, 0);

  const hydrationPct =
    totalFlourWeight > 0
      ? ((totalLiquidWeight / totalFlourWeight) * 100).toFixed(1)
      : "0.0";

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-5xl space-y-6 rounded-2xl p-6 shadow-xl"
      style={{
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-border)",
        color: "var(--color-foreground)",
      }}
    >
      <header
        className="flex items-center justify-between pb-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/5"
            style={{ color: "var(--color-muted-foreground)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 hover:text-white" />
          </Link>
          <div>
            <h2
              className="flex items-center gap-2 text-xl font-bold"
              style={{ color: "var(--color-foreground)" }}
            >
              <ChefHat
                className="h-5 w-5"
                style={{ color: "var(--color-primary)" }}
              />{" "}
              {isEditing ? "Edit Recipe" : "Create Recipe"}
            </h2>
            <p
              className="text-xs"
              style={{ color: "var(--color-muted-foreground)" }}
            >
              Configure yields, culinary encyclopedia units, baseline flours,
              and step durations.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={backHref}>
            <button
              type="button"
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                backgroundColor: "var(--color-secondary)",
                color: "var(--color-foreground)",
              }}
            >
              Cancel
            </button>
          </Link>
          <Button type="submit" disabled={saving || loading}>
            {saving ? "Saving..." : "Save Recipe"}
          </Button>
        </div>
      </header>

      <RecipeBuilderFormFields
        title={title}
        setTitle={setTitle}
        yieldCount={yieldCount}
        setYieldCount={setYieldCount}
        yieldUnit={yieldUnit}
        setYieldUnit={setYieldUnit}
        vesselId={vesselId}
        setVesselId={setVesselId}
        status={status}
        setStatus={setStatus}
        isBakersPercentage={isBakersPercentage}
        setIsBakersPercentage={setIsBakersPercentage}
        vessels={vessels}
      />

      {isBakersPercentage && (
        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl p-4 text-xs font-semibold"
          style={{
            backgroundColor: "rgb(76 201 240 / 0.08)",
            border: "1px solid rgb(76 201 240 / 0.25)",
            color: "var(--color-foreground)",
          }}
        >
          <div className="flex items-center gap-2">
            <Percent
              className="h-4 w-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span>Baker's Formula Overview:</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <span>
              Base Flour:{" "}
              <strong style={{ color: "var(--color-primary)" }}>
                {totalFlourWeight.toFixed(0)}g (100%)
              </strong>
            </span>
            <span>
              Total Hydration:{" "}
              <strong style={{ color: "#10b981" }}>{hydrationPct}%</strong>
            </span>
            <span>
              Mark flour ingredients as <strong>Base Flour</strong> to anchor
              calculations.
            </span>
          </div>
        </div>
      )}

      <RecipeBuilderIngredients
        lines={ingredients}
        onAddLine={onAddIngredientLine}
        onRemoveLine={onRemoveIngredientLine}
        onUpdateLine={onUpdateIngredientLine}
        masterIngredients={masterIngredients}
      />

      <RecipeBuilderInstructions
        steps={steps}
        onAddStep={onAddInstructionStep}
        onRemoveStep={onRemoveInstructionStep}
        onUpdateStep={onUpdateInstructionStep}
      />
    </form>
  );
}

export function RecipeBuilderFormFields({
  title,
  setTitle,
  yieldCount,
  setYieldCount,
  yieldUnit,
  setYieldUnit,
  vesselId,
  setVesselId,
  status,
  setStatus,
  isBakersPercentage,
  setIsBakersPercentage,
  vessels,
}: any) {
  const labelStyle: React.CSSProperties = {
    color: "var(--color-muted-foreground)",
  };
  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--color-input)",
    border: "1px solid var(--color-border)",
    color: "var(--color-foreground)",
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium" style={labelStyle}>
            Recipe Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Traditional Sourdough Bread"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={labelStyle}>
            Default Yield
          </label>
          <input
            type="number"
            step="any"
            min="0.01"
            value={yieldCount}
            onChange={(e) => setYieldCount(parseFloat(e.target.value) || 1)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={labelStyle}>
            Yield Unit
          </label>
          <input
            type="text"
            value={yieldUnit}
            onChange={(e) => setYieldUnit(e.target.value)}
            placeholder="e.g. loaves, portions, cookies"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium" style={labelStyle}>
            Default Vessel Profile (Optional)
          </label>
          <select
            value={vesselId}
            onChange={(e) => setVesselId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          >
            <option value="">None (Standard Yield Scaling only)</option>
            {vessels.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.volumeMl} ml)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium" style={labelStyle}>
            Recipe Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          >
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="APPROVED">Approved</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <div className="flex flex-col justify-end">
          <label
            className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2.5 transition-colors"
            style={{
              backgroundColor: isBakersPercentage
                ? "rgb(76 201 240 / 0.12)"
                : "var(--color-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <input
              type="checkbox"
              checked={isBakersPercentage}
              onChange={(e) => setIsBakersPercentage(e.target.checked)}
              className="h-4 w-4 rounded"
              style={{ accentColor: "var(--color-primary)" }}
            />
            <div>
              <span
                className="text-xs font-bold"
                style={{ color: "var(--color-foreground)" }}
              >
                Uses Baker's Percentages
              </span>
              <p
                className="text-[10px]"
                style={{ color: "var(--color-muted-foreground)" }}
              >
                Calculate hydration &amp; scaling relative to 100% base flour
              </p>
            </div>
          </label>
        </div>
      </div>
    </>
  );
}

export function RecipeBuilderIngredients({
  lines,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  masterIngredients,
}: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4
            className="text-sm font-bold"
            style={{ color: "var(--color-foreground)" }}
          >
            Recipe Ingredients
          </h4>
          <p
            className="text-[11px]"
            style={{ color: "var(--color-muted-foreground)" }}
          >
            Specify ingredient amounts, piece count units (e.g. ea, clove,
            lemon), and Baker's % formulas.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddLine}
          className="flex cursor-pointer items-center gap-1 text-xs font-bold transition-colors"
          style={{ color: "var(--color-primary)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Ingredient
        </button>
      </div>

      {lines.length === 0 ? (
        <div
          className="rounded-lg border border-dashed py-6 text-center text-xs"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-muted-foreground)",
          }}
        >
          No ingredients added yet. Click "Add Ingredient" to start.
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map((line: any, idx: number) => (
            <RecipeBuilderIngredientRow
              key={idx}
              line={line}
              idx={idx}
              masterIngredients={masterIngredients}
              handleUpdateLine={onUpdateLine}
              handleRemoveLine={onRemoveLine}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RecipeBuilderIngredientRow({
  line,
  idx,
  masterIngredients,
  handleUpdateLine,
  handleRemoveLine,
}: any) {
  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--color-input)",
    border: "1px solid var(--color-border)",
    color: "var(--color-foreground)",
  };

  const selectedMaster = masterIngredients.find(
    (m: any) => m.id === line.masterIngredientId,
  );
  const ingredientName = selectedMaster?.name || line.rawName || "";

  // Encyclopedia piece estimate calculation for count units
  const estimate = formatIngredientAmountWithEstimate(
    line.amount || 0,
    line.unit || "g",
    ingredientName,
    selectedMaster?.densityGMl,
  );

  return (
    <div
      className="flex flex-col items-start gap-3 rounded-xl p-3.5 shadow-sm transition-all md:flex-row md:items-center"
      style={{
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="w-full flex-1">
        <RecipeIngredientCombobox
          value={line.masterIngredientId || ""}
          rawName={line.rawName}
          ingredients={masterIngredients}
          onChange={(masterIngredientId) =>
            handleUpdateLine(idx, { masterIngredientId })
          }
        />
      </div>

      <div className="flex w-full items-center gap-2 md:w-auto">
        <input
          type="number"
          step="any"
          value={line.amount}
          onChange={(e) =>
            handleUpdateLine(idx, {
              amount: parseFloat(e.target.value) || 0,
            })
          }
          placeholder="Amt"
          className="w-20 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
          style={inputStyle}
          required
        />
        <select
          value={line.unit}
          onChange={(e) => {
            const nextUnit = e.target.value;
            const nextCalcType =
              nextUnit === "%" ? "bakers_percentage" : line.calculationType;
            handleUpdateLine(idx, {
              unit: nextUnit,
              calculationType: nextCalcType,
            });
          }}
          className="w-28 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
          style={inputStyle}
        >
          <optgroup label="Weight">
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="oz">oz</option>
            <option value="lb">lb</option>
          </optgroup>
          <optgroup label="Volume">
            <option value="ml">ml</option>
            <option value="l">l</option>
            <option value="tsp">tsp</option>
            <option value="tbsp">tbsp</option>
            <option value="fl oz">fl oz</option>
            <option value="cup">cup</option>
            <option value="pt">pt</option>
            <option value="qt">qt</option>
            <option value="gal">gal</option>
          </optgroup>
          <optgroup label="Count &amp; Pieces">
            <option value="ea">ea (each)</option>
            <option value="count">count</option>
            <option value="piece">piece</option>
            <option value="clove">clove</option>
            <option value="head">head</option>
            <option value="stalk">stalk</option>
            <option value="slice">slice</option>
            <option value="sprig">sprig</option>
            <option value="bunch">bunch</option>
            <option value="can">can</option>
            <option value="stick">stick</option>
            <option value="pinch">pinch</option>
            <option value="dash">dash</option>
          </optgroup>
          <optgroup label="Formulas">
            <option value="%">% (Baker's %)</option>
          </optgroup>
        </select>

        {estimate.estimateText && (
          <span
            className="hidden text-[11px] font-bold text-amber-400 lg:inline"
            title={estimate.subBreakdown}
          >
            {estimate.estimateText}
          </span>
        )}
      </div>

      <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
        <select
          value={line.calculationType}
          onChange={(e) => {
            const nextType = e.target.value as
              "fixed_weight" | "bakers_percentage";
            const nextUnit =
              nextType === "bakers_percentage" && line.unit !== "%"
                ? "%"
                : line.unit;
            handleUpdateLine(idx, {
              calculationType: nextType,
              unit: nextUnit,
            });
          }}
          className="rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
          style={inputStyle}
        >
          <option value="fixed_weight">Fixed Amount</option>
          <option value="bakers_percentage">Baker's %</option>
        </select>

        <label
          className="flex cursor-pointer items-center gap-1.5 text-xs select-none"
          style={{ color: "var(--color-muted-foreground)" }}
        >
          <input
            type="checkbox"
            checked={line.baseCalculationGroup}
            onChange={(e) =>
              handleUpdateLine(idx, {
                baseCalculationGroup: e.target.checked,
                calculationType: e.target.checked
                  ? "fixed_weight"
                  : line.calculationType,
              })
            }
            className="rounded focus:ring-0 focus:ring-offset-0"
            style={{
              accentColor: "var(--color-primary)",
              backgroundColor: "var(--color-input)",
              borderColor: "var(--color-border)",
            }}
          />
          <span
            className={
              line.baseCalculationGroup ? "font-bold text-amber-400" : ""
            }
          >
            Base Flour
          </span>
        </label>
      </div>

      <input
        type="text"
        value={line.prepNotes}
        onChange={(e) => handleUpdateLine(idx, { prepNotes: e.target.value })}
        placeholder="Prep Notes (e.g. room temp, beaten)"
        className="w-full min-w-[140px] flex-1 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
        style={inputStyle}
      />

      <button
        type="button"
        onClick={() => handleRemoveLine(idx)}
        className="cursor-pointer self-end rounded-lg p-1.5 transition-colors hover:bg-rose-500/20 md:self-auto"
        style={{
          backgroundColor: "rgb(244 63 94 / 0.10)",
          color: "var(--color-destructive)",
        }}
        aria-label="Remove ingredient"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RecipeIngredientCombobox({
  value,
  rawName,
  ingredients,
  onChange,
}: {
  value: string;
  rawName?: string | null;
  ingredients: MasterIngredient[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = ingredients.find((ingredient) => ingredient.id === value);
  const filtered = useMemo(
    () =>
      ingredients.filter((ingredient) =>
        ingredient.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [ingredients, query],
  );

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs focus:outline-none"
        style={{
          backgroundColor: "var(--color-input)",
          border: "1px solid var(--color-border)",
          color: "var(--color-foreground)",
        }}
      >
        <span className={selected ? "font-medium" : "italic opacity-60"}>
          {selected?.name || `Unmapped Item${rawName ? ` (${rawName})` : ""}`}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ingredients..."
              className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Unmapped
              {!value && <Check className="h-3.5 w-3.5" />}
            </button>
            {filtered.map((ingredient) => (
              <button
                type="button"
                key={ingredient.id}
                onClick={() => {
                  onChange(ingredient.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              >
                {ingredient.name}
                {ingredient.id === value && (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecipeBuilderInstructions({
  steps,
  onAddStep,
  onRemoveStep,
  onUpdateStep,
}: any) {
  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--color-input)",
    border: "1px solid var(--color-border)",
    color: "var(--color-foreground)",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4
          className="text-sm font-bold"
          style={{ color: "var(--color-foreground)" }}
        >
          Instructions &amp; Timers
        </h4>
        <button
          type="button"
          onClick={onAddStep}
          className="flex cursor-pointer items-center gap-1 text-xs font-bold transition-colors"
          style={{ color: "var(--color-primary)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Step
        </button>
      </div>

      {steps.length === 0 ? (
        <div
          className="rounded-lg border border-dashed py-4 text-center text-xs"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-muted-foreground)",
          }}
        >
          No instruction steps added yet.
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step: any, idx: number) => {
            const minutesVal = step.timerDurationSeconds
              ? Math.floor(step.timerDurationSeconds / 60)
              : "";
            const secondsVal = step.timerDurationSeconds
              ? step.timerDurationSeconds % 60
              : "";

            const handleTimerChange = (min: string, sec: string) => {
              const m = parseInt(min) || 0;
              const s = parseInt(sec) || 0;
              const totalSec = m * 60 + s;
              onUpdateStep(idx, {
                timerDurationSeconds: totalSec > 0 ? totalSec : null,
              });
            };

            return (
              <div
                key={idx}
                className="flex flex-col items-start gap-3 rounded-xl p-4 md:flex-row"
                style={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-xs font-bold"
                  style={{
                    backgroundColor: "var(--color-secondary)",
                    color: "var(--color-foreground)",
                  }}
                >
                  {step.stepNumber}
                </div>

                <div className="w-full flex-1">
                  <textarea
                    rows={2}
                    value={step.text}
                    onChange={(e) =>
                      onUpdateStep(idx, { text: e.target.value })
                    }
                    placeholder="Describe the instruction details..."
                    className="w-full resize-none rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                    style={inputStyle}
                    required
                  />
                </div>

                <div className="flex w-full flex-col gap-2 md:w-auto">
                  <div className="flex items-center gap-2">
                    <Clock
                      className="h-4 w-4"
                      style={{ color: "var(--color-muted-foreground)" }}
                    />
                    <input
                      type="number"
                      min="0"
                      value={minutesVal}
                      onChange={(e) =>
                        handleTimerChange(e.target.value, secondsVal.toString())
                      }
                      placeholder="Min"
                      className="w-14 rounded-lg px-2 py-1 text-center text-xs focus:outline-none"
                      style={inputStyle}
                    />
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-muted-foreground)" }}
                    >
                      :
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={secondsVal}
                      onChange={(e) =>
                        handleTimerChange(minutesVal.toString(), e.target.value)
                      }
                      placeholder="Sec"
                      className="w-14 rounded-lg px-2 py-1 text-center text-xs focus:outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <span
                    className="text-center text-[10px]"
                    style={{ color: "var(--color-muted-foreground)" }}
                  >
                    (Optional step timer)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveStep(idx)}
                  className="cursor-pointer self-end rounded-lg p-2 transition-colors hover:bg-rose-500/20 md:self-auto"
                  style={{
                    backgroundColor: "rgb(244 63 94 / 0.10)",
                    color: "var(--color-destructive)",
                  }}
                  aria-label="Remove instruction step"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AutoCalculateButton({
  onAutoCalculate,
}: {
  onAutoCalculate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAutoCalculate}
      className="cursor-pointer rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors"
      style={{
        backgroundColor: "var(--color-secondary)",
        borderColor: "var(--color-border)",
        color: "var(--color-primary)",
      }}
    >
      Auto-Calc Volume
    </button>
  );
}
