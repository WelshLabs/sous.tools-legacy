import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import {
  SupabaseService,
  supabase as globalSupabase,
} from "../database/supabase";
import { ClsService } from "nestjs-cls";

const COOKIE_NAME = "sb-access-token";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Optional() private readonly supabaseService?: SupabaseService,
    @Optional() private readonly cls?: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Try to get the HTTP request for GraphQL or standard HTTP contexts.
    const gqlCtx = GqlExecutionContext.create(context).getContext?.();
    const request =
      (context.getType() as string) === "graphql"
        ? (gqlCtx?.req || gqlCtx)
        : context.switchToHttp().getRequest();

    if (!request) {
      throw new UnauthorizedException("No request context found");
    }

    let token: string | undefined;

    // 1) Standard Authorization header on HTTP requests
    const authHeader = request.headers?.authorization as string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // 2) GraphQL websocket connectionParams may provide headers or auth object
    if (!token && gqlCtx) {
      const connParams = (gqlCtx.connectionParams as any) || gqlCtx.connection || gqlCtx.extra;
      const cpHeaders = connParams?.headers || connParams?.authorization || connParams;
      const cpAuthToken =
        (cpHeaders?.Authorization || cpHeaders?.authorization || cpHeaders?.auth?.token) as
          | string
          | undefined;
      if (cpAuthToken) {
        if (cpAuthToken.startsWith("Bearer ")) token = cpAuthToken.split(" ")[1];
        else token = cpAuthToken;
      }
    }

    // 3) Cookie-based token (HTTP cookies or passed cookie header string)
    if (!token && request.cookies?.[COOKIE_NAME]) {
      token = request.cookies[COOKIE_NAME] as string;
    } else if (!token && typeof request.headers?.cookie === "string") {
      const match = request.headers.cookie.match(
        new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
      );
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (!token) {
      throw new UnauthorizedException("No authentication token provided");
    }

    const client = this.supabaseService?.client || globalSupabase;
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    request.user = user;

    let orgId =
      user.user_metadata?.organization_id ||
      user.app_metadata?.organization_id ||
      request.headers?.["x-org-id"] ||
      request.headers?.["x-organization-id"] ||
      request.query?.orgId;

    if (!orgId && user.id) {
      const { data: member } = await client
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (member?.organization_id) {
        orgId = member.organization_id;
        user.user_metadata = user.user_metadata || {};
        user.user_metadata.organization_id = orgId;
      }
    }

    if (orgId && this.cls) {
      this.cls.set("orgId", orgId);
    }
    if (user.id && this.cls) {
      this.cls.set("userId", user.id);
    }

    return true;
  }
}
