"use client";

import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { FormState } from "../schemas";

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  const success = state.status === "success";
  const Icon = success ? CircleCheck : CircleAlert;
  return (
    <div
      role={success ? "status" : "alert"}
      className={
        success
          ? "flex gap-3 rounded-lg border border-success/30 bg-success-soft p-4 text-sm text-success"
          : "flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
      }
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>{state.message}</p>
    </div>
  );
}

type TextFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, name, error, hint, id, ...props }: TextFieldProps) {
  const fieldId = id ?? `f-${name}`;
  const describedBy = [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {hint && !error ? (
        <p id={`${fieldId}-hint`} className="text-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={`${fieldId}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} aria-disabled={pending}>
      {pending ? (
        <>
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
