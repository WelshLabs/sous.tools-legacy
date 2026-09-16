"use client";

import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { graphqlClient } from "@soustools/api-client";
import { InvoicesHubView, type InvoiceSummary } from "./InvoicesHub.view";

const GET_INVOICES_QUERY = `
  query GetInvoices {
    invoices {
      id
      organization_id
      vendor_id
      vendor_name
      invoice_number
      total_amount
      invoice_date
      created_at
      items {
        id
        raw_name
        quantity
        unit_price
      }
    }
  }
`;

export function InvoicesHubContainer() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = async () => {
    try {
      setIsLoading(true);
      const res = await graphqlClient.request<{ invoices: any[] }>(
        GET_INVOICES_QUERY,
      );
      if (res.data?.invoices) {
        setInvoices(
          res.data.invoices.map((inv: any) => ({
            id: inv.id,
            invoiceNumber: inv.invoice_number,
            vendorName: inv.vendor_name || "Unknown Vendor",
            invoiceDate: inv.invoice_date,
            totalAmount: Number(inv.total_amount) || 0,
            itemCount: inv.items?.length || 0,
            createdAt: inv.created_at,
          })),
        );
      }
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleImportSelect = (type: "upload" | "camera" | "drive") => {
    if (type === "upload") {
      fileInputRef.current?.click();
    } else if (type === "camera") {
      cameraInputRef.current?.click();
    }
  };

  const submitIngestionPayload = async (payload: any) => {
    try {
      const res = await fetch("/api/ingestion/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const payloadData = await res.json();
        const reviewId = payloadData.reviewId || payloadData.data?.reviewId;
        if (typeof window !== "undefined") {
          window.location.href = `/home${reviewId ? `?reviewId=${reviewId}` : ""}`;
        }
      } else {
        toast.error("Failed to ingest invoice.");
      }
    } catch (err) {
      console.error("Upload error", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const processFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: "upload" | "camera",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64String = reader.result as string;
      await submitIngestionPayload({
        source,
        sourceName: file.name,
        pagesInput: [{ pageNumber: 1, rawText: base64String }],
      });
    };
    reader.onerror = () => {
      setIsSubmitting(false);
      toast.error("Failed to read file.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <InvoicesHubView
      onImportSelect={handleImportSelect}
      fileInputRef={fileInputRef}
      cameraInputRef={cameraInputRef}
      processFile={processFile}
      isSubmitting={isSubmitting}
      invoices={invoices}
      isLoading={isLoading}
      onRefresh={fetchInvoices}
    />
  );
}

export { InvoicesHubContainer as InvoicesHub };
