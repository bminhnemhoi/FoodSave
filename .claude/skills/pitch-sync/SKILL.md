---
name: pitch-sync
description: Đồng bộ hồ sơ thuyết trình TISPA 2026 với sản phẩm thật — cập nhật kịch bản demo, slide outline, bộ câu hỏi phản biện, số liệu tác động/KPI, kế hoạch 6 tháng theo tính năng đã hoàn thành và 7 tiêu chí chấm. Dùng sau mỗi mốc M1/M2/M3, trước khi làm deck, hoặc khi Minh chuẩn bị tập dượt.
---

# pitch-sync — sản phẩm và lời thuyết trình luôn khớp nhau

Nguồn: `docs/pitch/` (rubric-mapping, demo-script, qa-phan-bien, ke-hoach-6-thang, mo-hinh-ben-vung, so-lieu-cap-thiet), `docs/ROADMAP.md`, `docs/PRD.md`.

## Quy trình

1. **Kiểm kê tính năng thật:** đọc ROADMAP (task đã tick) và báo cáo gate mới nhất. Chỉ đưa vào pitch những gì **đã chạy trên production**; phần đang làm ghi "lộ trình".
2. **Số liệu:**
   - Lấy KPI và ESG từ trang `/admin` hoặc `/impact` (pilot thật tách riêng khỏi dữ liệu demo `is_demo`).
   - **Không bao giờ trình bày dữ liệu demo như số liệu thật.**
   - Số liệu cấp thiết phải có nguồn và ngày truy cập (`so-lieu-cap-thiet.md`). Không có nguồn thì không dùng.
3. **Cập nhật tài liệu:**
   - `demo-script.md`: các beat demo theo tính năng thật, có phương án dự phòng.
   - `rubric-mapping.md`: bằng chứng cho từng tiêu chí, điểm yếu còn lại.
   - `qa-phan-bien.md`: thêm câu hỏi mới phát sinh từ tính năng hoặc pilot.
   - `ke-hoach-6-thang.md`: điều chỉnh theo thực tế (ngân sách vẫn tổng 75.000.000 đ).
4. **Chấm thử:** gọi agent **judge** để chấm theo 7 tiêu chí (tổng 37), lấy 5 điểm yếu nhất và đề xuất sửa.
5. **Báo cáo cho Minh:** thay đổi chính, điểm chấm thử, việc cần làm trước buổi tập tiếp theo.

## Văn phong pitch

- Tiếng Việt, rõ ràng, có số liệu và nguồn. Mỗi slide một thông điệp.
- Nói thật về giới hạn. Ví dụ: "eKYC khuôn mặt nằm trong lộ trình AWS sau giải", hay "dữ liệu ESG là ước tính theo phương pháp có trích nguồn".
- Đội ngũ: nêu rõ vai trò Minh (phát triển, cùng quy trình kỹ thuật có AI hỗ trợ) và Khanh (kiểm thử, vận hành pilot). Mọi thành viên đều phải trả lời được câu hỏi.
