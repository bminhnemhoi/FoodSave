# Bộ câu hỏi phản biện

> **Cách dùng:**
> - Mỗi câu trả lời nói trong **≤ 30 giây**, theo cấu trúc **Kết luận → 1 bằng chứng → 1 con số/việc cụ thể**.
> - Cột **Ai** là người trả lời chính. Tiêu chí 7 yêu cầu **mọi thành viên đều trả lời**, nên Khanh phải nắm ≥ 10 câu.
> - Câu có ký hiệu **⚠** chứa số liệu cần đối chiếu với [so-lieu-cap-thiet.md](so-lieu-cap-thiet.md) trước khi nói. Không nói số nào ghi "chưa kiểm chứng".
> - Phần trong `[ngoặc vuông]` điền sau pilot (B-07).
> - Agent `judge` dùng file này để hỏi ngẫu nhiên khi tập dượt. Câu mới phát sinh khi tập dượt thì thêm vào cuối nhóm tương ứng.

Tổng: **48 câu** (Đội ngũ 6 · Giải pháp & công nghệ 12 · Cấp thiết 5 · Khả thi & tác động 12 · Bền vững 7 · Sản phẩm mẫu 3 · Trình bày 3).

---

## 1. Đội ngũ (6 điểm)

**Q1. Đội chỉ có 2 người, làm sao xây và vận hành một nền tảng nhiều vai trò như vậy?** — *Minh*
> Chúng tôi làm theo quy trình kỹ thuật như một đội sản phẩm thật: 7 phase, mỗi phase có gate đo được, CI tự chạy kiểm thử, và Khanh ký nghiệm thu từng gate. Phần viết code được tăng tốc bằng Claude Code, nhưng thiết kế, review và kiểm thử do con người chịu trách nhiệm. Bằng chứng là sản phẩm đang chạy trên prod, có [N] bài test tự động và đã vận hành pilot thật. Sau giải, chúng tôi bổ sung điều phối viên cộng đồng theo cụm.

**Q2. Code do AI viết thì chất lượng và bảo mật ra sao? Ai chịu trách nhiệm?** — *Minh*
> Chúng tôi chịu trách nhiệm. AI viết trong một "khung an toàn": hook chặn lệnh nguy hiểm và chặn sửa migration đã phát hành; mọi bảng có phân quyền theo dòng và có test pgTAP; mọi thay đổi qua pull request, CI và review bảo mật. Bản cũ có 8 lỗi bảo mật (ví dụ ai cũng tự đăng ký được admin); bản mới có test hồi quy cho từng lỗi đó.

**Q3. Sau 6 tháng, khi các bạn bận học hoặc đi làm, ai vận hành FoodSave?** — *Khanh*
> Mỗi người cam kết khoảng 15 giờ/tuần trong 6 tháng. Mô hình "cụm" có điều phối viên cộng đồng (tình nguyện viên trưởng) tại chỗ, và từ tháng thứ 5 có nguồn tài trợ cụm để trả phụ cấp. Hệ thống tự động hóa phần lớn việc điều phối, nên việc vận hành chủ yếu là hỗ trợ đối tác.

**Q4. Đội có ai hiểu về an toàn thực phẩm, pháp lý hay CSR không?** — *Khanh*
> Đây là điểm chúng tôi đang bổ sung: mời [2–3] cố vấn về ATTP, pháp lý phi lợi nhuận và CSR. Ngân sách đã dành 4 triệu đồng cho luật sư rà soát điều khoản, miễn trừ cho bên tặng và bảo vệ dữ liệu cá nhân. Về sản phẩm, quy tắc an toàn đã nằm sẵn trong luồng: cam kết khi đăng, nhãn theo thời gian, quyền từ chối từng dòng.

**Q5. Phân công trong đội cụ thể thế nào?** — *Khanh*
> Minh lo sản phẩm và kỹ thuật, ngân sách, chuyển hạ tầng. Khanh lo chất lượng (kiểm thử, nghiệm thu), quan hệ cửa hàng và tổ chức, vận hành pilot. Trên sân khấu, Minh điều khiển phần cửa hàng/Admin, Khanh điều khiển phần tổ chức/tình nguyện viên.

**Q6. Bản trước của các bạn có nhiều lỗi. Điều gì khiến lần này khác?** — *Minh*
> Chúng tôi đã tự kiểm toán bản cũ và ghi lại 16 lỗi chức năng, 8 lỗi bảo mật. Bản mới được xây lại từ đầu với nguyên tắc "không có tính năng giả": mỗi số liệu là thật hoặc gắn nhãn "Dữ liệu demo", mỗi lỗi cũ có test để không tái diễn. Biết mình sai ở đâu là lý do lần này chắc hơn.

---

## 2. Giải pháp & ứng dụng công nghệ (8 điểm)

**Q7. Khác gì Too Good To Go?** — *Minh*
> Too Good To Go **bán** đồ dư giá rẻ cho người tiêu dùng, chủ yếu ở châu Âu và Mỹ (chưa có ở Việt Nam). FoodSave **tặng miễn phí** cho tổ chức từ thiện đã xác minh, có điều phối tình nguyện viên, biên nhận QR, minh chứng và báo cáo ESG. Hai mô hình bổ sung nhau: cửa hàng có thể bán giảm giá lúc chiều và tặng phần còn lại lúc đóng cửa.

**Q8. VietHarvest và Ngân hàng thực phẩm Việt Nam đã làm việc này rồi. Vì sao cần thêm FoodSave?** — *Minh* ⚠
> Họ làm rất tốt phần vận hành: mạng lưới ngân hàng thực phẩm năm 2025 phục vụ khoảng 3,1 triệu người qua kho tập trung. FoodSave là **lớp phần mềm điều phối**, nhắm vào hàng dễ hỏng trong vài giờ mà kho không kịp xử lý, và vào hàng nghìn cửa hàng nhỏ không đủ lớn để có xe đến lấy. Chúng tôi coi họ là đối tác: tổ chức của họ có thể dùng FoodSave miễn phí làm công cụ.

**Q9. Sao không dùng nhóm Zalo hay Facebook cho nhanh?** — *Khanh*
> Nhóm chat không biết ai ở gần, hàng còn bao lâu, ai đã nhận phần nào; không có biên nhận, không bảo vệ quyền riêng tư và không ra được báo cáo. Khi một cửa hàng chỉ có 20 trên 50 bánh cần, nhóm chat không tự ghép được 3 cửa hàng. Zalo vẫn sẽ là **kênh thông báo** của FoodSave (ZNS ở tháng thứ 3), không phải nơi điều phối.

**Q10. Thuật toán ghép đơn hoạt động thế nào?** — *Minh*
> Gồm hai bước:
> 1. Cơ sở dữ liệu lọc tối đa 15 lô khả thi: trong bán kính, đúng loại, còn hàng và đến kịp trước hạn (khoảng cách × 1,4 ở tốc độ xe máy 18 km/h, cộng 10 phút).
> 2. Hệ thống thử **mọi tổ hợp tối đa 3 cửa hàng** trong 12 lô tốt nhất (298 tổ hợp, mất dưới 50 ms), xếp theo thứ tự: đủ số lượng, ít điểm dừng, tuyến ngắn, rồi tới hàng sắp hết hạn. Nếu vẫn thiếu thì ghép thêm tối đa 5 cửa hàng.
>
> Kết quả trả về 3 phương án. Có kiểm thử ngẫu nhiên để chứng minh không bao giờ cấp vượt số lượng của lô.

**Q11. "Công bằng giữa các tổ chức" nghĩa là gì?** — *Minh*
> Khi có lô mới, tổ chức nào nhận **ít** (tính theo kg đã nhận trong 30 ngày chia cho số người phục vụ) được báo trước. Như vậy một tổ chức lớn, nhanh tay không chiếm hết. Thứ tự này không phụ thuộc việc ai trả tiền.

**Q12. Tại sao dùng bản đồ Goong mà không dùng Google Maps?** — *Minh*
> Có ba lý do:
> - nhãn tiếng Việt và dữ liệu địa chỉ Việt Nam tốt, đã thử 20 địa chỉ thật ở TP.HCM với sai lệch dưới 50 m;
> - thể hiện đúng chủ quyền Hoàng Sa – Trường Sa, điều quan trọng với sản phẩm phục vụ cộng đồng Việt Nam;
> - có chỉ đường cho xe máy và hạn mức miễn phí phù hợp.
>
> Chúng tôi vẫn dùng deep link mở Google/Apple Maps cho tình nguyện viên vì họ quen dùng. Mọi lời gọi bản đồ đi qua một lớp adapter, nên đổi sang Amazon Location chỉ là đổi cấu hình.

**Q13. AI có thật sự cần không, hay chỉ để trang trí?** — *Minh*
> AI nằm đúng chỗ ma sát lớn nhất: cửa hàng bận lúc đóng cửa. Chụp một tấm ảnh là form tự điền loại hàng, số lượng, hạn gợi ý, nên đăng lô mất dưới 60 giây. Người bán luôn xác nhận lại, và tắt AI thì sản phẩm vẫn chạy. Chúng tôi không dùng AI để ra quyết định thay con người.

**Q14. Nhãn Xanh/Vàng/Đỏ dựa trên cơ sở nào?** — *Khanh*
> Ngưỡng khác nhau theo nhóm hàng. Đồ nấu chín: Đỏ khi còn dưới 4 giờ. Rau củ, sữa tươi: dưới 24 giờ. Đồ đóng gói: dưới 3 ngày. Thời gian còn lại tính tới mốc **sớm hơn** giữa hạn dùng và giờ đóng cửa. Lô Đỏ chỉ được gợi ý cho tổ chức **đến kịp**. Ngưỡng có phiên bản; khi cố vấn ATTP góp ý, nhóm phát hành phiên bản ngưỡng mới qua migration có kiểm thử, không ai sửa tay lúc hệ thống đang chạy.

**Q15. QR bàn giao chống gian lận thế nào?** — *Minh*
> Mã QR dùng **một lần**, hệ thống chỉ lưu bản băm nên lộ cơ sở dữ liệu cũng không giả được mã. Mỗi lô có hai sự kiện, lấy ở cửa hàng và giao về tổ chức, với số lượng đối soát từng dòng: đặt ≥ lấy ≥ giao. Tác động chỉ được ghi khi **bên nhận** xác nhận, nên một bên không tự thổi phồng số liệu được.

**Q16. Các bạn có dùng AWS không? Vì sao hiện chạy Vercel và Supabase?** — *Minh*
> Hiện chúng tôi chạy Vercel và Supabase vì nhanh và miễn phí trong giai đoạn thi. Kiến trúc được thiết kế **sẵn sàng AWS** qua adapter. Lộ trình 6 tháng:
> - SES cho email (tháng 2);
> - Amazon Location (tháng 2, chạy song song);
> - Bedrock cho AI (tháng 3);
> - Rekognition Face Liveness (tháng 4);
> - Amplify Hosting và EventBridge + Lambda (tháng 5).
>
> Mỗi bước có đường lui.

**Q17. Mạng yếu hoặc mất mạng ở điểm lấy hàng thì sao?** — *Khanh*
> Ứng dụng tình nguyện viên là PWA, đã lưu sẵn chuyến trong ngày. Nếu không quét được QR thì nhập mã 6 số. Mọi thao tác có mã chống ghi trùng, nên bấm lại khi có mạng không tạo hai bản ghi.

**Q18. Sao không làm app iOS/Android riêng?** — *Minh*
> PWA cài được lên màn hình chính, có thông báo đẩy, không cần qua kho ứng dụng, cập nhật tức thì, và chỉ cần một mã nguồn. Với đội 2 người, đây là lựa chọn bền vững nhất. Nếu số liệu cho thấy cần, chúng tôi sẽ cân nhắc Zalo Mini App trước app native.

---

## 3. Mức độ cấp thiết (4 điểm)

**Q19. Có số liệu nào cho thấy lãng phí thực phẩm ở Việt Nam là vấn đề lớn?** — *Minh* ⚠
> Theo UNEP Food Waste Index 2024, mỗi người Việt Nam bỏ phí khoảng 72 kg thực phẩm/năm ở hộ gia đình, và UNEP ước tính thêm khoảng 84 kg/người ở khâu bán lẻ và ăn uống ngoài nhà, là khâu FoodSave nhắm tới. Toàn cầu, hộ gia đình bỏ phí hơn 1 tỷ bữa ăn mỗi ngày. Chúng tôi có thêm khảo sát [20] cửa hàng ở khu pilot: trung bình [X] kg dư mỗi tối.

**Q20. Ở Việt Nam còn nhiều người thiếu ăn thật không?** — *Khanh* ⚠
> Theo FAO, khoảng **10,7%** dân số Việt Nam mất an ninh lương thực mức vừa hoặc nặng, **tăng từ 6,5% năm 2019**. Mạng lưới ngân hàng thực phẩm năm 2025 đã phục vụ hơn 3,1 triệu người và hỗ trợ 862 tổ chức. Nhu cầu là thật và đang tăng.

**Q21. Số "8 triệu tấn, 3,9 tỷ USD" mà báo chí hay nói, sao các bạn không dùng?** — *Minh*
> Vì chúng tôi không tìm được nguồn gốc gốc của con số đó. Chúng tôi chỉ dùng số có thể dẫn link và kiểm chứng (UNEP, FAO, Tổng cục Thống kê), và ghi rõ chỗ nào là ước tính.

**Q22. Cửa hàng hiện đang xử lý hàng dư thế nào? Họ có thật sự muốn cho không?** — *Khanh*
> Khảo sát của chúng tôi cho thấy [X]% hủy bỏ, [Y]% cho nhân viên, [Z]% bán giảm giá. Rào cản lớn nhất khi muốn cho là [không biết cho ai / sợ rủi ro / tốn thời gian]. FoodSave giải đúng các rào cản đó. Đã có [2] cửa hàng ký thư bày tỏ ý định và tham gia pilot.

**Q23. Vì sao lại cấp thiết bây giờ?** — *Minh* ⚠
> Ba lý do:
> - tỷ lệ mất an ninh lương thực ở Việt Nam đã tăng gần gấp đôi từ 2019;
> - các doanh nghiệp đang chịu áp lực báo cáo phát triển bền vững ngày càng lớn, nên số liệu tác động có giá trị;
> - công nghệ (bản đồ, AI, hạ tầng serverless) đã đủ rẻ để một đội nhỏ vận hành với chi phí gần 0.

---

## 4. Tính khả thi & tác động (5 điểm)

**Q24. Nếu người ăn bị ngộ độc, ai chịu trách nhiệm?** — *Khanh*
> Chúng tôi giảm rủi ro ở mọi bước:
> - cửa hàng cam kết an toàn khi đăng;
> - nhãn theo thời gian và kiểm tra khả thi, không gợi ý hàng không kịp lấy;
> - bên nhận kiểm tra và có quyền từ chối từng dòng;
> - pilot chỉ nhận nhóm hàng rủi ro thấp (bánh, đồ đóng gói, rau quả), không nhận đồ tươi sống;
> - có túi giữ nhiệt cho tình nguyện viên;
> - chuỗi QR cho phép truy vết ngay lô nào, từ đâu.
>
> Điều khoản có miễn trừ cho bên tặng thiện chí. Theo hiểu biết của chúng tôi, Việt Nam chưa có luật riêng bảo vệ người tặng thực phẩm như ở một số nước, nên ngân sách đã có khoản thuê luật sư rà soát (**cần luật sư xác nhận**).

**Q25. Tổ chức từ thiện, nhiều nơi là người lớn tuổi, có chịu dùng công nghệ không?** — *Khanh*
> Sản phẩm miễn phí, không cần cài app, giao diện tiếng Việt. Việc chính chỉ là xem kho tặng và bấm nhận. Khanh trực tiếp hướng dẫn từng tổ chức trong pilot; từ tháng 3, thông báo đi qua Zalo là kênh họ đã quen. Ngoài ra, minh chứng trên FoodSave giúp chính họ báo cáo với nhà tài trợ của mình, nên họ có lợi ích riêng khi dùng.

**Q26. Cửa hàng được lợi gì mà chịu bỏ công?** — *Khanh*
> Bốn lợi ích:
> - giảm hàng phải hủy;
> - đăng lô chỉ mất dưới 60 giây;
> - có biên nhận bàn giao rõ ràng;
> - nhận báo cáo ESG hằng tháng với số kg cứu được, suất ăn tương đương và CO₂e tránh được, dùng được cho truyền thông thương hiệu.
>
> FoodSave không thu phí cửa hàng nhỏ và không lấy hoa hồng.

**Q27. Tình nguyện viên không đến thì sao?** — *Khanh*
> Hệ thống có ma trận hủy rõ ràng. Tình nguyện viên không đến thì chuyến bị hủy, số hàng quay về trạng thái đã xác nhận để phân công người khác; nếu quá hạn thì lô được mở lại cho tổ chức khác. Tình nguyện viên check-in theo vị trí, có hỗ trợ xăng và bảo hiểm trong ngân sách. Nhiều tổ chức cũng có người tự đến lấy.

**Q28. Làm sao biết tổ chức là thật, không phải người lợi dụng?** — *Khanh*
> Tổ chức phải nộp giấy tờ (quyết định thành lập, giấy phép), Admin duyệt và hệ thống ghi rõ ai duyệt, khi nào. Giấy tờ chỉ mở bằng link tạm 60 giây và tự xóa 30 ngày sau quyết định. Admin bắt buộc xác thực 2 lớp. Sau đó tổ chức phải có minh chứng sử dụng, có điểm uy tín, và bị tạm ngưng nếu vi phạm.

**Q29. Nếu tổ chức nhận rồi đem bán lại?** — *Khanh*
> Có 4 lớp kiểm soát:
> - minh chứng sử dụng là bắt buộc và được Admin duyệt, cửa hàng đã tặng cũng xem được;
> - hệ thống so lượng nhận với số người tổ chức phục vụ, lượng bất thường sẽ lộ ra;
> - cửa hàng và người dân phản ánh được;
> - điểm uy tín giảm, tổ chức có thể bị tạm ngưng.
>
> Không hệ thống nào loại bỏ hoàn toàn gian lận, nhưng FoodSave làm nó **để lại dấu vết**.

**Q30. Ảnh minh chứng có trẻ em thì bảo vệ quyền riêng tư thế nào?** — *Minh*
> Khuôn mặt được làm mờ **ngay trên điện thoại, trước khi gửi**. Ảnh được mã hóa lại để xóa thông tin vị trí GPS. Ảnh nằm ở kho riêng tư, chỉ Admin và cửa hàng liên quan xem được **sau khi Admin duyệt**. Chúng tôi không đăng ký từng người nhận, chỉ ghi **số người** được hỗ trợ. Thiết kế này bám Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (chi tiết trong tài liệu bảo mật).

**Q31. Vị trí tình nguyện viên có bị theo dõi không?** — *Minh*
> Chỉ khi họ đồng ý, chỉ khi app đang mở trong chuyến. Hệ thống chỉ giữ điểm mới nhất, làm tròn khoảng 11 m, và xóa khi kết thúc chuyến. Cửa hàng chỉ thấy thời gian dự kiến tới, không thấy vị trí.

**Q32. Pilot của các bạn chứng minh được gì?** — *Khanh*
> Trong 2 tuần (15–28/11), [N] lần bàn giao thật, [X] kg, [Y] suất ăn tương đương, thời gian trung vị từ lúc đăng tới lúc được nhận là [Z] phút, [W]% có minh chứng hợp lệ. Mọi số đều do hệ thống đo và công khai trên trang tác động. Quy mô còn nhỏ, nhưng chứng minh toàn bộ chuỗi chạy được với người dùng thật.

**Q33. KPI 6 tháng là gì, có thực tế không?** — *Khanh*
> Trong một cụm 3–5 phường: 30 cửa hàng, 10 tổ chức hoạt động, ≥ 620 lần bàn giao, ≥ 5 tấn thực phẩm (khoảng 11.900 suất ăn tương đương), ≥ 80% lô có minh chứng hợp lệ, 0 sự cố ATTP nghiêm trọng. Chỉ tiêu tăng dần theo tháng, giả định 8 kg/lần bàn giao. Giả định này sẽ được chỉnh theo số pilot.

**Q34. Chi phí vận hành mỗi tháng bao nhiêu?** — *Minh*
> Hiện tại gần như 0 đồng, chỉ tốn tên miền vì dùng gói miễn phí. Khi vận hành pilot một cụm, khoảng 7,2 triệu đồng/tháng gồm hạ tầng, thông báo và hỗ trợ xăng. Ở quy mô pilot, chi phí khoảng 5.000 đồng cho mỗi kg thực phẩm cứu được, tức khoảng 2.100 đồng/suất ăn tương đương, và giảm khoảng một nửa khi mở rộng.

**Q35. Mở rộng ra ngoài TP.HCM thế nào?** — *Minh*
> Mỗi "cụm phường" là một đơn vị tự chứa (cửa hàng, tổ chức, tình nguyện viên trong bán kính xe máy), nên mở cụm mới chủ yếu là cấu hình, không cần viết lại. Thứ tự: 3–5 cụm ở TP.HCM trong năm 2027, rồi tới thành phố thứ hai qua đối tác địa phương. Mạng lưới 25 ngân hàng thực phẩm cũng là kênh nhân rộng tiềm năng.

---

## 5. Mô hình thiện nguyện bền vững (5 điểm)

**Q36. Không thu hoa hồng thì FoodSave sống bằng gì?** — *Minh*
> Thực phẩm và lõi điều phối luôn miễn phí. Tiền đến từ những bên được lợi về thương hiệu:
> - gói báo cáo ESG/CSR cho chuỗi bán lẻ, giả định 1,5–3 triệu/tháng;
> - nhà tài trợ cụm, khoảng 5 triệu/tháng, trả chi phí tình nguyện viên;
> - quỹ và tài trợ.
>
> Chỉ cần 1 nhà tài trợ cụm và 1 gói ESG là hòa vốn chi phí tối thiểu 7,2 triệu/tháng.

**Q37. Doanh nghiệp có thật sự trả tiền cho báo cáo ESG không?** — *Minh*
> Đây là giả định rủi ro nhất của chúng tôi, nên chúng tôi kiểm chứng sớm: phỏng vấn 3 chuỗi ở tháng thứ 4, KPI là ký ≥ 1 hợp đồng trước tháng 6. Nếu không thành, chúng tôi chuyển trọng tâm sang tài trợ cụm, mô hình doanh nghiệp đã quen. Báo cáo ESG khi đó vẫn miễn phí như công cụ thu hút.

**Q38. Số liệu ESG có đáng tin không, hay là "tô vẽ xanh"?** — *Minh*
> Chúng tôi làm 4 việc để số liệu đáng tin:
> - chỉ ghi nhận khi **hai bên xác nhận** bàn giao bằng QR;
> - sổ cái chỉ ghi thêm, không sửa;
> - hệ số có nguồn, số trang và phiên bản, chọn hướng **bảo thủ** (CO₂e 2,0 kg/kg và nước tưới 150 L/kg theo FAO 2013, suất ăn 420 g theo WRAP);
> - báo cáo ghi rõ đây là **ước tính phục vụ báo cáo CSR, chưa kiểm toán độc lập, không phải tín chỉ carbon**.
>
> Minh bạch về giới hạn chính là điều làm số liệu đáng tin.

**Q39. Doanh nghiệp trả tiền có được ưu tiên nhận thông báo hay ghép đơn không?** — *Minh*
> Không. Thuật toán ghép và thứ tự thông báo chỉ dựa trên khả thi, độ gấp và công bằng giữa các tổ chức. Nguyên tắc này được ghi trong điều khoản của gói ESG.

**Q40. Ngân sách 75 triệu dùng vào đâu? Sao không có lương?** — *Minh*
> Khoảng 45% hỗ trợ trực tiếp người tham gia: xăng, bảo hiểm, túi giữ nhiệt cho tình nguyện viên, tập huấn và sự kiện. 28% cho hạ tầng và thông báo Zalo/SMS. 17% cho standee QR, pháp lý và đánh giá tác động. 10% dự phòng. Đội không nhận lương từ tiền giải, để mọi đồng đi vào vận hành; phụ cấp sẽ đến từ nguồn thu sau tháng 6.

**Q41. 25 triệu nhận tại chung kết dùng làm gì?** — *Khanh*
> Làm cầu nối cho tháng 12 để pilot không gián đoạn:
> - thiết bị kiểm thử, gồm một iPhone để thử thông báo trên iOS;
> - hạ tầng trả trước;
> - standee cho 10 cửa hàng đầu;
> - đi lại, khảo sát;
> - tư vấn pháp lý để chuyển thư ý định thành biên bản hợp tác;
> - 4 triệu dự phòng.

**Q42. FoodSave có pháp nhân chưa? Ký hợp đồng với doanh nghiệp bằng gì?** — *Minh*
> Chưa. Tháng đầu sau giải, chúng tôi sẽ hoạt động dưới sự bảo trợ của một tổ chức có pháp nhân, và cân nhắc thành lập doanh nghiệp xã hội khi đã có nguồn thu. Khoản tư vấn pháp lý trong ngân sách dành cho việc này.

---

## 6. Sản phẩm mẫu (4 điểm)

**Q43. Dữ liệu trong demo là thật hay giả?** — *Minh*
> Trong demo, chúng tôi dùng các tổ chức **demo** có tên hư cấu, được gắn nhãn "Dữ liệu demo" rõ ràng, để không ảnh hưởng đối tác thật. Mọi chức năng đều chạy thật trên hệ thống thật. Số liệu ở slide cuối là **dữ liệu pilot thật**, xem được trên trang tác động công khai. Ban giám khảo có thể tự thử bằng tài khoản giám khảo theo từng vai trò (cửa hàng, tổ chức, tình nguyện viên); chúng tôi không cấp tài khoản admin vì admin bắt buộc xác thực 2 lớp.

**Q44. Bao nhiêu người dùng thật đang dùng?** — *Khanh*
> [N] cửa hàng, [M] tổ chức và [K] tình nguyện viên đã tham gia pilot từ 15/11, với [X] lần bàn giao. Con số còn nhỏ và chúng tôi nói thẳng điều đó; mục tiêu 6 tháng là 30 cửa hàng và 10 tổ chức.

**Q45. Nếu demo lỗi giữa chừng?** — *Minh*
> Mỗi bước demo đều có phương án dự phòng: mã 6 số thay QR, dữ liệu đã chuẩn bị sẵn ở từng bước, và video quay trên chính hệ thống này. Ngoài ra có 2 nguồn mạng và 2 điện thoại.

---

## 7. Trình bày & phản biện (5 điểm)

**Q46. Tóm tắt FoodSave trong 30 giây.** — *Khanh*
> FoodSave nối thực phẩm dư của cửa hàng với tổ chức từ thiện gần đó, nhanh, an toàn và minh bạch. Cửa hàng chụp ảnh để đăng; hệ thống tự ghép đủ số lượng từ nhiều cửa hàng; tình nguyện viên đi theo tuyến tối ưu; bàn giao bằng QR; minh chứng được làm mờ khuôn mặt; mọi kg được quy ra suất ăn và CO₂e có nguồn. Miễn phí cho người nhận, bền vững nhờ báo cáo ESG cho doanh nghiệp.

**Q47. Rủi ro lớn nhất khiến dự án thất bại là gì?** — *Minh*
> Cửa hàng tham gia nhiệt tình lúc đầu rồi bỏ. Vì vậy chúng tôi đo tỷ lệ giữ chân hằng tháng (mục tiêu ≥ 70%), giữ thao tác đăng dưới 60 giây, và gửi báo cáo ESG mỗi tháng như một "phần thưởng" để họ thấy giá trị. Rủi ro thứ hai là doanh nghiệp không trả tiền cho báo cáo ESG; phương án dự phòng là tài trợ cụm.

**Q48. Nếu chỉ được giữ một tính năng, các bạn giữ gì?** — *Khanh*
> Ghép đơn nhiều cửa hàng kèm kiểm tra "đến kịp". Đó là thứ nhóm chat không làm được, và là lý do một tổ chức cần 50 phần ăn thật sự nhận đủ 50.

---

## Phụ lục — Câu hỏi bẫy và cách xử lý

| Tình huống | Cách xử lý |
|---|---|
| Giám khảo đưa ra số liệu khác với số của đội | "Cảm ơn anh/chị. Số của chúng tôi lấy từ [nguồn, năm]. Chúng tôi sẽ đối chiếu nguồn anh/chị nêu." Không tranh luận số. |
| Giám khảo nói hệ số ESG quá thấp ("thường là 2,5 kg CO₂e/kg", "nước phải hàng nghìn lít/kg") | "Chúng tôi chủ động chọn số bảo thủ. FAO 2013 tính dấu chân trên 1,6 tỷ tấn gồm cả phần không ăn được (tr. 11), nên 3,3 Gt CO₂e ÷ 1,6 Gt ≈ 2,0 kg/kg; nước chỉ tính nước tưới, 250 km³ ÷ 1,6 Gt ≈ 150 L/kg, không gồm nước mưa. Thà nói nhỏ còn hơn nói quá." Chi tiết: ESG-METHODOLOGY Q11, Q12. |
| Câu hỏi ngoài hiểu biết (ví dụ chi tiết luật thuế) | "Chúng tôi chưa có câu trả lời chắc chắn; đây là việc nằm trong khoản tư vấn pháp lý của kế hoạch." Không đoán. |
| Câu hỏi hướng vào thành viên ít nói | Thành viên đó trả lời trước; người kia chỉ bổ sung 1 câu nếu cần. |
| Hỏi dồn nhiều ý | Nhắc lại ý chính: "Có hai ý, em xin trả lời lần lượt…" |
