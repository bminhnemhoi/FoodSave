import "server-only";

import { z } from "zod";

import type { ProviderCallOptions } from "../types";

export interface ImageInput {
  mediaType: "image/jpeg" | "image/webp" | "image/png";
  base64: string;
}
export type PdfInput = { mediaType: "application/pdf"; base64: string };

export const OFFER_UNITS = ["piece", "loaf", "box", "portion", "bottle", "bag", "kg", "liter"] as const;

/** Schema đầu ra — dùng cả để sinh JSON Schema cho structured output lẫn để parse lại (ARCHITECTURE §7.3). */
export const offerDraftSchema = z.strictObject({
  title: z.string().min(1).max(120),
  categoryCode: z.string().nullable(),
  quantity: z.number().positive().max(100_000).nullable(),
  unit: z.enum(OFFER_UNITS).nullable(),
  unitWeightKg: z.number().positive().max(1_000).nullable(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  notes: z.string().max(500).nullable(),
  confidence: z.number().min(0).max(1),
});
export type OfferDraftFields = z.infer<typeof offerDraftSchema>;

export const orgDocumentSchema = z.strictObject({
  legalName: z.string().max(300).nullable(),
  registrationNo: z.string().max(100).nullable(),
  taxCode: z.string().max(20).nullable(),
  issuedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  confidence: z.number().min(0).max(1),
});
export type OrgDocumentFields = z.infer<typeof orgDocumentSchema>;

export const proofReviewSchema = z.strictObject({
  consistent: z.boolean(),
  flags: z.array(z.enum(["vague", "quantity_mismatch", "possible_pii", "off_topic"])),
  noteVi: z.string().max(500),
});
export type ProofTextReview = z.infer<typeof proofReviewSchema>;

export const esgSummarySchema = z.strictObject({ summaryVi: z.string().min(1).max(1200) });

export type AiFailureReason =
  "disabled" | "refused" | "invalid_output" | "timeout" | "rate_limited" | "provider_error";

export type AiResult<T> =
  | {
      ok: true;
      data: T;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      latencyMs: number;
    }
  | { ok: false; reason: AiFailureReason; message?: string };

export type OfferCategoryHint = { code: string; nameVi: string; defaultUnit: string };

export interface AiProvider {
  readonly id: "openai" | "anthropic" | "bedrock" | "fake";
  extractOfferFromPhoto(
    input: { image: ImageInput; categories: OfferCategoryHint[] },
    opts?: ProviderCallOptions,
  ): Promise<AiResult<OfferDraftFields>>;
  extractOrgDocument(
    input: { file: ImageInput | PdfInput },
    opts?: ProviderCallOptions,
  ): Promise<AiResult<OrgDocumentFields>>;
  reviewProofText(
    input: { descriptionVi: string; peopleServed: number; items: { categoryCode: string; kg: number }[] },
    opts?: ProviderCallOptions,
  ): Promise<AiResult<ProofTextReview>>;
  summarizeEsg(
    input: { orgKind: "store" | "charity"; month: string; metrics: Record<string, number> },
    opts?: ProviderCallOptions,
  ): Promise<AiResult<{ summaryVi: string }>>;
}
