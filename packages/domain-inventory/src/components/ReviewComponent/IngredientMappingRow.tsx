/* eslint-disable max-lines */
"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { graphqlClient } from "@soustools/api-client";
import { Search, Plus, Loader2, X, ChevronDown, Check } from "lucide-react";

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

const SEARCH_USDA_QUERY = `
  query SearchUSDA($query: String!) {
    usdaSearch(query: $query)
  }
`;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TenantMatch {
  id: string;
  name: string;
}

export interface UsdaMatch {
  fdcId: number;
  description: string;
  score?: number;
}

export interface IngredientMappingRowProps {
  /** Raw name from the document */
  rawName: string;
  /** AI-guessed canonical name */
  guessName?: string;
  quantity?: number;
  unit?: string;
  tenantMatches: TenantMatch[];
  usdaMatches: UsdaMatch[];
  selectedTenantId?: string;
  selectedUsdaId?: number;
  onMappingChange: (tenantId: string, usdaId?: number) => void;
  onQuantityChange?: (qty: number) => void;
  onUnitChange?: (unit: string) => void;
  /** Optional extra info in the right gutter (e.g. price for invoices) */
  metaRight?: React.ReactNode;
}

// ── Ingredient Combobox ───────────────────────────────────────────────────────

interface IngredientComboboxProps {
  matches: TenantMatch[];
  value: string;
  guessName?: string;
  onChange: (id: string) => void;
  onCreateNew: (name: string) => Promise<void>;
}

const SEARCH_ITEMS_QUERY = `
  query SearchItems($search: String) {
    items(search: $search) {
      id
      name
    }
  }
`;

function IngredientCombobox({
  matches,
  value,
  guessName,
  onChange,
  onCreateNew,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dbMatches, setDbMatches] = useState<TenantMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine initial matches with database matches, deduplicating by ID
  const allMatches = useMemo<TenantMatch[]>(() => {
    const map = new Map<string, TenantMatch>();
    (matches || []).forEach((m) => {
      if (m && m.id) map.set(m.id, m);
    });
    (dbMatches || []).forEach((m) => {
      if (m && m.id) map.set(m.id, m);
    });
    return Array.from(map.values());
  }, [matches, dbMatches]);

  const selectedName = (allMatches || []).find(
    (m) => m && m.id === value,
  )?.name;

  const filtered = query.trim()
    ? allMatches.filter((m) =>
        m.name.toLowerCase().includes(query.toLowerCase()),
      )
    : allMatches;

  useEffect(() => {
    if (!open) return;
    let isCancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await graphqlClient.request<{ items: any[] }>(
          SEARCH_ITEMS_QUERY,
          { search: query.trim() || undefined },
        );
        if (!isCancelled && res.data?.items) {
          setDbMatches(
            res.data.items.map((i: any) => ({
              id: i.id,
              name: i.name,
            })),
          );
        }
      } catch (err) {
        console.error("Failed to query items:", err);
      } finally {
        if (!isCancelled) setSearching(false);
      }
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const handleCreate = async (customName?: string) => {
    const name = (customName || query).trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreateNew(name);
      setOpen(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 text-left text-xs transition hover:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none"
      >
        <span
          className={`truncate ${selectedName ? "font-medium text-zinc-100" : "text-zinc-500 italic"}`}
        >
          {selectedName ??
            (guessName ? `Suggested: ${guessName}` : "Select ingredient")}
        </span>
        <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full max-w-sm min-w-[240px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/80 backdrop-blur-xl">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered.length === 0) handleCreate();
              }}
              placeholder="Search or type to create…"
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
              </button>
            )}
          </div>

          {/* AI suggestion chip */}
          {guessName && !value && (
            <div className="border-b border-zinc-800 bg-zinc-950/40 px-3 py-2">
              <span className="text-[10px] font-semibold tracking-wider text-cyan-400 uppercase">
                AI Suggestion
              </span>
              <button
                type="button"
                onClick={() => {
                  const match = (matches || []).find(
                    (m) =>
                      m &&
                      m.name &&
                      m.name.toLowerCase() === guessName.toLowerCase(),
                  );
                  if (match) {
                    handleSelect(match.id);
                  } else {
                    handleCreate(guessName);
                  }
                }}
                className="mt-1 flex w-full items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-left text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  <span className="truncate">{guessName}</span>
                </div>
                <span className="font-mono text-[10px] text-cyan-400">
                  Select / Create
                </span>
              </button>
            </div>
          )}

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            {filtered.map((m) => (
              <li key={m.id} role="option" aria-selected={m.id === value}>
                <button
                  type="button"
                  onClick={() => handleSelect(m.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-zinc-800 ${
                    m.id === value
                      ? "bg-zinc-800/80 font-medium text-white"
                      : "text-zinc-300"
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  {m.id === value && (
                    <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  )}
                </button>
              </li>
            ))}

            {searching && (
              <li className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-zinc-400">
                <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                <span>Searching items...</span>
              </li>
            )}

            {filtered.length === 0 && !searching && (
              <li className="px-3 py-3 text-center text-xs text-zinc-500 italic">
                {query.trim() ? "No matching ingredients in database" : "No ingredients available"}
              </li>
            )}

            {/* Create new */}
            {query.trim() && (
              <li className="border-t border-zinc-800 p-1">
                <button
                  type="button"
                  onClick={() => handleCreate()}
                  disabled={creating}
                  className="flex w-full items-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-2 text-left text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  )}
                  <span className="truncate">
                    Create ingredient &ldquo;{query.trim()}&rdquo;
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Combined USDA Combobox (Optional) ─────────────────────────────────────────

interface UsdaComboboxProps {
  matches: UsdaMatch[];
  value?: number;
  initialQuery?: string;
  onChange: (fdcId?: number) => void;
  onMatchesUpdate: (matches: UsdaMatch[]) => void;
}

function UsdaCombobox({
  matches,
  value,
  initialQuery = "",
  onChange,
  onMatchesUpdate,
}: UsdaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [localMatches, setLocalMatches] = useState<UsdaMatch[]>(
    () => matches || [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalMatches(matches || []);
  }, [matches]);

  const selectedMatch = (localMatches || []).find((m) => m && m.fdcId === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback(
    async (searchQuery?: string) => {
      const q =
        (searchQuery !== undefined ? searchQuery : query).trim() ||
        initialQuery;
      if (!q) return;
      setSearching(true);
      try {
        const res = await graphqlClient.request<{ usdaSearch: any }>(
          SEARCH_USDA_QUERY,
          { query: q },
        );
        let results: UsdaMatch[] = [];
        if (Array.isArray(res.data?.usdaSearch)) {
          results = res.data.usdaSearch.map((item: any) => ({
            fdcId: Number(item.fdcId || item.fdc_id || 0),
            description: String(
              item.description || item.fdc_food_name || q,
            ),
            score: typeof item.score === "number" ? item.score : undefined,
          }));
        } else if (res.data?.usdaSearch) {
          const single = res.data.usdaSearch;
          results = [
            {
              fdcId: Number(single.fdcId || single.fdc_id || 0),
              description: String(
                single.description || single.fdc_food_name || q,
              ),
            },
          ];
        }

        if (results.length > 0) {
          setLocalMatches(results);
          onMatchesUpdate(results);
        }
      } catch (err) {
        console.warn("USDA search error:", err);
      } finally {
        setSearching(false);
      }
    },
    [query, initialQuery, onMatchesUpdate],
  );

  const handleOpen = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (fdcId?: number) => {
    onChange(fdcId);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-1">
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleOpen();
            }
          }}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 text-left text-xs transition hover:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none"
        >
          <span
            className={`truncate ${selectedMatch ? "font-medium text-emerald-300" : "text-zinc-500 italic"}`}
          >
            {selectedMatch
              ? selectedMatch.description
              : "Select USDA (optional)"}
          </span>
          <div className="ml-1 flex shrink-0 items-center gap-1">
            {selectedMatch && (
              <button
                type="button"
                aria-label="Clear USDA selection"
                onClick={handleClear}
                className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </div>
        </div>
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full max-w-sm min-w-[240px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/80 backdrop-blur-xl">
          {/* Search input bar */}
          <div className="flex items-center gap-1.5 border-b border-zinc-800 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") handleSearch();
              }}
              placeholder={`Search USDA (e.g. "${initialQuery}")`}
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSearch()}
              disabled={searching}
              className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              {searching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Search"
              )}
            </button>
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            {/* Optional None selection */}
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                onClick={() => handleSelect(undefined)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-zinc-800 ${
                  !value
                    ? "bg-zinc-800/40 font-medium text-zinc-200"
                    : "text-zinc-400 italic"
                }`}
              >
                <span>None (Skip USDA link)</span>
                {!value && (
                  <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                )}
              </button>
            </li>

            {localMatches.map((u) => (
              <li key={u.fdcId} role="option" aria-selected={u.fdcId === value}>
                <button
                  type="button"
                  onClick={() => handleSelect(u.fdcId)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-zinc-800 ${
                    u.fdcId === value
                      ? "bg-zinc-800/80 font-medium text-emerald-300"
                      : "text-zinc-300"
                  }`}
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="truncate">{u.description}</span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      FDC: {u.fdcId}
                    </span>
                  </div>
                  {u.fdcId === value && (
                    <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main Row Component ────────────────────────────────────────────────────────

export function IngredientMappingRow({
  rawName,
  guessName,
  quantity,
  unit,
  tenantMatches,
  usdaMatches,
  selectedTenantId,
  selectedUsdaId,
  onMappingChange,
  onQuantityChange,
  onUnitChange,
  metaRight,
}: IngredientMappingRowProps) {
  const [localTenantMatches, setLocalTenantMatches] =
    useState<TenantMatch[]>(tenantMatches);
  const [currentUsdaMatches, setCurrentUsdaMatches] =
    useState<UsdaMatch[]>(usdaMatches);
  const [currentTenantId, setCurrentTenantId] = useState(
    selectedTenantId ?? "",
  );
  const [currentUsdaId, setCurrentUsdaId] = useState<number | undefined>(
    selectedUsdaId,
  );

  useEffect(() => {
    setLocalTenantMatches(tenantMatches);
  }, [tenantMatches]);

  useEffect(() => {
    setCurrentTenantId(selectedTenantId ?? "");
  }, [selectedTenantId]);

  useEffect(() => {
    setCurrentUsdaId(selectedUsdaId);
  }, [selectedUsdaId]);

  const handleTenantChange = (id: string) => {
    setCurrentTenantId(id);
    onMappingChange(id, currentUsdaId);
  };

  const handleUsdaChange = (fdcId?: number) => {
    setCurrentUsdaId(fdcId);
    onMappingChange(currentTenantId, fdcId);
  };

  const handleCreateIngredient = async (name: string) => {
    try {
      const res = await graphqlClient.request<{ createItem: any }>(
        CREATE_ITEM_MUTATION,
        { input: { name } },
      );
      const createdItem = res.data?.createItem;
      if (createdItem && createdItem.id) {
        const newItem: TenantMatch = {
          id: createdItem.id,
          name: createdItem.name || name,
        };
        setLocalTenantMatches((prev) => [...prev, newItem]);
        handleTenantChange(createdItem.id);
      }
    } catch (err) {
      console.error("Failed to create new item via GraphQL:", err);
      const fallbackId = `custom-${Date.now()}`;
      const newItem: TenantMatch = { id: fallbackId, name };
      setLocalTenantMatches((prev) => [...prev, newItem]);
      handleTenantChange(fallbackId);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 py-3">
      {/* ── Top row: Raw name + Editable Amount & Unit ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="max-w-[55%] min-w-0 truncate text-sm font-semibold text-zinc-100">
          {rawName}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          {metaRight}

          {onQuantityChange && (
            <input
              type="number"
              step="any"
              value={quantity ?? 1}
              onChange={(e) => onQuantityChange(Number(e.target.value) || 0)}
              aria-label={`Quantity for ${rawName}`}
              className="w-16 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-right text-xs font-medium text-zinc-100 transition outline-none focus:border-zinc-600"
            />
          )}

          {onUnitChange && (
            <input
              type="text"
              value={unit ?? "EACH"}
              onChange={(e) => onUnitChange(e.target.value)}
              aria-label={`Unit for ${rawName}`}
              placeholder="unit"
              className="w-20 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs font-medium text-zinc-100 transition outline-none focus:border-zinc-600"
            />
          )}

          {!onQuantityChange && !onUnitChange && (quantity || unit) && (
            <span className="font-mono text-xs text-zinc-400 tabular-nums">
              {quantity} {unit}
            </span>
          )}
        </div>
      </div>

      {/* ── Bottom row: Mapping controls in responsive grid ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            Master Ingredient
          </label>
          <IngredientCombobox
            matches={localTenantMatches}
            value={currentTenantId}
            guessName={guessName}
            onChange={handleTenantChange}
            onCreateNew={handleCreateIngredient}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            USDA Nutrition (Optional)
          </label>
          <UsdaCombobox
            matches={currentUsdaMatches}
            value={currentUsdaId}
            initialQuery={guessName || rawName}
            onChange={handleUsdaChange}
            onMatchesUpdate={setCurrentUsdaMatches}
          />
        </div>
      </div>
    </div>
  );
}
