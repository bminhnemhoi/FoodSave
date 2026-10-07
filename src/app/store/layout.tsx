import { AppShell } from "@/components/layout/app-shell";
import { requirePortal } from "@/server/auth/guards";

/** Cổng Cửa hàng: chỉ owner/manager/staff của cửa hàng đã duyệt (vai trò đọc từ DB). */
export default async function StoreLayout({ children }: LayoutProps<"/store">) {
  const { profile, membership } = await requirePortal("store");
  return (
    <AppShell
      role="store"
      user={{ name: profile.fullName, email: profile.email }}
      orgName={membership.org.name}
      isDemo={profile.isDemo || membership.org.isDemo}
    >
      {children}
    </AppShell>
  );
}
