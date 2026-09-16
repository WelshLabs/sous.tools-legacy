import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import {
  SupabaseService,
  supabase as globalSupabase,
} from "../database/supabase";
import { WsException } from "@nestjs/websockets";

@Injectable()
export class WsSupabaseAuthGuard implements CanActivate {
  constructor(@Optional() private readonly supabaseService?: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    let token =
      client.handshake?.auth?.token || client.handshake?.headers?.authorization;

    if (token && token.startsWith("Bearer ")) {
      token = token.split(" ")[1];
    }

    if (!token && client.handshake?.headers?.cookie) {
      const match = client.handshake.headers.cookie.match(
        /sb-access-token=([^;]+)/,
      );
      if (match) {
        token = match[1];
      }
    }

    if (!token) {
      throw new WsException("Unauthorized: No token provided");
    }

    const supabaseClient = this.supabaseService?.client || globalSupabase;
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      throw new WsException("Unauthorized: Invalid or expired token");
    }

    client.user = user;
    if (!user.user_metadata?.organization_id && user.id) {
      const { data: member } = await supabaseClient
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (member?.organization_id) {
        user.user_metadata = user.user_metadata || {};
        user.user_metadata.organization_id = member.organization_id;
      }
    }
    return true;
  }
}
