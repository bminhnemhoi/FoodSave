import { AppShell } from "@/components/layout/app-shell";
import { PolicyReconsent } from "@/features/policy/components/policy-reconsent";
import { requireVolunteer } from "@/server/auth/guards";

/** PWA tình nguyện viên: cần vai trò `volunteer` đang hoạt động tại tổ chức đã duyệt. */
export default async function VolunteerLayout({ children }: LayoutProps<"/volunteer">) {
  const { profile, membership } = await requireVolunteer();
  return (
    <AppShell
      role="volunteer"
      user={{ name: profile.fullName, email: profile.email }}
      orgName={membership.org.name}
      isDemo={profile.isDemo || membership.org.isDemo}
    >
      <PolicyReconsent userId={profile.id} />
      {children}
    </AppShell>
  );
}
