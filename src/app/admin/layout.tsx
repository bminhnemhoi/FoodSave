import { BodyRole } from "@/components/layout/body-role";
import { requireAdmin } from "@/server/auth/guards";

/**
 * Khu vực Admin: `profiles.platform_role = 'admin'` (từ DB), nếu không ⇒ 404.
 * Yêu cầu MFA (aal2) do layout nhóm `(console)` kiểm tra để trang /admin/mfa vẫn vào được.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin({ allowAal1: true });
  return (
    <div data-role="admin" className="flex flex-1 flex-col">
      <BodyRole role="admin" />
      {children}
    </div>
  );
}
