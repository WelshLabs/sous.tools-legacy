import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import type { INeo4jSyncRepository } from "./domain/neo4j-sync.repository.interface";
import { SCHEMA_REGISTRY, IGNORED_FIELDS } from "./domain/schema-registry";

export class SupabaseWebhookPayload {
  type!: "INSERT" | "UPDATE" | "DELETE";
  table!: string;
  schema!: string;
  record!: Record<string, any> | null;
  old_record!: Record<string, any> | null;
}

// Helper to convert snake_case to camelCase
export function snakeToCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", ""),
  );
}

// Helper to capitalize the first letter
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper to resolve the Node Label for a given table name
export function resolveNodeLabel(table: string): string {
  const registered = SCHEMA_REGISTRY[table];
  if (registered && !registered.isJoinTable) {
    return registered.nodeLabel;
  }

  // Fallback dynamic mapping: e.g. user_profiles -> UserProfile, users -> User
  let name = table;
  if (name.endsWith("ies")) {
    name = name.slice(0, -3) + "y";
  } else if (name.endsWith("s") && !name.endsWith("ss")) {
    name = name.slice(0, -1);
  }

  return name.split("_").map(capitalize).join("");
}

// Helper to serialize nested objects and maps for Neo4j compatibility
export function serializeProperties(
  properties: Record<string, any>,
): Record<string, any> {
  const serialized: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) {
      serialized[key] = null;
      continue;
    }

    if (typeof value === "object") {
      if (value instanceof Date) {
        serialized[key] = value.toISOString();
        continue;
      }
      if (Array.isArray(value)) {
        // If it's a primitive array (e.g. string[], number[]), keep it.
        // If it contains objects, serialize the array.
        const hasObjects = value.some(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            !(item instanceof Date),
        );
        if (hasObjects) {
          serialized[key] = JSON.stringify(value);
        } else {
          serialized[key] = value;
        }
        continue;
      }
      // Serialize nested maps/objects to JSON strings
      serialized[key] = JSON.stringify(value);
      continue;
    }

    serialized[key] = value;
  }
  return serialized;
}

@Injectable()
export class Neo4jSyncService {
  private readonly logger = new Logger(Neo4jSyncService.name);

  constructor(
    @Inject("INeo4jSyncRepository")
    private readonly repository: INeo4jSyncRepository,
  ) {}

  /**
   * Processes the incoming database webhook payload and translates it dynamically to Neo4j operations.
   */
  async handleWebhook(payload: SupabaseWebhookPayload): Promise<void> {
    try {
      await this.processWebhook(payload);
    } catch (err: any) {
      this.logger.error(
        `Failed to sync webhook to Neo4j for [${payload.schema}.${payload.table}] [${payload.type}]:`,
        err?.stack || err,
      );
    }
  }

  /**
   * Internal webhook processing pipeline
   */
  private async processWebhook(payload: SupabaseWebhookPayload): Promise<void> {
    const { table, type, schema } = payload;
    this.logger.log(
      `Processing database webhook: [${schema}.${table}] [${type}]`,
    );

    const config = SCHEMA_REGISTRY[table];

    // Handle Join Tables (Many-to-Many relationship assignments)
    if (config && config.isJoinTable) {
      if (type === "DELETE") {
        const record = payload.old_record;
        if (!record) {
          throw new BadRequestException(
            `Missing old_record in DELETE payload for join table ${table}`,
          );
        }

        const srcId = record[config.source.fkField];
        const targetId = record[config.target.fkField];

        if (!srcId || !targetId) {
          this.logger.warn(
            `Skipping join table deleteRelationship for ${table}: missing ${config.source.fkField} or ${config.target.fkField}`,
          );
          return;
        }

        await this.repository.deleteRelationship(
          config.source.targetLabel,
          srcId,
          config.target.targetLabel,
          targetId,
          config.relationLabel,
        );
      } else {
        const record = payload.record;
        if (!record) {
          throw new BadRequestException(
            `Missing record in ${type} payload for join table ${table}`,
          );
        }

        const srcId = record[config.source.fkField];
        const targetId = record[config.target.fkField];

        if (!srcId || !targetId) {
          this.logger.warn(
            `Skipping join table createDirectRelationship for ${table}: missing ${config.source.fkField} or ${config.target.fkField}`,
          );
          return;
        }

        const properties: Record<string, any> = {};

        // 1. Dynamic Edge Properties Mapping (Extract non-foreign-key columns)
        for (const [key, value] of Object.entries(record)) {
          if (key === config.source.fkField || key === config.target.fkField) {
            continue;
          }
          if (key === "id" || IGNORED_FIELDS.includes(key)) {
            continue;
          }
          const camelKey = snakeToCamelCase(key);
          properties[camelKey] = this.coerceValue(key, value);
        }

        // 2. Custom Properties Override (if any)
        if (config.customProperties) {
          const custom = config.customProperties(record);
          Object.assign(properties, custom);
        }

        // 3. Serialize properties for Neo4j driver compatibility
        const serialized = serializeProperties(properties);

        // Join Tables do NOT clear existing edges on UPDATE/INSERT (purely additive M:M links)
        await this.repository.createDirectRelationship(
          config.source.targetLabel,
          srcId,
          config.target.targetLabel,
          targetId,
          config.relationLabel,
          serialized,
        );
      }
      return;
    }

    // Handle standard Tables (Node Syncing & Foreign Key Relationship Mapping)
    const nodeLabel = resolveNodeLabel(table);

    if (type === "DELETE") {
      const record = payload.old_record;
      // Support primary key 'user_id' for tables like user_profiles, fallback to 'id'
      const id = record?.id || record?.user_id;
      if (!id) {
        throw new BadRequestException(
          `Missing identifier in DELETE payload for table ${table}`,
        );
      }

      await this.repository.deleteNode(nodeLabel, id);
    } else {
      const record = payload.record;
      const id = record?.id || record?.user_id;
      if (!record || !id) {
        throw new BadRequestException(
          `Missing record or identifier in ${type} payload for table ${table}`,
        );
      }

      // Check validation constraints from legacy manual switches
      if (table === "recipes" && !record.organization_id) {
        throw new BadRequestException(
          "Missing organization_id in recipe record",
        );
      }
      if (table === "vendors" && !record.organization_id) {
        throw new BadRequestException(
          "Missing organization_id in vendor record",
        );
      }
      if (table === "items" && !record.organization_id) {
        throw new BadRequestException("Missing organization_id in item record");
      }
      if (table === "recipe_ingredients" && !record.recipe_id) {
        throw new BadRequestException(
          "Missing recipe_id in recipe ingredient record",
        );
      }
      if (
        table === "inventory_on_hand" &&
        (!record.organization_id || !record.item_id)
      ) {
        throw new BadRequestException(
          "Missing organization_id or item_id in inventory record",
        );
      }
      if (
        table === "purchase_orders" &&
        (!record.organization_id || !record.vendor_id)
      ) {
        throw new BadRequestException(
          "Missing organization_id or vendor_id in purchase order record",
        );
      }
      if (table === "purchase_order_items" && !record.po_id) {
        throw new BadRequestException(
          "Missing po_id in purchase order item record",
        );
      }
      if (
        table === "vendor_item_aliases" &&
        (!record.organization_id || !record.vendor_id)
      ) {
        throw new BadRequestException(
          "Missing organization_id or vendor_id in vendor item alias record",
        );
      }
      if (table === "tickets" && !record.organization_id) {
        throw new BadRequestException(
          "Missing organization_id in ticket record",
        );
      }
      if (table === "orders" && !record.ticket_id) {
        throw new BadRequestException("Missing ticket_id in order record");
      }
      if (table === "order_items" && !record.order_id) {
        throw new BadRequestException("Missing order_id in order item record");
      }
      if (table === "shifts" && (!record.organization_id || !record.user_id)) {
        throw new BadRequestException(
          "Missing organization_id or user_id in shift record",
        );
      }
      if (
        table === "time_clocks" &&
        (!record.organization_id || !record.user_id)
      ) {
        throw new BadRequestException(
          "Missing organization_id or user_id in time clock record",
        );
      }
      if (
        table === "invoices" &&
        (!record.organization_id || !record.vendor_id)
      ) {
        throw new BadRequestException(
          "Missing organization_id or vendor_id in invoice record",
        );
      }
      if (table === "invoice_items" && !record.invoice_id) {
        throw new BadRequestException(
          "Missing invoice_id in invoice item record",
        );
      }
      if (table === "wastage_logs" && !record.organization_id) {
        throw new BadRequestException(
          "Missing organization_id in wastage log record",
        );
      }

      const properties: Record<string, any> = {};

      // 1. Dynamic Node Properties Mapping (Extract non-foreign-key columns by default)
      for (const [key, value] of Object.entries(record)) {
        if (key === "id" || key === "user_id" || IGNORED_FIELDS.includes(key)) {
          continue;
        }
        if (key.endsWith("_id")) {
          continue;
        }

        const camelKey = snakeToCamelCase(key);
        properties[camelKey] = this.coerceValue(key, value);
      }

      // 2. Custom Properties Override (if any)
      if (config && !config.isJoinTable && config.customProperties) {
        const custom = config.customProperties(record);
        Object.assign(properties, custom);
      }

      // 3. Serialize properties for Neo4j driver compatibility
      const serialized = serializeProperties(properties);

      // 4. Upsert the Node in Neo4j using strict idempotency
      await this.repository.upsertNode(nodeLabel, id, serialized);

      // 5. Draw Relationships (Edges) based on Foreign Keys
      if (config && !config.isJoinTable && config.relationships.length > 0) {
        // Use registered relationships
        for (const rel of config.relationships) {
          const fkValue = record[rel.fkField];
          if (fkValue) {
            // Prevent orphaned edges: Clear old outgoing relationship only if foreign key value changed on UPDATE
            if (type === "UPDATE" && payload.old_record) {
              const oldFkValue = payload.old_record[rel.fkField];
              if (oldFkValue && oldFkValue !== fkValue) {
                await this.repository.clearRelationship(
                  nodeLabel,
                  id,
                  rel.relationLabel,
                  rel.direction || "out",
                );
              }
            }

            await this.repository.createRelationship(
              nodeLabel,
              id,
              rel.targetLabel,
              fkValue,
              rel.relationLabel,
              rel.direction || "out",
            );
          }
        }
      } else {
        // Fallback dynamic relationship mapping: discover keys ending with _id
        for (const [key, value] of Object.entries(record)) {
          if (
            key === "id" ||
            key === "user_id" ||
            IGNORED_FIELDS.includes(key) ||
            !key.endsWith("_id") ||
            !value
          ) {
            continue;
          }

          const prefix = key.slice(0, -3); // remove '_id'
          let targetLabel = prefix.split("_").map(capitalize).join("");

          // Align naming deviations to target labels
          if (targetLabel === "Employee" || targetLabel === "RecordedBy") {
            targetLabel = "User";
          } else if (targetLabel === "Po") {
            targetLabel = "PurchaseOrder";
          } else if (
            targetLabel === "InternalItem" ||
            targetLabel === "MasterItem"
          ) {
            targetLabel = "Item";
          } else if (targetLabel === "SubRecipe") {
            targetLabel = "Recipe";
          }

          let relationLabel = "LINKED_TO";
          if (key === "organization_id") {
            relationLabel = "BELONGS_TO";
          } else if (key === "vendor_id") {
            relationLabel = "PLACED_WITH";
            if (table === "invoices") {
              relationLabel = "FROM_VENDOR";
            }
          } else if (key === "po_id" && table === "invoices") {
            relationLabel = "RECONCILES";
          } else if (
            key === "user_id" ||
            key === "employee_id" ||
            key === "recorded_by"
          ) {
            if (table === "shifts") relationLabel = "WORKED_BY";
            else if (table === "time_clocks") relationLabel = "CLOCKED_BY";
            else if (table === "tickets") relationLabel = "SOLD_BY";
            else if (table === "wastage_logs") relationLabel = "REPORTED_BY";
            else relationLabel = "LINKED_TO";
          } else if (
            key === "order_id" ||
            key === "invoice_id" ||
            key === "po_id" ||
            key === "ticket_id"
          ) {
            relationLabel = "PART_OF";
          } else if (key === "item_id") {
            if (table === "inventory_on_hand") relationLabel = "OF_ITEM";
            else if (table === "wastage_logs") relationLabel = "WASTED_ITEM";
            else relationLabel = "OF_ITEM";
          } else if (key === "recipe_id") {
            if (table === "order_items") relationLabel = "OF_RECIPE";
            else if (table === "wastage_logs") relationLabel = "WASTED_RECIPE";
            else relationLabel = "OF_RECIPE";
          }

          // Prevent orphaned edges: Clear old dynamic outgoing relationship only if foreign key value changed on UPDATE
          if (type === "UPDATE" && payload.old_record) {
            const oldFkValue = payload.old_record[key];
            if (oldFkValue && oldFkValue !== value) {
              await this.repository.clearRelationship(
                nodeLabel,
                id,
                relationLabel,
                "out",
              );
            }
          }

          await this.repository.createRelationship(
            nodeLabel,
            id,
            targetLabel,
            value,
            relationLabel,
            "out",
          );
        }
      }
    }
  }

  /**
   * Coerces raw postgres database values to appropriate types.
   */
  private coerceValue(key: string, value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    // Convert numeric strings to actual Javascript numbers for specific fields
    if (
      typeof value === "string" &&
      !isNaN(Number(value)) &&
      value.trim() !== "" &&
      (key.includes("qty") ||
        key.includes("quantity") ||
        key.includes("price") ||
        key.includes("count") ||
        key.includes("cost") ||
        key.includes("margin") ||
        key.includes("amount") ||
        key.includes("density"))
    ) {
      return parseFloat(value);
    }

    return value;
  }
}
