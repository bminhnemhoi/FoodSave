import { AppShell } from "@/components/layout/app-shell";
import { requirePortal } from "@/server/auth/guards";

/** Cổng Tổ chức: chỉ owner/manager/staff của tổ chức đã duyệt (vai trò đọc từ DB). */
export default async function CharityLayout({ children }: LayoutProps<"/charity">) {
  const { profile, membership } = await requirePortal("charity");
  return (
    <AppShell
      role="charity"
      user={{ name: profile.fullName, email: profile.email }}
      orgName={membership.org.name}
      isDemo={profile.isDemo || membership.org.isDemo}
    >
      {children}
    </AppShell>
  );
}
