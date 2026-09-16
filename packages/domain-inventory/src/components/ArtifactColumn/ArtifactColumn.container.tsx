"use client";

import { useState } from "react";
import { type OmniMessage } from "@soustools/api-types";
import {
  Card,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Chip,
  RevenueChart,
  TicketTimeChart,
} from "@soustools/design-system";
import {
  CheckSquare,
  Search,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { UniversalReviewComponent } from "../ReviewComponent/UniversalReviewComponent";
import {
  ArtifactColumnView,
  type ArtifactColumnContent,
} from "./ArtifactColumn.view";

export interface ArtifactColumnContainerProps {
  /** Latest render_component directive message from chat history */
  renderDirectiveMessage: OmniMessage | null;
  /** Active polymorphic track-2 type from query intent */
  track2Type: string | null;
  realRevenueData: Array<{ name: string; value: number }>;
  realTicketTimeData: Array<{ time: string; minutes: number }>;
  prepListItems: Array<{ id: string; text: string; done: boolean }>;
  onTogglePrepItem: (id: string) => void;
}

export function ArtifactColumnContainer({
  renderDirectiveMessage,
  track2Type,
  realRevenueData,
  realTicketTimeData,
  prepListItems,
  onTogglePrepItem,
}: ArtifactColumnContainerProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  // Derive content from render directive (highest priority) or track2Type
  let content: ArtifactColumnContent | null = null;

  if (renderDirectiveMessage) {
    try {
      const directive =
        typeof renderDirectiveMessage.content === "string"
          ? JSON.parse(renderDirectiveMessage.content)
          : renderDirectiveMessage.content;
      if (directive?.componentName === "INGESTION_REVIEW") {
        content = {
          type: "INGESTION_REVIEW",
          reviewId: directive.props?.reviewId,
          label: "Ingestion Review",
          initialPayload: directive.props?.initialPayload,
        };
      }
    } catch {
      // no-op
    }
  }

  if (!content && track2Type) {
    content = { type: track2Type as ArtifactColumnContent["type"] };
  }

  // Auto-open when new content arrives
  if (content && !isOpen) {
    setIsOpen(true);
  }

  const handleClose = () => setIsOpen(false);
  const handleToggleMobile = () => setIsMobileExpanded((v) => !v);

  return (
    <ArtifactColumnView
      content={content}
      isOpen={isOpen}
      isMobileExpanded={isMobileExpanded}
      onClose={handleClose}
      onToggleMobile={handleToggleMobile}
    >
      {content?.type === "INGESTION_REVIEW" && content.reviewId && (
        <UniversalReviewComponent
          reviewId={content.reviewId}
          initialPayload={content.initialPayload}
        />
      )}

      {content?.type === "REVENUE_CHART" && (
        <Card className="border-border bg-card/80 p-4 shadow-xl">
          <CardHeader className="px-0 pt-0 pb-3">
            <CardTitle className="text-foreground text-base font-bold">
              Weekly Revenue &amp; Sales Metrics
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              Real-time Square &amp; POS aggregate sales trends
            </p>
          </CardHeader>
          <RevenueChart data={realRevenueData} />
        </Card>
      )}

      {content?.type === "TICKET_TIME_CHART" && (
        <Card className="border-border bg-card/80 p-4 shadow-xl">
          <CardHeader className="px-0 pt-0 pb-3">
            <CardTitle className="text-foreground text-base font-bold">
              Kitchen Ticket Fulfillment Times
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              KDS throttle metrics and station turnaround speeds
            </p>
          </CardHeader>
          <TicketTimeChart data={realTicketTimeData} />
        </Card>
      )}

      {content?.type === "PREP_LIST" && (
        <Card className="border-border bg-card/80 flex flex-col gap-3 p-4 shadow-xl">
          <CardHeader className="px-0 pt-0 pb-1">
            <CardTitle className="text-foreground flex items-center gap-2 text-base font-bold">
              <CheckSquare className="text-primary h-4 w-4" />
              Kitchen Prep Checklist
            </CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-2">
            {prepListItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onTogglePrepItem(item.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
                  item.done
                    ? "bg-primary/10 border-primary/30 text-primary line-through opacity-75"
                    : "bg-muted/60 border-border text-foreground hover:border-primary/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {}}
                  className="accent-primary h-4 w-4 cursor-pointer rounded"
                />
                <span className="text-sm font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {content?.type === "INGREDIENT_TABLE" && (
        <Card className="border-border bg-card/80 p-4 shadow-xl">
          <CardHeader className="px-0 pt-0 pb-3">
            <CardTitle className="text-foreground flex items-center gap-2 text-base font-bold">
              <BookOpen className="text-primary h-4 w-4" />
              Inventory Master Items Ledger
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: "Yellow Onions 5lb", cat: "Produce", unit: "5 lb bag" },
                { name: "Beef Ribeye Lip On", cat: "Meat", unit: "15 lb case" },
                { name: "Heavy Cream 40%", cat: "Dairy", unit: "1 Gallon" },
              ].map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="text-foreground font-semibold">{row.name}</TableCell>
                  <TableCell>{row.cat}</TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell>
                    <Chip selected size="sm">In Stock</Chip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {content?.type === "SEARCH_RESULTS" && (
        <Card className="border-border bg-card/80 flex flex-col gap-3 p-4 shadow-xl">
          <CardHeader className="px-0 pt-0 pb-1">
            <CardTitle className="text-foreground flex items-center gap-2 text-base font-bold">
              <Search className="text-primary h-4 w-4" />
              Web &amp; Culinary Knowledge
            </CardTitle>
          </CardHeader>
          <div className="border-border bg-muted/60 flex flex-col gap-1 rounded-xl border p-4">
            <a
              href="https://fdc.nal.usda.gov"
              target="_blank"
              rel="noreferrer"
              className="text-primary flex items-center gap-1.5 text-sm font-bold hover:underline"
            >
              USDA FoodData Central <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="text-muted-foreground text-xs">
              FDC ID #170000. Contains 40 kcal per 100g.
            </p>
          </div>
        </Card>
      )}
    </ArtifactColumnView>
  );
}
