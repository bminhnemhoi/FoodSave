import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SUPPORT_EMAIL } from "@/lib/contact";
import { DATA_CONTROLLER, POLICY_CHANGES, POLICY_EFFECTIVE_DATE, POLICY_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  description:
    "FoodSave thu thập dữ liệu gì, dùng vào việc gì, lưu bao lâu, ai được xem và quyền của bạn theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15.",
};

type Item = { data: string; purpose: string; who: string; keep: string };

/** Kiểm kê dữ liệu rút gọn (SECURITY-PRIVACY §5). */
const INVENTORY: Item[] = [
  {
    data: "Email, mật khẩu (chỉ lưu dạng băm), họ tên, số điện thoại (nếu bạn nhập)",
    purpose: "Đăng nhập, gửi thông báo, liên hệ điều phối",
    who: "Bạn; thành viên cùng tổ chức thấy tên; quản trị viên",
    keep: "Đến khi bạn xóa tài khoản",
  },
  {
    data: "Hồ sơ công khai của cửa hàng/tổ chức: tên, loại hình, mô tả, logo",
    purpose: "Hiển thị để các bên tìm và kết nối",
    who: "Mọi người, sau khi hồ sơ được duyệt",
    keep: "Đến khi cửa hàng/tổ chức đóng",
  },
  {
    data: "Thông tin pháp lý: tên pháp lý, mã số thuế hoặc số đăng ký, người đại diện (họ tên, chức danh), số điện thoại và email liên hệ",
    purpose: "Xác minh tổ chức, chống gian lận",
    who: "Người quản lý hồ sơ; quản trị viên FoodSave",
    keep: "Đến khi tổ chức đóng + 12 tháng",
  },
  {
    data: "Số CCCD của người đại diện (12 số, nhập tay hoặc đọc từ mã QR trên thẻ — không có ảnh)",
    purpose: "Xác minh người đại diện",
    who: "Người quản lý hồ sơ chỉ thấy dạng che (ví dụ 079*****1234); số đầy đủ chỉ quản trị viên FoodSave đã xác thực hai lớp, mỗi lần xem được ghi nhật ký",
    keep: "Số đầy đủ: xóa 30 ngày sau khi tổ chức đóng hoặc bị từ chối; 4 số cuối: như thông tin pháp lý",
  },
  {
    data: "Hotline của cửa hàng/tổ chức: số điện thoại và email công việc (không bắt buộc)",
    purpose: "Để các bên liên hệ khi trao nhận",
    who: "Thành viên các cửa hàng, tổ chức đã được duyệt; tình nguyện viên đang chạy chuyến qua cửa hàng/tổ chức đó; quản trị viên",
    keep: "Đến khi bạn xóa hotline hoặc tổ chức đóng",
  },
  {
    data: "Số điện thoại của tình nguyện viên trong chuyến (chỉ khi bạn tự bật cho phép)",
    purpose: "Cửa hàng và điều phối viên gọi khi cần trong chuyến",
    who: "Cửa hàng ở điểm dừng và điều phối viên của đúng chuyến, chỉ khi chuyến đang chạy; mỗi lần xem được ghi nhật ký",
    keep: "Số nằm trong hồ sơ của bạn; quyền xem hết khi chuyến kết thúc hoặc khi bạn tắt",
  },
  {
    data: "Giấy tờ: giấy chứng nhận đăng ký kinh doanh, giấy chứng nhận an toàn thực phẩm, quyết định thành lập, giấy phép hoạt động",
    purpose: "Duyệt hồ sơ",
    who: "Người quản lý hồ sơ; quản trị viên qua liên kết hết hạn sau 60 giây",
    keep: "Tự xóa 30 ngày sau quyết định duyệt hoặc từ chối (giữ lại loại giấy tờ, ngày và người duyệt)",
  },
  {
    data: "Địa chỉ và vị trí ghim của điểm cửa hàng/điểm nhận",
    purpose: "Ghép theo bán kính, chỉ đường lấy và giao hàng",
    who: "Theo chế độ hiển thị: công khai; gần đúng (~500 m) hoặc ẩn với người ngoài; chính xác cho thành viên và người đang giao hàng tới",
    keep: "Đến khi bạn xóa điểm",
  },
  {
    data: "Vị trí của tình nguyện viên khi đang chạy chuyến",
    purpose: "Ước tính giờ tới, điều phối",
    who: "Bạn và điều phối viên của tổ chức; cửa hàng chỉ thấy giờ tới dự kiến",
    keep: "Chỉ giữ điểm mới nhất, xóa khi kết thúc chuyến; chỉ khi bạn đồng ý riêng",
  },
  {
    data: "Ảnh minh chứng (đã làm mờ khuôn mặt) và mô tả",
    purpose: "Minh bạch việc sử dụng thực phẩm được tặng",
    who: "Tổ chức đăng; quản trị viên; cửa hàng liên quan sau khi được duyệt",
    keep: "Ảnh: 12 tháng sau khi duyệt; số liệu: 36 tháng",
  },
  {
    data: "Bản ghi đồng ý (mục đích, phiên bản văn bản, thời điểm)",
    purpose: "Chứng minh bạn đã đồng ý",
    who: "Bạn; quản trị viên",
    keep: "Đến khi xóa tài khoản + 36 tháng",
  },
  {
    data: "Nhật ký kiểm toán (ai làm thao tác gì, lúc nào)",
    purpose: "Truy vết, chống gian lận",
    who: "Quản trị viên; người quản lý tổ chức xem nhật ký của tổ chức mình",
    keep: "24 tháng",
  },
];

/**
 * Chính sách bảo mật (P1-07, F-07; v2 thêm hotline, gọi trong chuyến, số CCCD người đại diện, OpenAI) — theo
 * SECURITY-PRIVACY §4–§7; điều khoản luật cụ thể còn đang kiểm chứng.
 */
export default function PrivacyPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1>Chính sách bảo mật</h1>
        <p className="text-sm text-ink-muted">
          Phiên bản <strong className="tabular-nums">{POLICY_VERSION}</strong> · Có hiệu lực từ{" "}
          <strong className="tabular-nums">{POLICY_EFFECTIVE_DATE}</strong>
        </p>
      </header>

      <div className="flex gap-3 rounded-lg border border-info/30 bg-info-soft p-4 text-sm">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          Chính sách này mô tả đúng cách FoodSave đang xử lý dữ liệu. Nhóm dự án không phải luật sư; việc đối
          chiếu từng điều khoản của Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP đang được thực hiện và văn
          bản sẽ được cập nhật (tăng phiên bản) sau khi có người có chuyên môn pháp lý rà soát.
        </p>
      </div>

      <h2 id="ben-kiem-soat">1. Ai chịu trách nhiệm về dữ liệu của bạn</h2>
      <p>
        Bên kiểm soát dữ liệu là <strong>{DATA_CONTROLLER}</strong> — nhóm sinh viên phát triển FoodSave, hiện{" "}
        <strong>chưa có pháp nhân</strong>. Khi dự án xác lập pháp nhân (đơn vị bảo trợ hoặc tổ chức mới),
        chính sách sẽ được cập nhật và bạn sẽ được thông báo. Liên hệ:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline underline-offset-4">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <h2 id="can-cu">2. Căn cứ và nguyên tắc</h2>
      <p>
        FoodSave xử lý dữ liệu cá nhân theo tinh thần{" "}
        <strong>Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15</strong> (hiệu lực từ 01/01/2026) và{" "}
        <strong>Nghị định 356/2025/NĐ-CP</strong> quy định chi tiết Luật này:
      </p>
      <ul className="list-disc pl-6">
        <li>Chỉ thu dữ liệu cần cho từng mục đích đã nêu, và chỉ dùng đúng mục đích đó.</li>
        <li>
          Căn cứ xử lý: thực hiện thỏa thuận sử dụng dịch vụ (khi bạn đồng ý{" "}
          <Link href="/terms" className="text-primary underline underline-offset-4">
            Điều khoản sử dụng
          </Link>
          ), đồng ý riêng theo từng mục đích, và nghĩa vụ bảo đảm an toàn thực phẩm, chống gian lận.
        </li>
        <li>Đồng ý được ghi theo từng mục đích kèm phiên bản văn bản, và bạn rút lại được bất cứ lúc nào.</li>
      </ul>

      <h2 id="du-lieu">3. Dữ liệu FoodSave thu, mục đích và thời gian lưu</h2>
      <ul className="flex flex-col gap-3">
        {INVENTORY.map((i) => (
          <li key={i.data} className="rounded-lg border bg-surface p-4 text-sm leading-6">
            <p className="font-semibold text-ink">{i.data}</p>
            <dl className="mt-2 grid gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-3">
              <dt className="text-ink-subtle">Mục đích</dt>
              <dd>{i.purpose}</dd>
              <dt className="text-ink-subtle">Ai được xem</dt>
              <dd>{i.who}</dd>
              <dt className="text-ink-subtle">Lưu trong</dt>
              <dd>{i.keep}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p>
        <strong>FoodSave không thu:</strong> ảnh CCCD (dữ liệu nhạy cảm theo Điều 4 Nghị định 356/2025), ngày
        sinh, giới tính hay địa chỉ in trên CCCD, ảnh khuôn mặt hay dữ liệu sinh trắc, lịch sử di chuyển, danh
        bạ, và danh tính của người được hỗ trợ (chỉ ghi <em>số lượng</em> người).
      </p>

      <h3 id="hotline">Hotline để liên hệ khi trao nhận</h3>
      <p>
        Cửa hàng và tổ chức có thể khai một số hotline và email công việc (không bắt buộc). Hotline không công
        khai: chỉ thành viên các cửa hàng, tổ chức <strong>đã được duyệt</strong> và tình nguyện viên đang
        chạy chuyến qua bạn xem được, mỗi lần bấm “Liên hệ”, có giới hạn số lần xem. Xóa hotline trong Cài đặt
        là ngừng chia sẻ ngay.
      </p>

      <h3 id="goi-trong-chuyen">Số điện thoại tình nguyện viên trong chuyến</h3>
      <p>
        Mặc định cửa hàng và tổ chức chỉ thấy số đã che một phần. Nếu bạn tự bật “Cho phép cửa hàng và điều
        phối viên gọi tôi khi chuyến đang chạy”, cửa hàng ở điểm dừng và điều phối viên của{" "}
        <strong>đúng chuyến đó</strong> xem được số đầy đủ — chỉ khi bạn đã nhận chuyến và chuyến chưa kết
        thúc. Mỗi lần xem số được ghi nhật ký (ai, lúc nào); tắt bất cứ lúc nào trong Tài khoản.
      </p>

      <h3 id="cccd">Số CCCD của người đại diện</h3>
      <p>
        FoodSave chỉ nhận <strong>số</strong> CCCD (dữ liệu cơ bản), nhập tay hoặc đọc từ mã QR trên CCCD gắn
        chip ngay trên điện thoại của bạn — máy chỉ giữ số và họ tên để so với người đại diện đã khai, bỏ ngay
        các thông tin còn lại. FoodSave <strong>không thu và không lưu ảnh CCCD</strong>. Số đầy đủ được lưu
        tách riêng, chỉ quản trị viên đã xác thực hai lớp xem được khi duyệt (mỗi lần xem có nhật ký); người
        quản lý hồ sơ chỉ thấy dạng che. Số đầy đủ bị xóa 30 ngày sau khi tổ chức đóng hoặc bị từ chối.
      </p>

      <h2 id="dong-y">4. Đồng ý theo mục đích</h2>
      <ul className="list-disc pl-6">
        <li>
          <strong>Điều khoản và chính sách</strong> — bắt buộc để dùng dịch vụ; ghi nhận khi bạn gửi hồ sơ.
          Rút lại đồng ý này đồng nghĩa với yêu cầu xóa tài khoản.
        </li>
        <li>
          <strong>Chia sẻ vị trí trong chuyến</strong> (tình nguyện viên) — không bắt buộc; không đồng ý vẫn
          chạy chuyến được bằng xác nhận tại điểm.
        </li>
        <li>
          <strong>Cho phép gọi trong chuyến</strong> (tình nguyện viên) — không bắt buộc, mặc định tắt; không
          bật thì mọi người chỉ thấy số đã che và liên hệ qua điều phối viên.
        </li>
        <li>
          <strong>Đăng ảnh minh chứng</strong> — cần cho người đăng ảnh; ảnh phải làm mờ khuôn mặt và có đồng
          ý của người trong ảnh hoặc người giám hộ.
        </li>
        <li>
          <strong>Nhận bản tin</strong> — không bắt buộc, mặc định tắt.
        </li>
      </ul>

      <h2 id="bao-ve">5. FoodSave bảo vệ dữ liệu thế nào</h2>
      <ul className="list-disc pl-6">
        <li>
          Phân quyền đến từng dòng dữ liệu ngay trong cơ sở dữ liệu; tài khoản quản trị bắt buộc xác thực hai
          lớp.
        </li>
        <li>Giấy tờ lưu ở kho riêng tư, chỉ mở bằng liên kết hết hạn sau 60 giây; tên tệp ngẫu nhiên.</li>
        <li>Ảnh được nén và xóa thông tin vị trí (EXIF/GPS) ngay trên thiết bị trước khi tải lên.</li>
        <li>Vị trí của mái ấm, nơi tạm lánh có thể để gần đúng hoặc ẩn với người ngoài.</li>
        <li>Mọi thao tác quan trọng được ghi nhật ký; FoodSave không bán hay cho thuê dữ liệu của bạn.</li>
      </ul>

      <h2 id="ben-xu-ly">6. Bên xử lý dữ liệu và nơi lưu trữ</h2>
      <p>
        FoodSave dùng các nhà cung cấp hạ tầng sau; họ chỉ xử lý dữ liệu theo yêu cầu kỹ thuật của FoodSave:
      </p>
      <ul className="list-disc pl-6">
        <li>
          <strong>Supabase</strong> — cơ sở dữ liệu, đăng nhập, lưu tệp; máy chủ đặt tại Tokyo, Nhật Bản.
        </li>
        <li>
          <strong>Vercel</strong> — chạy ứng dụng web; xử lý tại Tokyo, Nhật Bản (công ty tại Hoa Kỳ).
        </li>
        <li>
          <strong>Google (Gmail)</strong> — gửi email xác nhận và thông báo.
        </li>
        <li>
          <strong>Goong</strong> (Việt Nam) — bản đồ và tìm địa chỉ; chỉ nhận nội dung bạn tìm và tọa độ ghim.{" "}
          <strong>OpenFreeMap</strong> — bản đồ dự phòng.
        </li>
        <li>
          <strong>OpenAI</strong> (Hoa Kỳ) — chỉ nhận ảnh thực phẩm khi bạn dùng “Chụp ảnh để điền nhanh”; ảnh
          đã được mã hóa lại để xóa thông tin vị trí. Không nhận dữ liệu cá nhân.
        </li>
      </ul>
      <p>
        Vì dữ liệu được lưu ngoài Việt Nam, nhóm đang xem xét thủ tục đánh giá tác động chuyển dữ liệu cá nhân
        ra nước ngoài theo quy định, và sẽ cập nhật kết quả tại đây trước khi triển khai thí điểm.
      </p>

      <h2 id="quyen">7. Quyền của bạn</h2>
      <p>
        Bạn có quyền được biết, đồng ý hoặc rút đồng ý, truy cập và nhận bản sao, chỉnh sửa, xóa, hạn chế hoặc
        phản đối việc xử lý, và khiếu nại. Gửi yêu cầu tới{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline underline-offset-4">
          {SUPPORT_EMAIL}
        </a>{" "}
        (trang tự phục vụ trong ứng dụng đang được xây dựng). Mục tiêu của FoodSave: phản hồi trong 72 giờ;
        hoàn tất xóa tài khoản trong 15 ngày sau khi các việc đang dở (chuyến, phân bổ chưa xong) được kết
        thúc.
      </p>
      <p>
        Thông tin pháp lý của tổ chức đã được duyệt chỉ sửa qua yêu cầu thay đổi để FoodSave kiểm tra; tổ chức
        vẫn hoạt động bình thường trong lúc chờ.
      </p>

      <h2 id="tre-em">8. Trẻ em</h2>
      <p>
        FoodSave không có tài khoản cho người dưới 18 tuổi. Trẻ em chỉ có thể xuất hiện trong ảnh minh chứng,
        khi đó khuôn mặt phải được làm mờ và tổ chức phải có đồng ý của cha mẹ, người giám hộ hoặc cơ sở bảo
        trợ. Hướng dẫn chung: không chụp trẻ em nếu không cần.
      </p>

      <h2 id="su-co">9. Khi có sự cố dữ liệu</h2>
      <p>
        Nếu phát hiện lộ lọt dữ liệu, FoodSave khắc phục ngay, đặt mục tiêu thông báo cho cơ quan chức năng và
        người bị ảnh hưởng trong vòng 72 giờ, và công bố các bước đã làm.
      </p>

      <h2 id="thay-doi">10. Thay đổi chính sách</h2>
      <p>
        Mỗi lần thay đổi, FoodSave tăng số phiên bản (hiện tại {POLICY_VERSION}) và hỏi bạn đồng ý lại ở lần
        đăng nhập kế tiếp. Các mục đích tùy chọn giữ nguyên trừ khi nội dung của mục đích đó thay đổi.
      </p>
      <p className="font-semibold text-ink">Điểm thay đổi của phiên bản {POLICY_VERSION}:</p>
      <ul className="list-disc pl-6">
        {POLICY_CHANGES.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </>
  );
}
