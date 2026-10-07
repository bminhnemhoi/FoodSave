import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { WizardShell } from "@/features/onboarding/components/wizard-shell";
import { isOrgKind, KIND_COPY } from "@/features/onboarding/options";
import { computeProgress, isStepKey, snapshotOf, stepTitle } from "@/features/onboarding/progress";
import { loadWizard } from "@/features/onboarding/queries";
import { getViewerContext } from "@/server/auth/guards";

export async function generateMetadata(props: PageProps<"/onboarding/[kind]/[step]">): Promise<Metadata> {
  const { kind, step } = await props.params;
  if (!isOrgKind(kind) || !isStepKey(step)) return { title: "Hồ sơ" };
  return { title: `${stepTitle(kind, step)} · ${KIND_COPY[kind].wizardTitle}` };
}

/**
 * Wizard onboarding cửa hàng/tổ chức (P1-02…P1-07, F-03, F-04). Mỗi bước là một URL để mở lại đúng chỗ;
 * dữ liệu luôn nạp mới từ DB (client Supabase của người dùng).
 */
export default async function OnboardingStepPage(props: PageProps<"/onboarding/[kind]/[step]">) {
  const { kind, step } = await props.params;
  if (!isOrgKind(kind) || !isStepKey(step)) notFound();

  const [{ profile }, data] = await Promise.all([
    getViewerContext(`/onboarding/${kind}/${step}`),
    loadWizard(kind),
  ]);
  // Chưa có nháp ⇒ chỉ bước 1 (tạo nháp khi lưu lần đầu)
  if (!data.org && step !== "basics") redirect(`/onboarding/${kind}/basics`);

  return (
    <WizardShell
      key={data.renderId}
      data={data}
      step={step}
      steps={computeProgress(kind, snapshotOf(data))}
      accountEmail={profile.email}
    />
  );
}
