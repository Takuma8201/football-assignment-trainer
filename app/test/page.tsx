"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { requestActionPassword } from "@/lib/action-password";
import { deleteTest, getSavedTests, type SavedTest } from "@/lib/test-storage";

export default function TestPage() {
  const [tests, setTests] = useState<SavedTest[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refresh = async () => setTests(await getSavedTests());

    void refresh();
    const handleRefresh = () => void refresh();
    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleRefresh);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleRefresh);
    };
  }, []);

  const handleDelete = async (test: SavedTest) => {
    const confirmed = requestActionPassword("テストを削除するにはパスワードを入力してください");
    if (!confirmed) {
      setMessage("パスワードが違うため、テストは削除されませんでした。");
      return;
    }

    setTests(await deleteTest(test.id));
    setMessage(`「${test.name}」を削除しました。`);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <section className="card-surface rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Test</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">テストを選ぶ</h1>
      </section>

      <section className="mt-6 card-surface rounded-3xl px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Saved Tests</p>
            <h2 className="mt-2 text-2xl font-bold text-stone-900">今までに作成したテスト</h2>
          </div>
          <p className="text-sm text-stone-500">{tests.length} 件</p>
        </div>

        {message ? <p className="mt-4 text-sm font-medium text-amber-900">{message}</p> : null}

        {tests.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {tests.map((test) => (
              <div key={test.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-stone-900">{test.name}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      対象プレー数: {test.playIds.length} / {test.orderMode === "random" ? "ランダム" : "順番どおり"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs text-stone-400">{new Date(test.createdAt).toLocaleString("ja-JP")}</p>
                    <Link
                      href={`/test/session?id=${test.id}`}
                      className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-stone-950 transition hover:bg-amber-400"
                    >
                      テストを開始
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(test)}
                      className="rounded-full border border-rose-300 bg-rose-100 px-4 py-2 text-xs font-semibold text-rose-900 transition hover:bg-rose-200"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-stone-500">まだ作成されたテストはありません。</p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/test/create"
          className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 no-underline transition hover:bg-amber-400"
        >
          新しくテストを作成する
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
        >
          戻る
        </Link>
      </div>
    </div>
  );
}
