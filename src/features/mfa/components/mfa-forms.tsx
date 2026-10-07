"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { CircleAlert, Copy, KeyRound, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";

import { startTotpEnrollment, verifyTotpChallenge, verifyTotpEnrollment } from "../actions";
import { groupSecret, initialMfaState } from "../schemas";

function ErrorNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

/** Ô nhập 6 số (input-otp): dán được, `autocomplete="one-time-code"`, lỗi gắn aria-describedby. */
function OtpField({
  id,
  error,
  autoFocus,
  value,
  onChange,
}: {
  id: string;
  error?: string;
  autoFocus?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const slot = "size-11 text-lg font-semibold tabular-nums sm:size-12";
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className="text-base font-semibold">
        Mã xác thực 6 số
      </FieldLabel>
      <InputOTP
        id={id}
        name="code"
        maxLength={6}
        value={value}
        onChange={onChange}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
        containerClassName="gap-2"
      >
        <InputOTPGroup>
          {[0, 1, 2].map((i) => (
            <InputOTPSlot key={i} index={i} className={slot} aria-invalid={error ? true : undefined} />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator aria-hidden />
        <InputOTPGroup>
          {[3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className={slot} aria-invalid={error ? true : undefined} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        <p id={hintId} className="text-sm text-ink-subtle">
          Mở ứng dụng xác thực và nhập mã đang hiển thị cho FoodSave. Mã đổi sau mỗi 30 giây.
        </p>
      )}
    </Field>
  );
}

function SubmitButton({
  children,
  pendingText,
  pending,
}: {
  children: React.ReactNode;
  pendingText: string;
  pending: boolean;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full sm:w-auto sm:self-start"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
      {pending ? pendingText : children}
    </Button>
  );
}

/**
 * Form mã OTP: gửi xong thì xóa ô nhập (mã sai phải nhập mã mới từ ứng dụng, không sửa từng số).
 * FormData được lấy lúc gửi nên việc xóa không ảnh hưởng mã đã gửi.
 */
function useOtpForm(serverAction: typeof verifyTotpChallenge) {
  const [state, dispatch, pending] = useActionState(serverAction, initialMfaState);
  const [code, setCode] = useState("");
  const formAction = (fd: FormData) => {
    setCode("");
    dispatch(fd);
  };
  return { state, formAction, pending, code, setCode };
}

/** Nhập mã cho phiên aal1 khi Admin đã có ứng dụng xác thực. */
export function MfaChallengeForm({ next }: { next: string }) {
  const { state, formAction, pending, code, setCode } = useOtpForm(verifyTotpChallenge);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <ErrorNotice message={state.message} />
      <input type="hidden" name="next" value={next} />
      <OtpField id="mfa-code" error={state.fieldError} autoFocus value={code} onChange={setCode} />
      <SubmitButton pendingText="Đang xác thực…" pending={pending}>
        Xác thực
      </SubmitButton>
    </form>
  );
}

type Enrollment = { factorId: string; qrCode: string; secret: string };

/** Đăng ký TOTP lần đầu: tạo mã QR → quét (hoặc nhập khóa) → nhập mã đầu tiên. */
export function MfaEnrollPanel({ next }: { next: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [startError, setStartError] = useState<string>();
  const [starting, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const { state, formAction, pending, code, setCode } = useOtpForm(verifyTotpEnrollment);

  const start = () =>
    startTransition(async () => {
      setStartError(undefined);
      const res = await startTotpEnrollment();
      if (res.ok) setEnrollment(res);
      else setStartError(res.message);
    });

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ol className="flex flex-col gap-6">
      <li className="flex flex-col gap-3 rounded-xl border bg-surface p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-7 place-items-center rounded-full bg-role-accent-soft text-sm text-role-accent">
            1
          </span>
          Cài ứng dụng xác thực
        </h2>
        <p className="text-ink-muted">
          Dùng Google Authenticator, Microsoft Authenticator hoặc ứng dụng TOTP bất kỳ trên điện thoại của
          bạn. Mỗi Admin dùng một thiết bị riêng.
        </p>
      </li>

      <li className="flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-7 place-items-center rounded-full bg-role-accent-soft text-sm text-role-accent">
            2
          </span>
          Thêm FoodSave vào ứng dụng
        </h2>
        <ErrorNotice message={startError} />
        {enrollment ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG do Supabase sinh, không tối ưu qua next/image */}
            <img
              src={enrollment.qrCode}
              alt="Mã QR để thêm tài khoản FoodSave vào ứng dụng xác thực"
              width={184}
              height={184}
              className="size-46 shrink-0 rounded-lg border bg-white p-2"
            />
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-ink-muted">
                Mở ứng dụng, chọn thêm tài khoản và quét mã QR. Không quét được? Nhập khóa bí mật dưới đây
                (loại “dựa trên thời gian”).
              </p>
              <p className="text-sm font-medium" id="mfa-secret-label">
                Khóa bí mật
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  aria-labelledby="mfa-secret-label"
                  data-testid="mfa-secret"
                  className="rounded-md border bg-bg-sunken px-3 py-2 font-mono text-base tracking-wider break-all text-ink"
                >
                  {groupSecret(enrollment.secret)}
                </code>
                <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={copySecret}>
                  <Copy aria-hidden />
                  {copied ? "Đã chép" : "Chép khóa"}
                </Button>
              </div>
              <p className="text-sm text-ink-subtle" role="status">
                {copied ? "Đã chép khóa bí mật vào bộ nhớ tạm." : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-ink-muted">
              FoodSave tạo một mã QR riêng cho tài khoản của bạn. Không chia sẻ mã này với người khác.
            </p>
            <Button
              type="button"
              onClick={start}
              disabled={starting}
              aria-disabled={starting}
              className="min-h-11"
            >
              {starting ? <Loader2 aria-hidden className="animate-spin" /> : <QrCode aria-hidden />}
              {starting ? "Đang tạo mã QR…" : "Tạo mã QR"}
            </Button>
          </div>
        )}
      </li>

      <li className="flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-7 place-items-center rounded-full bg-role-accent-soft text-sm text-role-accent">
            3
          </span>
          Nhập mã để hoàn tất
        </h2>
        {enrollment ? (
          <form action={formAction} className="flex flex-col gap-5" noValidate>
            <ErrorNotice message={state.message} />
            <input type="hidden" name="factorId" value={enrollment.factorId} />
            <input type="hidden" name="next" value={next} />
            <OtpField id="mfa-enroll-code" error={state.fieldError} value={code} onChange={setCode} />
            <SubmitButton pendingText="Đang xác thực…" pending={pending}>
              Xác nhận và vào khu vực quản trị
            </SubmitButton>
          </form>
        ) : (
          <p className="flex items-start gap-2 text-ink-muted">
            <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
            Sau khi thêm FoodSave vào ứng dụng, nhập mã 6 số để xác nhận thiết lập.
          </p>
        )}
      </li>
    </ol>
  );
}
