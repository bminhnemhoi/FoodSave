import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-10 sm:px-8">
      <Link href="/" className="inline-block rounded-md">
        <Wordmark className="text-xl" />
      </Link>
      <article className="mt-8 flex flex-col gap-4 leading-7 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold">
        {children}
      </article>
    </main>
  );
}
