import React from "react";
import { UniversalReviewComponent } from "@soustools/domain-inventory";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface InvoiceReviewPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function InvoiceReviewPage({
  params,
}: InvoiceReviewPageProps) {
  const { id } = await params;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/inventory/invoices"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Invoices
        </Link>
        <h1 className="text-lg font-bold text-zinc-100">
          Invoice Ingestion &amp; Mapping Editor
        </h1>
      </div>

      <div className="flex-1">
        <UniversalReviewComponent reviewId={id} />
      </div>
    </div>
  );
}
