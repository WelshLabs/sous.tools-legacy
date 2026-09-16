import { clientConfig as config } from "@soustools/config/client";
import { refreshAuthSession } from "./auth-session";
import type { Client as WsClient } from "graphql-ws";
import { createUrqlClient, getSubscriptionWsClient } from "./urql";
import type { Client as UrqlClient } from "urql";
import { print, type DocumentNode } from "graphql";

export * from "./urql";
export * from "./generated/graphql";

export {
  cacheExchange,
  offlineExchange,
  type CacheExchangeOpts,
} from "@urql/exchange-graphcache";
export {
  authExchange,
  type AuthUtilities,
  type AuthConfig,
} from "@urql/exchange-auth";
export {
  gql,
  fetchExchange,
  subscriptionExchange,
  type Client,
  type Exchange,
  type Operation,
  type OperationResult,
  type CombinedError,
} from "urql";

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, any> }>;
}

export interface GraphQLClientOptions {
  url?: string;
  wsUrl?: string;
  headers?: Record<string, string>;
  urqlClient?: UrqlClient;
}

export interface SubscriptionOptions<
  TData = any,
  TVariables extends Record<string, unknown> = Record<string, any>,
> {
  query: string | DocumentNode;
  variables?: TVariables;
  onNext: (data: TData) => void;
  onError?: (error: unknown) => void;
  onComplete?: () => void;
}

export class GraphQLClient {
  private url: string;
  private wsUrl: string;
  private headers: Record<string, string>;
  private wsClient?: WsClient | null;
  private urqlInstance: UrqlClient;

  constructor(options: GraphQLClientOptions = {}) {
    const baseUrl = options.url || config.NEXT_PUBLIC_API_URL;
    this.url = baseUrl.endsWith("/graphql")
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/graphql`;
    this.wsUrl = options.wsUrl || this.url.replace(/^http/, "ws");
    this.headers = options.headers || {};
    this.urqlInstance =
      options.urqlClient ||
      createUrqlClient({
        url: this.url,
        wsUrl: this.wsUrl,
        headers: this.headers,
      });
  }

  getUrqlClient(): UrqlClient {
    return this.urqlInstance;
  }

  async request<TData = any, TVariables = Record<string, any>>(
    query: string | DocumentNode,
    variables?: TVariables,
    requestInit?: RequestInit,
  ): Promise<GraphQLResponse<TData>> {
    const queryString =
      typeof query === "string"
        ? query
        : query.loc?.source.body || print(query);

    const fetchQuery = async (): Promise<Response> => {
      const dynamicHeaders: Record<string, string> = {};

      // Server-side Next.js Server Components: forward incoming cookies & auth header
      if (typeof window === "undefined") {
        try {
          // @ts-expect-error next/headers is an optional runtime dependency in Next.js environments
          const nextHeaders = await import("next/headers");
          if (typeof nextHeaders.cookies === "function") {
            const cookieStore = await nextHeaders.cookies();
            const cookieString = cookieStore
              .getAll()
              .map((c: any) => `${c.name}=${c.value}`)
              .join("; ");
            
            if (cookieString) {
              dynamicHeaders["Cookie"] = cookieString;
              const token = cookieStore.get("sb-access-token")?.value;
              if (token) {
                dynamicHeaders["Authorization"] = `Bearer ${token}`;
              }
            }
          }
        } catch {
          // not in next/headers context
        }
      }

      return fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
          ...dynamicHeaders,
          ...requestInit?.headers,
        },
        body: JSON.stringify({ query: queryString, variables }),
        credentials: "include",
        ...requestInit,
      });
    };

    let response = await fetchQuery();
    if (response.status === 401) {
      if (typeof window !== "undefined") {
        const refreshed = await refreshAuthSession();
        if (refreshed) response = await fetchQuery();
      }
    }
    if (!response.ok) {
      throw new Error(
        `GraphQL HTTP Error: ${response.status} ${response.statusText}`,
      );
    }

    const json: GraphQLResponse<TData> = await response.json();
    const hasAuthError = json.errors?.some(
      (e) =>
        e.message?.toLowerCase().includes("unauthorized") ||
        e.extensions?.code === "UNAUTHENTICATED",
    );
    if (hasAuthError && typeof window !== "undefined") {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        const retryRes = await fetchQuery();
        if (retryRes.ok) return retryRes.json();
      }
    }
    return json;
  }

  getWsClient(): WsClient | null {
    if (typeof window === "undefined") return null;
    if (!this.wsClient) {
      this.wsClient = getSubscriptionWsClient(this.wsUrl, this.headers);
    }
    return this.wsClient;
  }

  subscribe<
    TData = any,
    TVariables extends Record<string, unknown> = Record<string, any>,
  >(options: SubscriptionOptions<TData, TVariables>): () => void {
    if (typeof window === "undefined") return () => {};
    const client = this.getWsClient();
    if (!client) return () => {};

    const queryString =
      typeof options.query === "string"
        ? options.query
        : options.query.loc?.source.body || print(options.query);
    return client.subscribe<GraphQLResponse<TData>>(
      { query: queryString, variables: options.variables },
      {
        next: (response) => {
          if (response.data) options.onNext(response.data as TData);
        },
        error: (err) => {
          options.onError?.(err);
        },
        complete: () => {
          options.onComplete?.();
        },
      },
    );
  }
}

export function createGraphQLClient(
  options?: GraphQLClientOptions,
): GraphQLClient {
  return new GraphQLClient(options);
}

export const graphqlClient = createGraphQLClient();
