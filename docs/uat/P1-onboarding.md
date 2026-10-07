# UAT P1 — Onboarding & Tin cậy

> **Mục tiêu phase:** đăng ký, đăng nhập, hồ sơ cửa hàng/tổ chức, Admin duyệt (có MFA), trang pháp lý. Đóng các lỗi cũ L1–L5, B1–B8 ở phần liên quan.
> **Môi trường:** staging · **Thời lượng:** khoảng 1,5 giờ · **Cần:** 💻 + 🍎 hoặc 🤖 · Hướng dẫn chung: [README.md](README.md)
> **Chuẩn bị:** 2 email mới cho `[MOI]` (ví dụ `tenban+uat-ch@gmail.com` và `tenban+uat-tc@gmail.com`), app xác thực trên điện thoại, 1 file PDF bất kỳ (giả làm giấy phép), 1 ảnh chụp bằng điện thoại có bật vị trí.

**Người chạy:** Khanh · **Ngày:** ___/___ · **Bản (commit/tag):** ______

---

## A. Trang công khai (khách chưa đăng nhập)

- [ ] **P1-01** 💻 Mở `https://staging.<DOMAIN>`. → **Mong đợi:** trang chủ tiếng Việt có dấu đầy đủ, tab trình duyệt có tiêu đề, không có chữ lỗi kiểu "Ã¡".
- [ ] **P1-02** 💻 Bấm lần lượt **mọi nút và link** trên trang chủ (Đăng nhập, Đăng ký cửa hàng, Đăng ký tổ chức, Điều khoản, Chính sách bảo mật, chân trang). → **Mong đợi:** không có trang 404 hay trang trắng. *(lỗi cũ L1, L12)*
- [ ] **P1-03** 💻 Mở `/terms` và `/privacy`. → **Mong đợi:** có nội dung, có ghi phiên bản và ngày hiệu lực; Điều khoản có mục cam kết an toàn thực phẩm và mục miễn trừ cho bên tặng.
- [ ] **P1-04** 💻 Gõ thẳng vào thanh địa chỉ lần lượt `/store`, `/charity`, `/volunteer`, `/admin`. → **Mong đợi:** cả 4 đều chuyển về trang **Đăng nhập**; không thấy được bất kỳ màn hình bên trong nào. *(L2, L3)*
- [ ] **P1-05** 🍎 Mở trang chủ trên iPhone. → **Mong đợi:** hiển thị gọn trong màn hình, không phải kéo ngang, chữ đủ lớn để đọc.
- [ ] **P1-06** 💻 Dán link trang chủ vào tin nhắn Zalo hoặc Messenger (gửi cho chính mình). → **Mong đợi:** hiện ảnh xem trước và tiêu đề FoodSave.

## B. Đăng ký cửa hàng

- [ ] **P1-07** 💻 Bấm **Đăng ký cửa hàng** và nhập email `[MOI]` thứ nhất. → **Mong đợi:** nhận email (tiếng Việt, người gửi là tên miền của FoodSave) trong vòng 1 phút. Nếu không có ở Hộp thư đến, kiểm tra Spam và ghi lại nếu nằm trong Spam.
- [ ] **P1-08** 💻 Nhập mã hoặc bấm link trong email, đặt mật khẩu. → **Mong đợi:** vào được trang hồ sơ (wizard), thấy bước 1/n.
- [ ] **P1-09** 💻 Wizard: điền tên cửa hàng và loại hình, sang bước 2, rồi **đóng tab**. Mở lại trang và đăng nhập. → **Mong đợi:** thông tin đã điền **vẫn còn** (tự lưu nháp), quay lại đúng bước đang làm.
- [ ] **P1-10** 💻 Bước địa chỉ: gõ một địa chỉ thật ở TP.HCM (ví dụ một trường đại học). → **Mong đợi:** có gợi ý khi gõ; chọn xong thì bản đồ nhảy tới, có ghim; phường/xã tự điền (TP.HCM không còn cấp quận từ 01/7/2025).
- [ ] **P1-11** 💻 Kéo ghim sang vị trí khác khoảng 100 m. → **Mong đợi:** ghim ở đúng chỗ thả; địa chỉ hiển thị cập nhật hoặc có nút "Dùng vị trí ghim".
- [ ] **P1-12** 🍎 Trên iPhone (đăng nhập cùng tài khoản), bấm **"Dùng vị trí hiện tại"**. → **Mong đợi:** Safari hỏi quyền vị trí; đồng ý thì ghim nhảy về gần chỗ đang đứng.
- [ ] **P1-13** 💻 Bước giấy tờ: tải lên file PDF. Thử thêm một file > 10 MB hoặc file `.exe`/`.zip`. → **Mong đợi:** PDF lên được và có tên file; file quá lớn hoặc sai loại bị từ chối với thông báo tiếng Việt dễ hiểu.
- [ ] **P1-14** 💻 Kiểm tra form **không** yêu cầu tải ảnh CCCD hay nhập đủ 12 số CCCD. → **Mong đợi:** không có ô nào như vậy. Nếu có bước quét QR CCCD thì đó là tùy chọn, và chỉ hiện 4 số cuối.
- [ ] **P1-15** 💻 Ở bước cuối, **không tick** ô đồng ý Điều khoản rồi bấm Nộp. → **Mong đợi:** không nộp được, có thông báo phải đồng ý. Tick rồi bấm **Nộp hồ sơ**. → **Mong đợi:** màn hình "Hồ sơ đang chờ duyệt".
- [ ] **P1-16** 💻 Bấm **Nộp hồ sơ** 2–3 lần thật nhanh (hoặc nộp lần nữa sau khi tải lại trang). → **Mong đợi:** Admin chỉ thấy **1** hồ sơ cho cửa hàng này, không bị trùng. *(L5)*
- [ ] **P1-17** 💻 Vẫn bằng tài khoản vừa nộp (chưa duyệt), gõ địa chỉ `/store/offers`. → **Mong đợi:** vẫn ở màn "Đang chờ duyệt"; không đăng lô được và không thấy kho tặng. *(L4, B8)*

## C. Đăng ký tổ chức

- [ ] **P1-18** 💻 (cửa sổ ẩn danh) Đăng ký tổ chức bằng email `[MOI]` thứ hai, đi hết wizard.
- [ ] **P1-19** 💻 Bước "Điểm nhận hàng": kéo thanh **bán kính phục vụ** từ 2 km lên 8 km. → **Mong đợi:** vòng tròn trên bản đồ to lên; có dòng kiểu "Có n cửa hàng trong vùng" và số này thay đổi theo bán kính.
- [ ] **P1-20** 💻 Chọn loại thực phẩm nhận (ví dụ chỉ Bánh mì, Rau củ) và đặt giờ nhận cho 7 ngày. → **Mong đợi:** lưu được; quay lại vẫn đúng.
- [ ] **P1-21** 💻 Chọn chế độ hiển thị điểm **"Ẩn"** (dành cho mái ấm, nơi tạm lánh). → **Mong đợi:** có giải thích ngắn rằng người khác chỉ thấy khu vực, không thấy địa chỉ.
- [ ] **P1-22** 💻 Nộp hồ sơ. → **Mong đợi:** "Đang chờ duyệt"; gõ `/charity` vẫn bị chặn ở màn chờ.

## D. Admin duyệt (có MFA)

- [ ] **P1-23** 🍎 + 💻 Đăng nhập `[ADMIN]` tại `/admin` lần đầu. → **Mong đợi:** bắt buộc cài **xác thực 2 lớp**: hiện mã QR, quét bằng app xác thực trên điện thoại, nhập mã 6 số. Không có nút "Bỏ qua".
- [ ] **P1-24** 💻 Đăng xuất rồi đăng nhập lại. → **Mong đợi:** sau mật khẩu, **phải nhập mã 6 số**. Nhập sai mã thì bị từ chối.
- [ ] **P1-25** 💻 Vào **Hàng đợi duyệt**. → **Mong đợi:** thấy 2 hồ sơ vừa nộp (cửa hàng và tổ chức) với trạng thái "Chờ duyệt". *(L9)*
- [ ] **P1-26** 💻 Mở hồ sơ cửa hàng, bấm xem file PDF. → **Mong đợi:** file mở được. Copy đường dẫn file, đợi **2 phút** rồi dán vào tab mới. → **Mong đợi:** link **không mở được nữa** (đã hết hạn). *(B4)*
- [ ] **P1-27** 💻 Bấm **Yêu cầu bổ sung** mà không nhập lý do. → **Mong đợi:** bắt buộc nhập lý do. Nhập lý do rồi gửi.
- [ ] **P1-28** 💻 Đăng nhập tài khoản cửa hàng `[MOI]`. → **Mong đợi:** thấy lý do admin yêu cầu, sửa được và nộp lại. (Kiểm tra cả email thông báo.)
- [ ] **P1-29** 💻 Admin **Duyệt** hồ sơ cửa hàng và **Duyệt** hồ sơ tổ chức. → **Mong đợi:** trạng thái đổi thành "Đã duyệt"; trong **Nhật ký kiểm toán** có dòng ghi **tên Khanh** là người duyệt, kèm giờ.
- [ ] **P1-30** 💻 Đăng nhập cửa hàng `[MOI]`. → **Mong đợi:** vào được cổng cửa hàng `/store`, có menu đầy đủ.

## E. Phân quyền và quyền riêng tư

- [ ] **P1-31** 💻 Đăng nhập tài khoản **tổ chức** `[MOI]`, gõ `/store` và `/admin`. → **Mong đợi:** bị chặn, có thông báo "Bạn không có quyền" hoặc chuyển về cổng của mình. *(L4)*
- [ ] **P1-32** 💻 Tài khoản cửa hàng `[CH-A]` mở trang hồ sơ công khai của tổ chức `[TC]` (nếu có trang này). → **Mong đợi:** chỉ thấy tên, loại hình, khu vực; **không** thấy mã số thuế, số điện thoại người đại diện, 4 số CCCD, file giấy tờ. *(B3)*
- [ ] **P1-33** 💻 Tài khoản cửa hàng (đã duyệt) thử sửa hồ sơ: tên hiển thị, mô tả, giờ mở cửa **sửa được ngay**, không phải duyệt lại. → **Mong đợi:** không có ô nào cho tự sửa "Đã xác minh", "Điểm uy tín", "Trạng thái". *(B6)* Tiếp theo thử sửa **mã số thuế**. → **Mong đợi:** hệ thống báo thay đổi sẽ được gửi Admin duyệt; hồ sơ **vẫn "Đã duyệt"**, vẫn vào cổng và đăng lô được; `[ADMIN]` thấy mục "Cập nhật hồ sơ" (giá trị cũ/mới) trong hàng đợi; duyệt xong thì giá trị mới hiện ra.
- [ ] **P1-34** 💻 Thử tạo tài khoản mới và tìm mọi cách để chọn vai trò "Admin" trong form đăng ký. → **Mong đợi:** không có lựa chọn nào như vậy. *(B1. Phần kỹ thuật đã có test tự động; bước này chỉ xác nhận trên giao diện.)*
- [ ] **P1-35** 💻 Vào **Cài đặt → Quyền riêng tư** (nếu đã có ở P1). → **Mong đợi:** thấy danh sách đồng ý đã cho (Điều khoản) kèm ngày.

## F. Thiết bị di động

- [ ] **P1-36** 🤖 Đăng nhập `[CH-A]` trên Android cấu hình thấp. → **Mong đợi:** trang tải trong ≤ 5 giây; menu dưới đáy (tab bar) bấm được; không vỡ bố cục.
- [ ] **P1-37** 🍎 Đi lại bước P1-09 đến P1-11 (wizard) trên iPhone. → **Mong đợi:** bàn phím không che ô đang nhập; bản đồ kéo được bằng một ngón, phóng to bằng hai ngón.
- [ ] **P1-38** 🍎 Bấm "Quên mật khẩu" với `[CH-A]`. → **Mong đợi:** nhận email; đặt lại được mật khẩu; đăng nhập bằng mật khẩu mới được.

---

**Kết quả:** Đạt ___ / 38 · Lỗi: ______________________
**Ký UAT:** comment `Đồng ý ký UAT P1` trên issue UAT khi không còn lỗi Blocker/High.
