"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { OrdersPanelContainer } from "@soustools/domain-inventory";
import { graphqlClient } from "@soustools/api-client";
import type {
  Vendor,
  WhiteboardItem,
  PurchaseOrder,
} from "@soustools/api-types";

export const dynamic = "force-dynamic";

const GET_ORDERS_MODAL_QUERY = `
  query GetOrdersModalData {
    vendors {
      id
      organization_id
      name
      rep_name
      rep_phone
      rep_email
      order_method
      cutoff_time
      minimum_order
      delivery_days
      created_at
      updated_at
    }
    whiteboard {
      id
      organization_id
      item_id
      custom_name
      quantity
      unit
      suggested_vendor_id
      status
      created_by
      created_at
      updated_at
    }
    purchaseOrders {
      id
      organization_id
      vendor_id
      status
      total_amount
      order_date
      delivery_date
      created_at
      updated_at
      purchase_order_items {
        id
        po_id
        item_id
        custom_name
        quantity
        unit
        unit_price
        created_at
      }
    }
  }
`;

export default function InterceptedOrdersModal() {
  const router = useRouter();
  const pathname = usePathname();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [whiteboardItems, setWhiteboardItems] = useState<WhiteboardItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // All hooks must be called unconditionally before any conditional returns
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const res = await graphqlClient.request<{
          vendors: any[];
          whiteboard: any[];
          purchaseOrders: any[];
        }>(GET_ORDERS_MODAL_QUERY);

        if (isMounted && res.data) {
          setVendors(res.data.vendors || []);
          setWhiteboardItems(res.data.whiteboard || []);
          setPurchaseOrders(res.data.purchaseOrders || []);
        }
      } catch (err) {
        console.error("Failed to load orders modal data via GraphQL:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        router.back();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // Guard: if the user navigates to another page, dismiss the intercepted route
  if (pathname !== "/orders") {
    return null;
  }

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md duration-200 sm:p-6 md:p-10"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          router.back();
        }
      }}
    >
      <div className="border-border animate-in zoom-in-95 relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-[#0a0d16] shadow-2xl duration-150">
        {/* Modal Header */}
        <div className="border-border/60 bg-card/80 flex shrink-0 items-center justify-between border-b px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-400" />
            <h2 className="text-foreground text-base font-extrabold tracking-tight">
              Living Order List & Purchasing
            </h2>
            <span className="bg-secondary/80 text-muted-foreground border-border rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase">
              Quick Access
            </span>
          </div>
          <button
            onClick={() => router.back()}
            className="border-border bg-secondary/80 text-muted-foreground hover:bg-secondary hover:text-foreground flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold shadow-sm transition-all active:scale-95"
            aria-label="Close modal"
          >
            <X className="text-primary h-4 w-4" />
            <span>Close</span>
            <kbd className="border-border bg-muted/60 text-muted-foreground ml-1 rounded border px-1.5 py-0.5 font-mono text-[10px]">
              Esc
            </kbd>
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto bg-[#070911]/90">
          {loading ? (
            <div className="text-muted-foreground flex h-96 flex-col items-center justify-center gap-3">
              <Loader2 className="text-primary h-8 w-8 animate-spin" />
              <p className="text-xs font-black tracking-widest uppercase">
                Loading Living Order List…
              </p>
            </div>
          ) : (
            <OrdersPanelContainer
              initialVendors={vendors}
              initialWhiteboardItems={whiteboardItems}
              initialPurchaseOrders={purchaseOrders}
            />
          )}
        </div>
      </div>
    </div>
  );
}
