"use client";

import { ChevronDown, ChevronRight, PanelRight, X } from "lucide-react";

export interface ArtifactColumnContent {
  type: "INGESTION_REVIEW" | "REVENUE_CHART" | "TICKET_TIME_CHART" | "PREP_LIST" | "INGREDIENT_TABLE" | "SEARCH_RESULTS";
  reviewId?: string;
  label?: string;
  initialPayload?: any;
}

export interface ArtifactColumnViewProps {
  content: ArtifactColumnContent | null;
  isOpen: boolean;
  isMobileExpanded: boolean;
  onClose: () => void;
  onToggleMobile: () => void;
  children?: React.ReactNode;
}

export function ArtifactColumnView({
  content,
  isOpen,
  isMobileExpanded,
  onClose,
  onToggleMobile,
  children,
}: ArtifactColumnViewProps) {
  if (!isOpen || !content) return null;

  const labelMap: Record<ArtifactColumnContent["type"], string> = {
    INGESTION_REVIEW: "Ingestion Review",
    REVENUE_CHART: "Revenue Chart",
    TICKET_TIME_CHART: "Ticket Time Chart",
    PREP_LIST: "Prep List",
    INGREDIENT_TABLE: "Inventory Ledger",
    SEARCH_RESULTS: "Search Results",
  };
  const label = content.label ?? labelMap[content.type];

  return (
    <>
      {/* ── Desktop: persistent side panel ── */}
      <aside
        className="border-border bg-card/70 hidden shrink-0 flex-col overflow-hidden border-l backdrop-blur-sm md:flex"
        style={{ width: "42%", minWidth: "360px", maxWidth: "640px" }}
        aria-label="Artifact panel"
      >
        {/* Header */}
        <div className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <PanelRight className="text-muted-foreground h-4 w-4" />
            <span className="text-foreground text-sm font-semibold">{label}</span>
          </div>
          <button
            type="button"
            id="artifact-panel-close-desktop"
            aria-label="Close artifact panel"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>

      {/* ── Mobile: collapsible bottom sheet handle ── */}
      <div className="border-border bg-card fixed right-0 bottom-[72px] left-0 z-[9980] flex flex-col overflow-hidden rounded-t-2xl border-t shadow-2xl md:hidden">
        <button
          type="button"
          id="artifact-panel-toggle-mobile"
          aria-expanded={isMobileExpanded}
          aria-label={isMobileExpanded ? "Collapse artifact panel" : "Expand artifact panel"}
          onClick={onToggleMobile}
          className="border-border flex items-center justify-between border-b px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <PanelRight className="text-muted-foreground h-4 w-4" />
            <span className="text-foreground text-sm font-semibold">{label}</span>
          </div>
          {isMobileExpanded ? (
            <ChevronDown className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronRight className="text-muted-foreground h-4 w-4" />
          )}
        </button>

        {isMobileExpanded && (
          <div className="max-h-[55vh] overflow-y-auto p-4">{children}</div>
        )}
      </div>
    </>
  );
}
