import { CategoryIcon } from "../category-icons";

/** Ảnh xem trước trong form (có thể là blob: URL cục bộ) hoặc icon danh mục. */
export function OfferThumbClient({ photoUrl, icon }: { photoUrl: string | null; icon: string | null }) {
  return (
    <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-role-accent-soft text-role-accent">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL hoặc ảnh công khai đã nén
        <img src={photoUrl} alt="" className="size-full object-cover" />
      ) : (
        <CategoryIcon iconName={icon} className="size-8" strokeWidth={1.75} />
      )}
    </div>
  );
}
