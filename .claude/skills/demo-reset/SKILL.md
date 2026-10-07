---
name: demo-reset
description: Đưa môi trường demo/production về trạng thái demo chuẩn trước buổi trình bày hoặc sau khi giám khảo thử — chỉ xóa và tạo lại dữ liệu của tổ chức is_demo, không đụng dữ liệu pilot thật. Dùng trước mỗi buổi tập dượt, trước chung kết, hoặc khi dữ liệu demo bị rối.
disable-model-invocation: true
---

# demo-reset — reset dữ liệu demo an toàn

> Skill này chỉ chạy khi Minh gọi trực tiếp (`/demo-reset`). Nó thay đổi dữ liệu trên môi trường được chọn.

## Quy trình

1. **Xác nhận môi trường đích** (local / staging / production) với Minh. Production chỉ được reset trong cửa sổ đã thống nhất.
2. **Kiểm tra an toàn:** đếm dữ liệu sẽ bị ảnh hưởng. **Chỉ** các bản ghi thuộc tổ chức `is_demo = true` cùng dữ liệu phụ thuộc (lô, phân bổ, chuyến, bàn giao, minh chứng, ledger demo).
   ```sql
   select count(*) from organizations where is_demo;           -- phải > 0
   select count(*) from organizations where not is_demo;       -- ghi lại, sau reset phải giữ nguyên
   ```
3. **Chạy reset:**
   - **Local:** `pnpm demo:reset`.
   - **Môi trường cloud:** dùng nút "Reset demo" trong `/admin/demo`. Nút này gọi RPC `admin_reset_demo()`, yêu cầu admin aal2 và ghi `audit_logs`.
   - **Không** chạy SQL tay trên production.
4. **Seed lại** theo skill `seed-demo` (thời gian tương đối).
5. **Kiểm tra sau reset:**
   - Số tổ chức thật (`not is_demo`) không đổi.
   - Đăng nhập được 4 tài khoản demo + tài khoản giám khảo.
   - Kho tặng có đủ 3 nhãn; kịch bản 50 bánh chạy được; trang ESG có số liệu.
6. Báo Minh kết quả (số bản ghi xóa/tạo, thời điểm, các kiểm tra đã qua).

## Trước buổi demo (checklist)

- [ ] Reset xong trong vòng 2 giờ trước giờ trình bày.
- [ ] Laptop đăng nhập vai cửa hàng/admin; điện thoại đăng nhập vai tổ chức/TNV (PWA đã cài).
- [ ] Có ít nhất 1 lô sắp chuyển Đỏ để demo đếm ngược.
- [ ] Video dự phòng mở sẵn ở tab khác.
