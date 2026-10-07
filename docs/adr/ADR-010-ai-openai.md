# ADR-010: Nhà cung cấp AI mặc định là OpenAI (gpt-5.4-mini / gpt-5.4-nano)

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Thay thế một phần:** phần "AI Claude → Bedrock" trong ADR-003 (adapter vẫn giữ nguyên)

## Bối cảnh

Nhóm đã có tài khoản OpenAI API, chưa có tài khoản Anthropic hay AWS. Các tính năng AI của FoodSave đều nằm sau feature flag và đều có đường dự phòng không cần AI:
- ảnh → tự điền lô hàng
- trích xuất giấy tờ
- kiểm tra mô tả minh chứng
- nhận xét báo cáo ESG

## Quyết định

- `AI_PROVIDER` hỗ trợ `openai | anthropic | bedrock | fake`. **Mặc định: `openai`.**
- **Model:**
  - `AI_MODEL=gpt-5.4-mini`: tác vụ có ảnh (đọc nhãn sản phẩm, giấy tờ), trích xuất JSON có cấu trúc.
  - `AI_MODEL_LIGHT=gpt-5.4-nano`: tác vụ văn bản nhẹ (kiểm tra mô tả minh chứng, nhận xét ESG ngắn).
- **Gọi API:** dùng Responses API với structured output (JSON schema). Đầu ra luôn được validate bằng zod trước khi dùng. Mọi lời gọi đi qua `src/server/providers/ai/`, chỉ chạy phía server.
- **Chi phí:** giới hạn bằng `rate_limits` (theo người dùng và tổ chức), ảnh được thu nhỏ ≤ 1024 px trước khi gửi, không gửi ảnh minh chứng chưa làm mờ.
- **Trạng thái tài khoản (07/10/2026):** key hợp lệ nhưng **hết credit**. `ai_enabled=false` cho tới khi nạp credit.

## Hệ quả

- **Tích cực:** dùng được ngay tài khoản sẵn có; model mini/nano rẻ; adapter giữ đường chuyển sang Bedrock (Claude) khi có AWS.
- **Tiêu cực:**
  - Dữ liệu ảnh được gửi tới nhà xử lý nước ngoài. Cần ghi trong chính sách bảo mật và danh mục chuyển dữ liệu ra nước ngoài (SECURITY-PRIVACY).
  - Key đã lộ trong hội thoại, cần xoay vòng (rotate) sau chung kết.

## Phương án đã cân nhắc

- **Anthropic API / Bedrock:** chất lượng tiếng Việt và vision tốt nhưng nhóm chưa có tài khoản. Giữ làm provider thay thế.
- **Không dùng AI:** an toàn nhưng mất điểm "ứng dụng công nghệ" và mất khoảnh khắc demo ấn tượng nhất.
