import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <section className="card-surface w-full max-w-2xl rounded-[2rem] px-8 py-12 text-center sm:px-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Offense Motion Study</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">学習を始める</h1>
        <p className="mt-4 text-sm leading-7 text-stone-600 sm:text-base">
          配置と動きを見ながら、プレーごとの役割を整理して学べるアプリです。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/study"
            className="inline-flex items-center justify-center rounded-full bg-amber-300 px-8 py-4 text-base font-semibold text-stone-950 no-underline transition hover:bg-amber-400"
          >
            学習を始める
          </Link>
          <Link
            href="/test"
            className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-8 py-4 text-base font-semibold text-stone-900 no-underline transition hover:bg-stone-100"
          >
            テストを開始する
          </Link>
        </div>
      </section>
    </div>
  );
}
