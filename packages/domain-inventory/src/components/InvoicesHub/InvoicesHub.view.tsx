"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Camera,
  FileText,
  HardDrive,
  PlusCircle,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { TwoToneHeader } from "@soustools/design-system";

export interface ImportDropdownProps {
  onSelect: (type: "upload" | "camera" | "drive") => void;
}

export function ImportDropdown({ onSelect }: ImportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-bold transition-colors"
      >
        <PlusCircle className="h-5 w-5" />
        Import Invoice
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="bg-card border-border animate-in fade-in slide-in-from-top-2 absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border shadow-lg">
          <button
            onClick={() => {
              setIsOpen(false);
              onSelect("upload");
            }}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
          >
            <FileText className="h-5 w-5 text-blue-500" />
            <span className="font-medium">Upload an Image</span>
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              onSelect("camera");
            }}
            className="border-border flex w-full cursor-pointer items-center gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-white/5"
          >
            <Camera className="h-5 w-5 text-emerald-500" />
            <span className="font-medium">Take Photo</span>
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              onSelect("drive");
            }}
            className="border-border flex w-full cursor-pointer items-center gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-white/5"
          >
            <HardDrive className="h-5 w-5 text-amber-500" />
            <span className="font-medium">Google Drive</span>
          </button>
        </div>
      )}
    </div>
  );
}

export interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  invoiceDate: string;
  totalAmount: number;
  itemCount: number;
  createdAt?: string;
}

export interface InvoicesHubViewProps {
  onImportSelect: (type: "upload" | "camera" | "drive") => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  processFile: (
    e: React.ChangeEvent<HTMLInputElement>,
    source: "upload" | "camera",
  ) => void;
  isSubmitting: boolean;
  invoices?: InvoiceSummary[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function InvoicesHubView({
  onImportSelect,
  fileInputRef,
  cameraInputRef,
  processFile,
  isSubmitting,
  invoices = [],
  isLoading = false,
}: InvoicesHubViewProps) {
  return (
    <div className="bg-background min-h-screen flex-1 p-8">
      <div className="mb-12">
        <TwoToneHeader
          breadcrumb="Inventory / Invoices"
          title="Invoices Hub"
          trailing={<ImportDropdown onSelect={onImportSelect} />}
        />
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Centralize your purchasing records. Import physical or digital
          invoices to automatically reconcile purchase orders and update the
          items ledger.
        </p>
      </div>

      <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link
          href="/inventory/invoices/new"
          className="glass-panel hover:border-primary/50 group border-border flex h-48 flex-col items-center justify-center rounded-2xl border p-6 text-center transition-colors"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 transition-transform group-hover:scale-110">
            <PlusCircle className="h-6 w-6" />
          </div>
          <h3 className="mb-1 text-lg font-bold">Manual Entry</h3>
          <p className="text-muted-foreground text-sm">Create a blank record</p>
        </Link>

        <Link
          href="/home"
          className="glass-panel hover:border-primary/50 group border-border bg-card/50 flex h-48 flex-col items-center justify-center rounded-2xl border p-6 text-center transition-colors"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-purple-500 transition-transform group-hover:scale-110">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="mb-1 text-lg font-bold">Processing Queue</h3>
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            Review extracted data <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
      </div>

      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">
            Recent Invoices
          </h2>
          <span className="text-muted-foreground text-sm">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
          </span>
        </div>

        {isLoading ? (
          <div className="glass-panel border-border text-muted-foreground rounded-2xl border p-12 text-center">
            <div className="border-primary mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
            <p className="text-sm">Loading invoices...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="glass-panel border-border text-muted-foreground rounded-2xl border p-12 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
            <p className="font-medium text-zinc-300">No invoices recorded yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Upload or scan an invoice above to process and reconcile purchases.
            </p>
          </div>
        ) : (
          <div className="border-border overflow-hidden rounded-2xl border bg-card/50">
            <table className="w-full text-left text-sm">
              <thead className="border-border border-b bg-card/80 text-xs font-semibold uppercase text-zinc-400">
                <tr>
                  <th className="px-6 py-4">Invoice #</th>
                  <th className="px-6 py-4">Vendor</th>
                  <th className="px-6 py-4">Invoice Date</th>
                  <th className="px-6 py-4">Items</th>
                  <th className="px-6 py-4 text-right">Total Amount</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y text-zinc-200">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono font-medium text-emerald-400">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 font-medium text-zinc-100">
                      {inv.vendorName}
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {inv.invoiceDate}
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {inv.itemCount} {inv.itemCount === 1 ? "line item" : "line items"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-zinc-100">
                      ${inv.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/inventory/invoices/${inv.id}`}
                          className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-medium text-cyan-400 hover:bg-zinc-700 hover:text-cyan-300 transition-colors"
                        >
                          Review Mappings
                        </Link>
                        <Link
                          href="/inventory/items"
                          className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                        >
                          Items
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={(e) => processFile(e, "upload")}
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={cameraInputRef}
        onChange={(e) => processFile(e, "camera")}
      />

      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border-border flex items-center gap-4 rounded-2xl border p-6 text-white shadow-2xl">
            <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
            <span className="font-bold">Starting ingestion process...</span>
          </div>
        </div>
      )}
    </div>
  );
}
