export { default } from "next-auth/middleware";

// Protect all /admin routes — unauthenticated users are redirected to /login
export const config = {
  matcher: ["/admin/:path*"],
};
