"use client";

import { useState, useEffect } from "react";
import type { Vendor } from "@soustools/api-types";
import { toast } from "sonner";
import { graphqlClient } from "@soustools/api-client";
import { VendorsPanelView } from "./VendorsPanel.view";

export interface VendorsPanelProps {
  vendors?: Vendor[];
  initialVendors?: Vendor[];
  onSave?: (id: string, payload: Partial<Vendor>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onAddVendorClick?: () => void;
}

export function VendorsPanel({
  vendors: propVendors,
  initialVendors = [],
  onSave: customOnSave,
  onDelete: customOnDelete,
  onAddVendorClick: customOnAddVendorClick,
}: VendorsPanelProps) {
  const [localVendors, setLocalVendors] = useState<Vendor[]>(
    propVendors ?? initialVendors,
  );

  useEffect(() => {
    if (propVendors) {
      setLocalVendors(propVendors);
    }
  }, [propVendors]);

  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Vendor>>({});

  const handleSave = async (id: string) => {
    if (!editForm.name) {
      toast.error("Vendor name is required");
      return;
    }
    if (customOnSave) {
      await customOnSave(id, editForm);
    } else {
      try {
        if (id === "new") {
          const res = await graphqlClient.request<{ createVendor: any }>(
            `
              mutation CreateVendor($input: CreateVendorInputGQL!) {
                createVendor(input: $input) {
                  id
                  name
                  order_method
                  rep_email
                  rep_phone
                  delivery_days
                }
              }
            `,
            {
              input: {
                name: editForm.name,
                order_method: editForm.order_method || "MANUAL",
                rep_email: editForm.email,
                rep_phone: editForm.phone,
                delivery_days: editForm.order_days,
              },
            },
          );
          if (res.data?.createVendor) {
            const newV = res.data.createVendor;
            setLocalVendors((prev) => [
              ...prev,
              {
                id: newV.id,
                organization_id: "",
                name: newV.name,
                order_method: newV.order_method || "MANUAL",
                email: newV.rep_email || "",
                phone: newV.rep_phone || "",
                order_days: newV.delivery_days || [],
                created_at: new Date().toISOString(),
              },
            ]);
            toast.success("Vendor created successfully");
          } else {
            toast.error("Failed to create vendor");
          }
        } else {
          const res = await graphqlClient.request<{ updateVendor: any }>(
            `
              mutation UpdateVendor($id: String!, $input: UpdateVendorInputGQL!) {
                updateVendor(id: $id, input: $input) {
                  id
                  name
                  order_method
                  rep_email
                  rep_phone
                  delivery_days
                }
              }
            `,
            {
              id,
              input: {
                name: editForm.name,
                order_method: editForm.order_method,
                rep_email: editForm.email,
                rep_phone: editForm.phone,
                delivery_days: editForm.order_days,
              },
            },
          );
          if (res.data?.updateVendor) {
            setLocalVendors((prev) =>
              prev.map((v) => (v.id === id ? { ...v, ...editForm } : v)),
            );
            toast.success("Vendor updated successfully");
          } else {
            toast.error("Failed to update vendor");
          }
        }
      } catch (err: any) {
        toast.error(err.message || "Network error");
      }
    }
    setIsEditing(null);
    setEditForm({});
  };

  const handleDelete = async (id: string) => {
    if (
      typeof window !== "undefined" &&
      !confirm("Are you sure you want to delete this vendor?")
    ) {
      return;
    }
    if (customOnDelete) {
      await customOnDelete(id);
    } else {
      try {
        const res = await fetch(`/api/vendors/${id}`, { method: "DELETE" });
        if (res.ok) {
          setLocalVendors((prev) => prev.filter((v) => v.id !== id));
          toast.success("Vendor deleted successfully");
        } else {
          toast.error("Failed to delete vendor");
        }
      } catch (err: any) {
        toast.error(err.message || "Network error");
      }
    }
  };

  const handleAddVendor = () => {
    if (customOnAddVendorClick) {
      customOnAddVendorClick();
    } else if (typeof window !== "undefined") {
      window.location.href = "/inventory/vendors/add";
    }
  };

  return (
    <VendorsPanelView
      vendors={localVendors}
      isEditing={isEditing}
      setIsEditing={setIsEditing}
      editForm={editForm}
      setEditForm={setEditForm}
      handleSave={handleSave}
      handleDelete={handleDelete}
      onAddVendorClick={handleAddVendor}
    />
  );
}

export { VendorsPanel as VendorsPanelContainer };
