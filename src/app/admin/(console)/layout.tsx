import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/server/auth/guards";

/** Bảng điều khiển Admin: bắt buộc phiên aal2 (F-62); chưa đạt ⇒ /admin/mfa. */
export default async function AdminConsoleLayout({ children }: LayoutProps<"/admin">) {
  const { profile } = await requireAdmin();
  return (
    <AppShell role="admin" user={{ name: profile.fullName, email: profile.email }} isDemo={profile.isDemo}>
      {children}
    </AppShell>
  );
}
