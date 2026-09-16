import { Public } from "../../core/decorators/public.decorator";
import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  UnauthorizedException,
  BadRequestException,
  Query,
} from "@nestjs/common";
import type { Response, Request } from "express";

import {
  ApiTags,
  ApiBody,
  ApiResponse as NestjsApiResponse,
  ApiProperty,
} from "@nestjs/swagger";

import {
  type ApiResponse,
  LoginSchema,
  ForgotPasswordSchema,
} from "@soustools/api-types";

import { supabase } from "../../core/database/supabase";

import { serverConfig as config } from "@soustools/config/server";

export const ACCESS_TOKEN_COOKIE = "sb-access-token";
export const REFRESH_TOKEN_COOKIE = "sb-refresh-token";

/**
 * Returns cookie options appropriate for the current environment.
 *
 * KEY RULE: `clearCookie` MUST be called with the same `domain`, `path`,
 * `secure`, and `sameSite` values that were used when the cookie was set,
 * otherwise the browser will not match and delete the cookie.
 *
 * In production (behind Traefik on *.sous.tools) we set `Domain: .sous.tools`
 * so the same cookie is visible to both `app.sous.tools` and `api.sous.tools`.
 * In development we omit `domain` so the cookie is scoped to localhost.
 */
export const getCookieOptions = (req?: Request) => {
  let isSecureEnv =
    config.IS_PRODUCTION ||
    config.IS_SECURE_ENV ||
    config.NODE_ENV === "staging";

  // Dynamically detect secure if possible
  if (req) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    if (proto === "https") {
      isSecureEnv = true;
    } else if (proto === "http" && !config.IS_PRODUCTION) {
      // If we are definitely on HTTP and not strictly production, don't force secure
      // to avoid browsers silently dropping the cookie.
      isSecureEnv = false;
    }
  }

  let domain: string | undefined = undefined;
  if (req) {
    const host = req.get("host") || req.hostname || "";
    // Only set domain=.sous.tools if we are actually on a sous.tools subdomain
    // and not localhost or an IP address.
    if (host.includes("sous.tools") && !host.includes("localhost")) {
      domain = ".sous.tools";
    }
  }

  return {
    httpOnly: true,
    secure: isSecureEnv,
    sameSite: "lax" as const,
    path: "/",
    ...(domain ? { domain } : {}),
  };
};

/** Applies both access and refresh token cookies from a Supabase session. */
export const setSessionCookies = (
  res: Response,
  session: { access_token: string; refresh_token: string; expires_in: number },
  req?: Request,
) => {
  const options = getCookieOptions(req);
  res.cookie(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...options,
    maxAge: session.expires_in * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, session.refresh_token, {
    ...options,
    maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
  });
};

// ── Swagger DTOs ──────────────────────────────────────────────────────────────

class LoginDto {
  @ApiProperty()
  email!: string;
  @ApiProperty()
  password!: string;
}

class ForgotPasswordDto {
  @ApiProperty()
  email!: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  // ── Email / Password ──────────────────────────────────────────────────────

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @NestjsApiResponse({
    status: 200,
    description: "Success",
    schema: { type: "object", additionalProperties: true },
  })
  async login(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<{ user: Record<string, unknown> }>> {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnauthorizedException("Invalid request body");
    }

    const { email, password } = parsed.data;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException("Invalid email or password");
    }

    setSessionCookies(res, data.session, req);

    return {
      success: true,
      data: { user: data.user as unknown as Record<string, unknown> },
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  @NestjsApiResponse({
    status: 200,
    description: "Success",
    schema: { type: "object", additionalProperties: true },
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<null>> {
    const refreshToken = (req.cookies as Record<string, string>)?.[
      REFRESH_TOKEN_COOKIE
    ];
    if (!refreshToken) {
      throw new UnauthorizedException("No refresh token found");
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException("Session refresh failed");
    }

    setSessionCookies(res, data.session, req);

    return {
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  @NestjsApiResponse({
    status: 200,
    description: "Success",
    schema: { type: "object", additionalProperties: true },
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<null>> {
    const accessToken = (req.cookies as Record<string, string>)?.[
      ACCESS_TOKEN_COOKIE
    ];
    if (accessToken) {
      try {
        await supabase.auth.admin.signOut(accessToken);
      } catch {
        // Non-fatal
      }
    }

    const options = getCookieOptions(req);
    res.clearCookie(ACCESS_TOKEN_COOKIE, options);
    res.clearCookie(REFRESH_TOKEN_COOKIE, options);

    return {
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get("session")
  @NestjsApiResponse({
    status: 200,
    description: "Success",
    schema: { type: "object", additionalProperties: true },
  })
  async getSession(
    @Req() req: Request,
  ): Promise<ApiResponse<{ user: Record<string, unknown> | null }>> {
    const token = (req.cookies as Record<string, string>)?.[
      ACCESS_TOKEN_COOKIE
    ];
    if (!token) {
      return {
        success: true,
        data: { user: null },
        timestamp: new Date().toISOString(),
      };
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return {
        success: true,
        data: { user: null },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: { user: data.user as unknown as Record<string, unknown> },
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Post("ws-ticket")
  @HttpCode(200)
  @NestjsApiResponse({
    status: 200,
    description: "Success",
    schema: { type: "object", additionalProperties: true },
  })
  async getWsTicket(
    @Req() req: Request,
  ): Promise<ApiResponse<{ token: string | null }>> {
    const token = (req.cookies as Record<string, string>)?.[
      ACCESS_TOKEN_COOKIE
    ];
    return {
      success: true,
      data: { token: token || null },
      timestamp: new Date().toISOString(),
    };
  }

  // ── Forgot Password ───────────────────────────────────────────────────────

  /**
   * Accepts an email address and triggers a Supabase password-reset email.
   * Always returns success (200) to prevent user enumeration — the caller
   * should display "check your inbox" regardless of whether the address exists.
   */
  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  @ApiBody({ type: ForgotPasswordDto })
  @NestjsApiResponse({
    status: 200,
    description: "Reset email sent (or silently skipped if user not found)",
    schema: { type: "object", additionalProperties: true },
  })
  async forgotPassword(
    @Body() body: Record<string, unknown>,
  ): Promise<ApiResponse<null>> {
    const parsed = ForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("A valid email address is required");
    }

    const redirectTo = `${config.NEXT_PUBLIC_APP_URL}/reset-password`;

    // Fire-and-forget: we intentionally swallow errors to prevent user enumeration.
    try {
      await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo,
      });
    } catch {
      // Silently swallowed — do not leak whether the address exists.
    }

    return {
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────

  /**
   * Initiates a Supabase OAuth sign-in for Google.
   * The browser is redirected to Google's consent screen; after approval
   * Google redirects back to GET /auth/callback which exchanges the code
   * for a session and sets HttpOnly cookies.
   */
  @Public()
  @Get("google")
  @NestjsApiResponse({ status: 302, description: "Redirect to Google OAuth" })
  async googleOAuth(@Res() res: Response): Promise<void> {
    return this.initiateOAuth(res, "google");
  }

  /**
   * Initiates a Supabase OAuth sign-in for GitHub.
   * The browser is redirected to GitHub's consent screen; after approval
   * GitHub redirects back to GET /auth/callback which exchanges the code
   * for a session and sets HttpOnly cookies.
   */
  @Public()
  @Get("github")
  @NestjsApiResponse({ status: 302, description: "Redirect to GitHub OAuth" })
  async githubOAuth(@Res() res: Response): Promise<void> {
    return this.initiateOAuth(res, "github");
  }

  /**
   * OAuth callback — receives the authorization code from Supabase after the
   * user consents on the provider's screen. Exchanges the code for a full
   * Supabase session, writes HttpOnly cookies, then redirects the user to
   * the Next.js app.
   *
   * The `redirectTo` passed during initiation must match the value registered
   * in the Supabase dashboard under Authentication → URL Configuration →
   * Redirect URLs.
   */
  @Public()
  @Get("callback")
  @NestjsApiResponse({
    status: 302,
    description: "Exchange OAuth code for session and redirect to app",
  })
  async oauthCallback(
    @Query("code") code: string,
    @Query("error") oauthError: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Surface provider-level errors back to the login page.
    if (oauthError || !code) {
      const errorMsg = encodeURIComponent(
        oauthError ?? "OAuth sign-in was cancelled or failed.",
      );
      res.redirect(`${config.NEXT_PUBLIC_APP_URL}/login?error=${errorMsg}`);
      return;
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      const errorMsg = encodeURIComponent(
        "Failed to complete OAuth sign-in. Please try again.",
      );
      res.redirect(`${config.NEXT_PUBLIC_APP_URL}/login?error=${errorMsg}`);
      return;
    }

    setSessionCookies(res, data.session, req);

    // Redirect the browser to the main app — the HttpOnly session cookies are
    // now set and the Next.js app will detect the active session on the next
    // page load.
    res.redirect(`${config.NEXT_PUBLIC_APP_URL}/home`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async initiateOAuth(
    res: Response,
    provider: "google" | "github",
  ): Promise<void> {
    const callbackUrl = `${config.NEXT_PUBLIC_API_URL}/auth/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
        // Skip the browser prompt on re-auth when a valid session already exists.
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      throw new UnauthorizedException(
        `Failed to initiate ${provider} OAuth flow`,
      );
    }

    res.redirect(data.url);
  }
}
