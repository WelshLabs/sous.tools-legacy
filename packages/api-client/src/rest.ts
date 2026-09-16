import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { clientConfig as config } from "@soustools/config/client";
import { refreshAuthSession } from "./auth-session";

export interface RestClientOptions {
  baseUrl?: string;
  credentials?: RequestCredentials;
}

export type RestApiClient = ReturnType<typeof createClient<paths>>;

export function createRestClient(
  options: RestClientOptions = {},
): RestApiClient {
  const baseUrl = options.baseUrl || config.NEXT_PUBLIC_API_URL;

  const client = createClient<paths>({
    baseUrl,
    credentials: options.credentials || "include",
    fetch: (input: any, init?: any) => fetch(input, init),
  });

  client.use({
    onRequest: async ({ request }) => {
      let nextRequest = request;
      if (nextRequest.credentials !== "include") {
        nextRequest = new Request(nextRequest, { credentials: "include" });
      }
      (nextRequest as any)._retryClone = nextRequest.clone();
      return nextRequest;
    },
    onResponse: async ({ response, request }) => {
      if (
        response.status === 401 &&
        !request.url.includes("/auth/refresh") &&
        !request.url.includes("/auth/login") &&
        !request.url.includes("/auth/session")
      ) {
        if (typeof window !== "undefined") {
          try {
            const refreshed = await refreshAuthSession();
            if (refreshed) {
              let retryReq = (request as any)._retryClone || request.clone();
              if (retryReq.credentials !== "include") {
                retryReq = new Request(retryReq, { credentials: "include" });
              }
              return await fetch(retryReq);
            }
          } catch (err) {
            console.error("[api-client] REST client refresh retry failed:", err);
          }
        }
      }
      return response;
    },
  });

  return client;
}

export const createApiClient = createRestClient;

export const api: RestApiClient = createRestClient();
