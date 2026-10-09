import { cn } from "@/lib/utils";

export const REGISTER_STORE = "/register?next=%2Fonboarding%2Fstore";
export const REGISTER_CHARITY = "/register?next=%2Fonboarding%2Fcharity";

/** Tiêu đề khối landing: eyebrow + h2 `font-display` + đoạn dẫn. `tone="dark"` cho mảng tối. */
export function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  tone = "light",
  className,
}: {
  id: string;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", className)}>
      <p
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          tone === "dark" ? "text-brand-mint" : "text-primary",
        )}
      >
        {eyebrow}
      </p>
      <h2
        id={id}
        className={cn(
          "font-display text-[clamp(1.875rem,4vw,2.75rem)] leading-[1.12] font-extrabold text-balance",
          tone === "dark" && "text-on-deep",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <p className={cn("text-lg text-pretty", tone === "dark" ? "text-on-deep-muted" : "text-ink-muted")}>
          {lead}
        </p>
      ) : null}
    </div>
  );
}
