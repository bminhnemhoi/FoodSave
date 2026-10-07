import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SUPPORT_EMAIL } from "@/lib/contact";
import { DATA_CONTROLLER, POLICY_EFFECTIVE_DATE, POLICY_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description:
    "Điều khoản sử dụng FoodSave: tài khoản, duyệt hồ sơ, cam kết an toàn thực phẩm của bên tặng, trách nhiệm của bên nhận và điều khoản miễn trừ cho bên tặng thiện chí.",
};

/** Điều khoản sử dụng v1 (P1-07, F-07) — dựa trên SECURITY-PRIVACY §8; chưa qua rà soát của luật sư. */
export default function TermsPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1>Điều khoản sử dụng</h1>
        <p className="text-sm text-ink-muted">
          Phiên bản <strong className="tabular-nums">{POLICY_VERSION}</strong> · Có hiệu lực từ{" "}
          <strong className="tabular-nums">{POLICY_EFFECTIVE_DATE}</strong>
        </p>
      </header>

      <div className="flex gap-3 rounded-lg border border-info/30 bg-info-soft p-4 text-sm">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          FoodSave là dự án phi lợi nhuận của nhóm sinh viên (dự thi TISPA 2026),{" "}
          <strong>chưa có pháp nhân</strong>. Văn bản này do {DATA_CONTROLLER} soạn và chưa được luật sư rà
          soát. Chúng tôi sẽ cập nhật và tăng phiên bản khi có ý kiến pháp lý hoặc khi dự án có pháp nhân; bạn
          sẽ được hỏi đồng ý lại.
        </p>
      </div>

      <nav aria-label="Mục lục" className="rounded-lg border bg-surface p-4 text-sm">
        <p className="font-semibold">Mục lục</p>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 sm:grid-cols-2">
          <li>
            <a href="#gioi-thieu" className="underline underline-offset-4">
              FoodSave là gì
            </a>
          </li>
          <li>
            <a href="#tai-khoan" className="underline underline-offset-4">
              Tài khoản
            </a>
          </li>
          <li>
            <a href="#ho-so" className="underline underline-offset-4">
              Hồ sơ cửa hàng và tổ chức
            </a>
          </li>
          <li>
            <a href="#ben-tang" className="underline underline-offset-4">
              Cam kết của bên tặng
            </a>
          </li>
          <li>
            <a href="#ben-nhan" className="underline underline-offset-4">
              Trách nhiệm của bên nhận
            </a>
          </li>
          <li>
            <a href="#mien-tru" className="underline underline-offset-4">
              Miễn trừ cho bên tặng thiện chí
            </a>
          </li>
          <li>
            <a href="#foodsave" className="underline underline-offset-4">
              Vai trò của FoodSave
            </a>
          </li>
          <li>
            <a href="#cam" className="underline underline-offset-4">
              Hành vi bị cấm
            </a>
          </li>
          <li>
            <a href="#su-co" className="underline underline-offset-4">
              Sự cố và khiếu nại
            </a>
          </li>
          <li>
            <a href="#thay-doi" className="underline underline-offset-4">
              Thay đổi và liên hệ
            </a>
          </li>
        </ol>
      </nav>

      <h2 id="gioi-thieu">1. FoodSave là gì</h2>
      <p>
        FoodSave là nền tảng phi lợi nhuận kết nối thực phẩm còn dùng tốt từ <strong>cửa hàng</strong> (bên
        tặng) tới <strong>tổ chức từ thiện</strong> (bên nhận), với sự hỗ trợ của{" "}
        <strong>tình nguyện viên</strong> khi lấy và giao hàng. FoodSave không mua bán thực phẩm, không thu
        phí giao dịch, và không sở hữu, vận chuyển hay kiểm định thực phẩm.
      </p>

      <h2 id="tai-khoan">2. Tài khoản</h2>
      <ul className="list-disc pl-6">
        <li>Bạn cần từ 18 tuổi trở lên và cung cấp email thật để đăng ký.</li>
        <li>Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động dưới tài khoản của mình.</li>
        <li>
          Vai trò trong một cửa hàng hoặc tổ chức do chủ hồ sơ mời hoặc do FoodSave cấp; bạn không thể tự gán
          vai trò quản trị.
        </li>
        <li>Tài khoản quản trị của FoodSave bắt buộc xác thực hai lớp.</li>
      </ul>

      <h2 id="ho-so">3. Hồ sơ cửa hàng và tổ chức</h2>
      <ul className="list-disc pl-6">
        <li>
          Thông tin và giấy tờ bạn nộp phải đúng sự thật, và bạn phải được phép đại diện cho cửa hàng hoặc tổ
          chức đó.
        </li>
        <li>
          FoodSave xem xét hồ sơ và có thể <strong>duyệt</strong>, <strong>yêu cầu bổ sung</strong> hoặc{" "}
          <strong>từ chối</strong> kèm lý do. Bạn chỉ dùng được các tính năng tặng và nhận sau khi hồ sơ được
          duyệt.
        </li>
        <li>
          Sau khi được duyệt, thay đổi thông tin pháp lý (tên pháp lý, mã số thuế hoặc số đăng ký, người đại
          diện, giấy tờ) phải gửi yêu cầu để FoodSave duyệt; các thông tin khác bạn tự sửa được.
        </li>
        <li>
          FoodSave có thể tạm khóa cửa hàng hoặc tổ chức vi phạm Điều khoản này, có ghi lý do và cho phép liên
          hệ để xem xét lại.
        </li>
      </ul>

      <h2 id="ben-tang">4. Cam kết an toàn thực phẩm của bên tặng</h2>
      <p>Mỗi lần đăng lô tặng, cửa hàng xác nhận:</p>
      <blockquote className="border-l-4 border-primary/40 bg-surface px-4 py-3 italic">
        “Tôi xác nhận thực phẩm còn hạn sử dụng, được bảo quản đúng điều kiện, chưa qua sử dụng, chưa mở bao
        bì (với hàng đóng gói), và phù hợp để ăn tại thời điểm bàn giao.”
      </blockquote>
      <ul className="list-disc pl-6">
        <li>Ghi đúng hạn sử dụng, giờ chế biến (đồ nấu chín) và điều kiện bảo quản (tươi sống, sữa).</li>
        <li>
          Không đăng: đồ đã ăn dở, đồ khách đã trả lại, đồ hết hạn, rượu bia, thực phẩm chức năng, sữa công
          thức cho trẻ em.
        </li>
        <li>
          Bên tặng chịu trách nhiệm về chất lượng thực phẩm đến thời điểm bàn giao, trong phạm vi pháp luật
          cho phép.
        </li>
      </ul>

      <h2 id="ben-nhan">5. Trách nhiệm của bên nhận</h2>
      <ul className="list-disc pl-6">
        <li>
          Kiểm tra thực phẩm khi nhận (bao bì, mùi, nhiệt độ cảm quan, hạn in trên bao bì). Bên nhận có quyền{" "}
          <strong>từ chối từng dòng hàng vì chất lượng</strong> ngay lúc bàn giao; phần bị từ chối không được
          trả về lô tặng và cửa hàng sẽ được thông báo.
        </li>
        <li>Bảo quản và sử dụng đúng hạn; không bán lại thực phẩm được tặng.</li>
        <li>Chịu trách nhiệm việc chế biến và phân phát sau khi nhận.</li>
        <li>
          Ảnh minh chứng phải được làm mờ khuôn mặt và chỉ chụp khi người trong ảnh hoặc người giám hộ đồng ý.
        </li>
      </ul>

      <h2 id="mien-tru">6. Miễn trừ cho bên tặng thiện chí</h2>
      <p>
        Trong quan hệ giữa các bên dùng FoodSave, bên nhận đồng ý không quy trách nhiệm cho bên tặng về các
        vấn đề phát sinh <strong>sau khi bàn giao</strong>, nếu bên tặng đã tuân thủ cam kết ở mục 4.
      </p>
      <p>
        Xin lưu ý: Việt Nam hiện chưa có luật riêng bảo vệ người tặng thực phẩm thiện chí (như luật “Người
        Samaritan nhân hậu” ở một số nước). Điều khoản này <strong>không</strong> loại trừ trách nhiệm theo
        pháp luật về an toàn thực phẩm hay trách nhiệm dân sự đối với người thứ ba (người dùng thực phẩm).
      </p>

      <h2 id="foodsave">7. Vai trò và giới hạn trách nhiệm của FoodSave</h2>
      <ul className="list-disc pl-6">
        <li>
          FoodSave là nền tảng kết nối: cung cấp công cụ đăng lô, ghép nhu cầu, điều phối và bàn giao bằng mã
          QR. Trách nhiệm của FoodSave giới hạn trong phạm vi pháp luật cho phép.
        </li>
        <li>FoodSave không bảo đảm lúc nào cũng có thực phẩm phù hợp cho mọi nhu cầu.</li>
        <li>
          Số liệu tác động (kg, suất ăn, CO₂e…) là ước tính theo phương pháp FoodSave công bố; dữ liệu demo
          luôn được gắn nhãn “Dữ liệu demo”.
        </li>
      </ul>

      <h2 id="cam">8. Hành vi bị cấm</h2>
      <ul className="list-disc pl-6">
        <li>Giả mạo cửa hàng, tổ chức, giấy tờ hoặc người đại diện.</li>
        <li>Khai sai số lượng, bàn giao hoặc minh chứng để làm đẹp số liệu.</li>
        <li>Bán lại thực phẩm được tặng, hoặc dùng FoodSave cho mục đích thương mại.</li>
        <li>Truy cập trái phép, dò quét, gây quá tải hệ thống, hoặc thu thập dữ liệu của người khác.</li>
        <li>Quấy rối tình nguyện viên, nhân viên cửa hàng hoặc người được hỗ trợ.</li>
      </ul>

      <h2 id="su-co">9. Sự cố và khiếu nại</h2>
      <p>
        Hãy báo sự cố (thiếu hàng, chất lượng, hành vi không phù hợp) trong ứng dụng hoặc qua email. Nếu nghi
        ngờ ngộ độc thực phẩm, hãy <strong>liên hệ cơ sở y tế ngay</strong> rồi báo FoodSave để truy vết lô
        hàng.
      </p>

      <h2 id="thay-doi">10. Thay đổi điều khoản và liên hệ</h2>
      <p>
        Khi Điều khoản thay đổi, FoodSave tăng số phiên bản và hỏi bạn đồng ý lại ở lần đăng nhập kế tiếp. Dữ
        liệu cá nhân được xử lý theo{" "}
        <Link href="/privacy" className="font-medium text-primary underline underline-offset-4">
          Chính sách bảo mật
        </Link>
        .
      </p>
      <p>
        Liên hệ: {DATA_CONTROLLER} ·{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline underline-offset-4">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </>
  );
}
