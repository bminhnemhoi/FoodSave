import { notFound, redirect } from "next/navigation";

import { isOrgKind } from "@/features/onboarding/options";
import { resumeStep, snapshotOf } from "@/features/onboarding/progress";
import { loadWizard } from "@/features/onboarding/queries";

/** /onboarding/store | /onboarding/charity ⇒ mở đúng bước đang làm dở (US-STO-01 AC1). */
export default async function OnboardingKindPage(props: PageProps<"/onboarding/[kind]">) {
  const { kind } = await props.params;
  if (!isOrgKind(kind)) notFound();
  const data = await loadWizard(kind);
  redirect(`/onboarding/${kind}/${resumeStep(kind, snapshotOf(data))}`);
}
