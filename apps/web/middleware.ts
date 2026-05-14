import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/public"];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public routes
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Allow Next.js internals and static files
    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.includes(".")
    ) {
        return NextResponse.next();
    }

    // The access token now lives in an HttpOnly cookie set by the API at
    // /auth/login (see apps/api/src/modules/auth/module.routes.ts). The old
    // client-set cookie `crm:access_token` is kept as a fallback so users
    // logged in before the migration aren't bounced — purge it on next login.
    const token =
        request.cookies.get("crm_access_token")?.value ??
        request.cookies.get("crm:access_token")?.value;

    if (!token) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
