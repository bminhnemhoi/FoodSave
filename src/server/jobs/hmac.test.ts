import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MAX_SKEW_SECONDS, signJobRequest, verifyJobSignature } from "./hmac";

const SECRET = "test-only-secret-0123456789abcdef";
const NOW_MS = 1_791_500_000_000;
const TS = String(Math.floor(NOW_MS / 1000));
// Đúng dạng pg_net gửi: văn bản jsonb chuẩn của Postgres (có khoảng trắng sau dấu hai chấm).
const BODY = '{"job": "dispatch", "source": "cron"}';

describe("chữ ký job (HMAC-SHA256)", () => {
  it("khớp với cách Postgres ký: hex(HMAC(secret, ts + '.' + body))", () => {
    const expected = createHmac("sha256", SECRET).update(`${TS}.${BODY}`).digest("hex");
    expect(signJobRequest(SECRET, TS, BODY)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it("chấp nhận chữ ký hợp lệ (cả chữ hoa hex)", () => {
    const signature = signJobRequest(SECRET, TS, BODY);
    expect(
      verifyJobSignature({ secret: SECRET, timestamp: TS, signature, rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({
      ok: true,
    });
    expect(
      verifyJobSignature({
        secret: SECRET,
        timestamp: TS,
        signature: signature.toUpperCase(),
        rawBody: BODY,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(true);
  });

  it("từ chối body bị sửa (dù chỉ một khoảng trắng)", () => {
    const signature = signJobRequest(SECRET, TS, BODY);
    expect(
      verifyJobSignature({
        secret: SECRET,
        timestamp: TS,
        signature,
        rawBody: '{"job":"dispatch","source":"cron"}',
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("từ chối timestamp bị sửa (chữ ký gắn với timestamp)", () => {
    const signature = signJobRequest(SECRET, TS, BODY);
    const other = String(Number(TS) - 10);
    expect(
      verifyJobSignature({ secret: SECRET, timestamp: other, signature, rawBody: BODY, nowMs: NOW_MS }).ok,
    ).toBe(false);
  });

  it("từ chối secret khác", () => {
    const signature = signJobRequest("another-secret-0123456789abcdef", TS, BODY);
    expect(
      verifyJobSignature({ secret: SECRET, timestamp: TS, signature, rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("từ chối request cũ hơn hoặc lệch tương lai quá 5 phút (chống phát lại)", () => {
    const old = String(Number(TS) - MAX_SKEW_SECONDS - 1);
    const future = String(Number(TS) + MAX_SKEW_SECONDS + 1);
    for (const ts of [old, future]) {
      const signature = signJobRequest(SECRET, ts, BODY);
      expect(
        verifyJobSignature({ secret: SECRET, timestamp: ts, signature, rawBody: BODY, nowMs: NOW_MS }),
      ).toEqual({ ok: false, reason: "stale" });
    }
    const edge = String(Number(TS) - MAX_SKEW_SECONDS);
    expect(
      verifyJobSignature({
        secret: SECRET,
        timestamp: edge,
        signature: signJobRequest(SECRET, edge, BODY),
        rawBody: BODY,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(true);
  });

  it("từ chối khi thiếu header, thiếu secret hoặc header sai định dạng", () => {
    const signature = signJobRequest(SECRET, TS, BODY);
    expect(
      verifyJobSignature({ secret: SECRET, timestamp: null, signature, rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    expect(
      verifyJobSignature({ secret: SECRET, timestamp: TS, signature: null, rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    expect(
      verifyJobSignature({ secret: undefined, timestamp: TS, signature, rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({
      ok: false,
      reason: "missing_secret",
    });
    expect(
      verifyJobSignature({ secret: SECRET, timestamp: "12ab", signature, rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({ ok: false, reason: "bad_timestamp" });
    expect(
      verifyJobSignature({ secret: SECRET, timestamp: TS, signature: "zz", rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({ ok: false, reason: "bad_signature" });
    expect(
      verifyJobSignature({
        secret: SECRET,
        timestamp: TS,
        signature: signature.slice(0, 62),
        rawBody: BODY,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });
});
