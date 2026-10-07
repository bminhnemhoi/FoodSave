import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Nhãn phân loại để log/thống kê (không chứa dữ liệu cá nhân). */
  tag: string;
}

export interface EmailProvider {
  readonly id: "smtp" | "fake";
  send(message: EmailMessage): Promise<{ messageId?: string }>;
}
