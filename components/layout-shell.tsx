import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/", label: "ホーム" },
  { href: "/study", label: "学習選択" },
  { href: "/editor", label: "プレー追加" }
];

export const LayoutShell = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-300/70 bg-stone-50/75 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">
              Offense Study App
            </span>
            <span className="text-lg font-bold text-stone-900">Offense Motion Study</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-stone-300 bg-white/80 px-3 py-1.5 transition hover:border-amber-700 hover:text-amber-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
};
