/**
 * Staff Centre is an authenticated operational area. Every child route must
 * be rendered from the request that opened it, rather than reusing a cached
 * route segment that may have been generated before the pilot signed in.
 *
 * This is deliberately scoped to /staff: public pages can retain their normal
 * caching behaviour while each Staff Centre tile resolves the same current
 * BAV account and permission record as the Staff Centre home page.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
