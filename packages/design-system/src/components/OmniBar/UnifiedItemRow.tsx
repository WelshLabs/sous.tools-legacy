/* eslint-disable max-lines */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Check,
  Pencil,
  AlertTriangle,
  FlaskConical,
  Loader2,
  X,
  Plus,
} from "lucide-react";
import { api, graphqlClient } from "@soustools/api-client";
import { type UnifiedLineItem } from "./UnifiedReviewPanel";

const CREATE_ITEM_MUTATION = `
  mutation CreateItem($input: CreateItemInputGQL!) {
    createItem(input: $input) {
      id
      organization_id
      name
      category
      purchase_unit
    }
  }
`;

export interface UnifiedItemRowProps {
  item: UnifiedLineItem;
  index: number;
  disabled?: boolean;
  masterIngredients: Array<{ id: string; name: string }>;
  onConfirmAlias?: (rawString: string, masterId: string) => void;
  onUpdateItem?: (index: number, updates: Partial<UnifiedLineItem>) => void;
  onItemCreated?: (newItem: { id: string; name: string }) => void;
  isHovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
}

// ── ConfidenceBadge ────────────────────────────────────────────────────────

function ConfidenceBadge({
  name,
  similarity,
  matchColor,
}: {
  name: string;
  similarity: number;
  matchColor: "green" | "yellow" | "orange";
}) {
  const colors = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    yellow: "bg-amber-500/15   text-amber-400   border-amber-500/30",
    orange: "bg-orange-500/15  text-orange-400  border-orange-500/30",
  }[matchColor];
  const dot = {
    green: "bg-emerald-400",
    yellow: "bg-amber-400",
    orange: "bg-orange-400",
  }[matchColor];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors}`}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
      <span className="max-w-[160px] truncate">{name}</span>
      <span className="font-mono text-[10px] opacity-70">
        {Math.round(similarity * 100)}%
      </span>
    </span>
  );
}

// ── UsdaBadge ──────────────────────────────────────────────────────────────

function UsdaBadge({ name, fdcId }: { name: string; fdcId: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
      <FlaskConical className="h-3 w-3 flex-shrink-0" />
      <span className="max-w-[160px] truncate">{name}</span>
      <span className="font-mono text-[10px] opacity-60">#{fdcId}</span>
    </span>
  );
}

// ── InlineDropdown — appears below the inline edit input ──────────────────

function InlineDropdown({
  suggestions,
  filteredItems,
  search,
  currentItemId,
  onSelectItem,
  onCreateItem,
}: {
  suggestions: UnifiedLineItem["suggestions"];
  filteredItems: Array<{ id: string; name: string }>;
  search: string;
  currentItemId: string | null;
  onSelectItem: (id: string, conf: number) => void;
  onCreateItem: (name: string) => void;
}) {
  const getMatchColors = (c: string) =>
    c === "green"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : c === "yellow"
        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
        : "bg-orange-500/10 text-orange-400 border-orange-500/20";

  const hasSuggestions = !!suggestions?.length && !search;
  const hasFiltered = filteredItems.length > 0;
  const canCreate =
    !!search.trim() &&
    !filteredItems.some(
      (o) => o.name.toLowerCase() === search.trim().toLowerCase(),
    );

  if (!hasSuggestions && !hasFiltered && !canCreate) return null;

  return (
    <div className="absolute top-full left-0 z-50 mt-1.5 flex max-h-52 w-full max-w-xs min-w-[220px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {hasSuggestions && (
          <div className="mb-1 border-b border-zinc-900 pb-1">
            <div className="px-3 py-1 font-mono text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
              AI Suggestions
            </div>
            {suggestions!.map((sug) => (
              <button
                key={sug.itemId}
                type="button"
                onClick={() => onSelectItem(sug.itemId, sug.similarity)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-cyan-500/10"
              >
                <span className="truncate font-medium text-zinc-200">
                  {sug.name}
                </span>
                <span
                  className={`flex-shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${getMatchColors(sug.matchColor)}`}
                >
                  {Math.round(sug.similarity * 100)}%
                </span>
              </button>
            ))}
          </div>
        )}

        {hasFiltered && (
          <>
            <div className="px-3 py-1 font-mono text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
              {hasSuggestions ? "Other Items" : "Items"}
            </div>
            {filteredItems.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectItem(opt.id, 1.0)}
                className={`flex w-full items-center px-3 py-1.5 text-left hover:bg-cyan-500/10 ${
                  opt.id === currentItemId
                    ? "font-semibold text-emerald-400"
                    : "text-zinc-300"
                }`}
              >
                <span className="truncate">{opt.name}</span>
              </button>
            ))}
          </>
        )}

        {canCreate && (
          <button
            type="button"
            onClick={() => onCreateItem(search.trim())}
            className="flex w-full items-center gap-1.5 border-t border-zinc-900 px-3 py-2 text-left font-semibold text-cyan-400 hover:bg-cyan-500/10"
          >
            <Plus className="h-3 w-3" />
            Create &ldquo;{search.trim()}&rdquo;
          </button>
        )}
      </div>
    </div>
  );
}

// ── UnifiedItemRow ─────────────────────────────────────────────────────────

/** Click-to-edit inline field: shows static text by default, swaps to an input on click */
function EditableField({
  label,
  value,
  onCommit,
  disabled,
  type = "text",
}: {
  label: string;
  value: string | number;
  onCommit: (v: string) => void;
  disabled?: boolean;
  type?: "text" | "number";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const open = () => {
    if (disabled) return;
    setDraft(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const commit = () => {
    setEditing(false);
    if (draft !== String(value)) onCommit(draft);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="font-mono text-[10px] text-zinc-500">{label}:</span>
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-16 rounded border border-cyan-500/40 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-white outline-none focus:border-cyan-500"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      title={disabled ? undefined : `Click to edit ${label}`}
      className={`inline-flex items-center gap-1 group ${disabled ? "cursor-default" : "cursor-text"}`}
    >
      <span className="font-mono text-[10px] text-zinc-500">{label}:</span>
      <span className={`font-mono text-[11px] text-zinc-300 ${!disabled ? "group-hover:underline group-hover:decoration-dotted group-hover:text-zinc-100" : ""}`}>
        {value}
      </span>
    </button>
  );
}

export function UnifiedItemRow({
  item,
  index,
  disabled = false,
  masterIngredients,
  onConfirmAlias,
  onUpdateItem,
  onItemCreated,
  isHovered = false,
  onHoverChange,
}: UnifiedItemRowProps) {
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLinkingUsda, setIsLinkingUsda] = useState(false);
  const [localItems, setLocalItems] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pre-fetch tenant items for the inline override dropdown
  useEffect(() => {
    const fetchLocalItems = async () => {
      try {
        const { data, error } = await api.GET("/items", {
          params: { query: { search: "" } },
        });
        if (!error && data?.data) {
          setLocalItems(data.data as Array<{ id: string; name: string }>);
        }
      } catch (err) {
        console.error("Failed to load local items in UnifiedItemRow", err);
      }
    };
    fetchLocalItems();
  }, []);

  const mergedIngredients = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    masterIngredients.forEach((i) => map.set(i.id, i));
    localItems.forEach((i) => map.set(i.id, i));
    return Array.from(map.values());
  }, [masterIngredients, localItems]);

  const currentSelected = mergedIngredients.find((o) => o.id === item.itemId);
  const selectedSuggestion = item.suggestions?.find(
    (s) => s.itemId === item.itemId,
  );

  // Open the inline override editor, pre-filling the input with the best available name
  const openOverride = (prefill?: string) => {
    const initial =
      prefill !== undefined
        ? prefill
        : (currentSelected?.name ?? item.suggestedInternalName ?? "");
    setSearch(initial);
    setIsOverrideOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const closeOverride = () => {
    setIsOverrideOpen(false);
    setSearch("");
  };

  // Auto-select top suggestion if confidence ≥ 0.90 and nothing is mapped yet
  useEffect(() => {
    if (
      !item.itemId &&
      !item.isNonInventoryExpense &&
      item.suggestions?.length
    ) {
      const top = item.suggestions[0];
      if (top.similarity >= 0.9) {
        onUpdateItem?.(index, {
          itemId: top.itemId,
          confidence: top.similarity,
        });
      }
    }
  }, [
    item.itemId,
    item.isNonInventoryExpense,
    item.suggestions,
    index,
    onUpdateItem,
  ]);

  // Close inline edit on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeOverride();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = mergedIngredients.filter(
    (opt) =>
      opt.name.toLowerCase().includes(search.toLowerCase()) &&
      !item.suggestions?.some((s) => s.itemId === opt.id),
  );

  // Selecting a tenant item — persists alias to vendor_item_aliases
  const selectItem = (id: string, conf: number) => {
    onUpdateItem?.(index, { itemId: id, confidence: conf });
    onConfirmAlias?.(item.rawName, id); // → POST /ingestion/alias
    closeOverride();
  };

  // Creating a new tenant item from scratch
  const handleCreate = async (name: string) => {
    setIsCreating(true);
    try {
      const res = await graphqlClient.request<{ createItem: any }>(
        CREATE_ITEM_MUTATION,
        {
          input: {
            name,
            category: item.category || "INGREDIENT",
            purchase_unit: item.unit || "EACH",
            units_per_case: 1,
          },
        },
      );
      if (res.data?.createItem) {
        const created = res.data.createItem as { id: string; name: string };
        onItemCreated?.(created);
        onUpdateItem?.(index, { itemId: created.id, confidence: 1.0 });
        onConfirmAlias?.(item.rawName, created.id); // save alias immediately
        closeOverride();
      }
    } catch (err) {
      console.error("Failed to create item via GraphQL:", err);
    } finally {
      setIsCreating(false);
    }
  };

  // Persisting the user's USDA approval — writes fdc_id onto the tenant item
  const handleApproveUsda = async () => {
    if (!item.itemId || !item.usdaFdcId) return;
    setIsLinkingUsda(true);
    try {
      // @ts-expect-error — endpoint pending next schema regen
      const { error } = await api.POST("/ingestion/link-usda", {
        body: { itemId: item.itemId, fdcId: item.usdaFdcId },
      });
      if (error) throw new Error("Failed to persist USDA link");
      onUpdateItem?.(index, { needsUsdaVerification: false });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLinkingUsda(false);
    }
  };

  // ── Derived display state ──────────────────────────────────────────────

  const isExpense = !!item.isNonInventoryExpense;
  const hasTenantMapping = !!item.itemId && !isExpense;
  const hasUsdaLink = !!item.usdaFdcId && !!item.usdaName;
  const needsUsdaStep = hasTenantMapping && item.needsUsdaVerification;
  const noHighConf = !item.suggestions?.some((s) => s.similarity >= 0.9);
  const isComplete =
    isExpense || (hasTenantMapping && (!needsUsdaStep || !item.usdaFdcId));

  // Candidate chips: show top 1 inline, rest behind "expand" toggle
  const allCandidates = item.suggestions ?? [];
  const primaryCandidate = allCandidates[0];
  const extraCandidates = allCandidates.slice(1);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition-all duration-150 ${
        isHovered
          ? "border-cyan-500/40 bg-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
          : "border-white/10 bg-white/5 dark:border-zinc-800/80 dark:bg-black/20"
      }`}
    >
      {/* ── Raw name + completion indicator ── */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-foreground text-sm leading-snug font-semibold">
          {item.rawName}
        </span>
        {isComplete && (
          <span className="mt-0.5 flex flex-shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1 text-emerald-500">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* ── AI Suggestion label ── */}
      {item.suggestedInternalName && (
        <span className="text-[11px] text-zinc-500 italic dark:text-zinc-400">
          AI Suggestion:{" "}
          <strong className="font-medium text-cyan-400/80 not-italic">
            &ldquo;{item.suggestedInternalName}&rdquo;
          </strong>
          {item.category && (
            <span className="ml-1 text-zinc-600 not-italic">
              ({item.category})
            </span>
          )}
        </span>
      )}

      {/* ── Click-to-edit quantity / unit / price row ── */}
      <div className="flex flex-wrap items-center gap-3">
        {item.amount != null && (
          <EditableField
            label="qty"
            value={item.amount}
            type="number"
            disabled={disabled}
            onCommit={(v) => onUpdateItem?.(index, { amount: Number(v) })}
          />
        )}
        {item.unit && (
          <EditableField
            label="unit"
            value={item.unit}
            disabled={disabled}
            onCommit={(v) => onUpdateItem?.(index, { unit: v })}
          />
        )}
        {item.price != null && (
          <EditableField
            label="price"
            value={`$${Number(item.price).toFixed(2)}`}
            disabled={disabled}
            onCommit={(v) =>
              onUpdateItem?.(index, {
                price: parseFloat(v.replace(/^\$/, "")) || item.price,
              })
            }
          />
        )}
      </div>

      {/* ── Mapping chain ── */}
      {!isExpense ? (
        <div className="flex flex-col gap-1.5">
          {/* Step 1 — Tenant mapping row */}
          <div
            ref={containerRef}
            className="relative flex flex-wrap items-center gap-2"
          >
            <span className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
              →
            </span>

            {isOverrideOpen ? (
              /* ── Inline edit mode: badge swaps to an input ── */
              <div className="relative flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeOverride();
                    if (e.key === "Enter" && filtered[0]) {
                      selectItem(filtered[0].id, 1.0);
                    }
                  }}
                  placeholder={
                    item.suggestedInternalName
                      ? `e.g. "${item.suggestedInternalName}"`
                      : "Search or type a name…"
                  }
                  className="min-w-0 flex-1 rounded-full border border-cyan-500/40 bg-zinc-900 px-3 py-1 text-xs text-white transition-colors outline-none placeholder:text-zinc-600 focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={closeOverride}
                  className="flex-shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
                  title="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                {/* Inline autocomplete dropdown */}
                <InlineDropdown
                  search={search}
                  suggestions={item.suggestions}
                  filteredItems={filtered}
                  currentItemId={item.itemId ?? null}
                  onSelectItem={selectItem}
                  onCreateItem={handleCreate}
                />
              </div>
            ) : (
              /* ── Normal view: badge + pencil override button ── */
              <>
                {hasTenantMapping ? (
                  selectedSuggestion ? (
                    <ConfidenceBadge
                      name={currentSelected?.name ?? selectedSuggestion.name}
                      similarity={selectedSuggestion.similarity}
                      matchColor={selectedSuggestion.matchColor}
                    />
                  ) : (
                    <ConfidenceBadge
                      name={currentSelected?.name ?? "Mapped"}
                      similarity={item.confidence ?? 1}
                      matchColor="green"
                    />
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    Unmapped
                  </span>
                )}

                {!disabled && (
                  <button
                    type="button"
                    onClick={() => openOverride()}
                    className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                    title="Override mapping"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                    override
                  </button>
                )}

                {/* ── Collapsed candidate chips — top 1 shown, rest behind toggle ── */}
                {!hasTenantMapping && allCandidates.length > 0 && (
                  <div className="mt-0.5 flex w-full flex-wrap items-center gap-1.5">
                    {primaryCandidate && (
                      <button
                        type="button"
                        onClick={() =>
                          selectItem(
                            primaryCandidate.itemId,
                            primaryCandidate.similarity,
                          )
                        }
                        disabled={disabled}
                        className="transition-opacity hover:opacity-80 disabled:cursor-not-allowed"
                        title="Accept this suggestion"
                      >
                        <ConfidenceBadge
                          name={primaryCandidate.name}
                          similarity={primaryCandidate.similarity}
                          matchColor={primaryCandidate.matchColor}
                        />
                      </button>
                    )}

                    {extraCandidates.length > 0 && (
                      <>
                        {showAllCandidates &&
                          extraCandidates.map((c) => (
                            <button
                              key={c.itemId}
                              type="button"
                              onClick={() => selectItem(c.itemId, c.similarity)}
                              disabled={disabled}
                              className="transition-opacity hover:opacity-80 disabled:cursor-not-allowed"
                              title="Accept this suggestion"
                            >
                              <ConfidenceBadge
                                name={c.name}
                                similarity={c.similarity}
                                matchColor={c.matchColor}
                              />
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => setShowAllCandidates((v) => !v)}
                          className="rounded-full border border-zinc-700 bg-zinc-900/40 px-2 py-0.5 font-mono text-[9px] text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
                        >
                          {showAllCandidates
                            ? "▲ less"
                            : `+${extraCandidates.length} more`}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Step 2 — USDA Double Match */}
          {needsUsdaStep && (
            <div className="flex flex-wrap items-center gap-2 pl-4">
              <span className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
                →
              </span>

              {hasUsdaLink ? (
                <>
                  <UsdaBadge name={item.usdaName!} fdcId={item.usdaFdcId!} />
                  {!disabled && (
                    <button
                      type="button"
                      onClick={handleApproveUsda}
                      disabled={isLinkingUsda}
                      className="flex items-center gap-1 rounded-full border border-emerald-700 bg-emerald-950/40 px-2.5 py-0.5 text-[10px] text-emerald-400 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50"
                    >
                      {isLinkingUsda ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Check className="h-2.5 w-2.5" />
                      )}
                      {isLinkingUsda ? "Saving…" : "Approve USDA"}
                    </button>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-500 italic">
                  <FlaskConical className="h-3 w-3" />
                  Searching USDA…
                </span>
              )}
            </div>
          )}

          {/* Create New fallback */}
          {!hasTenantMapping && !isOverrideOpen && noHighConf && (
            <div className="mt-0.5 pl-5">
              <button
                type="button"
                disabled={disabled || isCreating}
                onClick={() =>
                  openOverride(item.suggestedInternalName || "")
                }
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Create &ldquo;{item.suggestedInternalName || item.rawName}
                &rdquo;
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Expense bypass indicator */
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 italic">
          <Check className="h-3 w-3 text-zinc-600" />
          Non-inventory expense — bypassed
        </div>
      )}
    </div>
  );
}
