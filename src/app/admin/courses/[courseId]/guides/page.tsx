// 최종 안내 관리 (담당자): 이 과정의 안내 목록, 등록·수정, 공개/비공개, 교육생별 확인·준비 현황으로 가는 길.
// 로그인한 "선정 + 참석 회신" 교육생이 앱에서 확인하는 게시 기능이다. 카카오톡·문자·메일은 자동으로 보내지 않는다.
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { setGuidePublishedAction } from "@/app/actions/guides";
import { ArchiveButton } from "@/components/admin/ArchiveButton";
import { guideStatus, sortGuides } from "@/domain/guides";
import { courseBase, openAdminCourse } from "@/lib/adminCourse";
import { formatKst, isoToKstLocal } from "@/lib/datetime";
import { GuideForm } from "./guide-form";

type Params = Promise<{ courseId: string }>;
type SearchParams = Promise<{ edit?: string | string[]; new?: string | string[]; preset?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// 빠른 추가: 제목과 준비 여부만 미리 채워 준다 (내용은 담당자가 직접 쓴다)
const PRESETS: Record<string, { title: string; needsPrep: boolean }> = {
  카톡방: { title: "카톡방 입장 안내", needsPrep: false },
  "Claude Pro": { title: "Claude Pro 구독 안내", needsPrep: true },
  노트북: { title: "노트북 준비 안내", needsPrep: true },
};

export default function GuidesPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600">불러오는 중…</p>}>
      <GuidesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GuidesContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { courseId } = await params;
  const store = await openAdminCourse(courseId);
  await connection();
  const query = await searchParams;
  const data = await store.readAll();
  const guides = sortGuides(data.guides ?? []);
  const base = `${courseBase(courseId)}/guides`;
  const archived = Boolean(data.archivedAt);

  const editing = first(query.edit) ? guides.find((g) => g.id === first(query.edit)) : undefined;
  const preset = PRESETS[first(query.preset) ?? ""];
  const showForm = !archived && (Boolean(editing) || first(query.new) === "1" || Boolean(preset));

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">최종 안내</h1>
      <p className="rounded-2xl bg-primary-soft p-4 text-base text-zinc-900">
        로그인한 <strong>선정 + 참석 회신</strong> 교육생만 앱에서 확인하는 게시 기능입니다. 카카오톡·문자·메일은 <strong>자동으로 보내지지 않습니다</strong>
        (공통 주소 안내는 지금처럼 담당자가 직접 합니다). 대기·미선정·불참(참석 취소 포함) 교육생은 볼 수 없습니다.
      </p>

      {archived && <p className="text-base font-medium">보관된 과정은 안내를 바꿀 수 없습니다. 조회만 가능합니다.</p>}

      {!showForm && !archived && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${base}?new=1`} className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover">
            + 안내 추가
          </Link>
          <span className="text-base text-zinc-600">빠른 추가:</span>
          {Object.keys(PRESETS).map((key) => (
            <Link key={key} href={`${base}?preset=${encodeURIComponent(key)}`} className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-4 text-base font-medium hover:bg-zinc-100">
              {PRESETS[key].title.replace(" 안내", "")}
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <section aria-label="안내 등록·수정" className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">{editing ? "안내 수정" : "새 안내"}</h2>
          <GuideForm
            key={editing?.id ?? first(query.preset) ?? "new"}
            guideId={editing?.id}
            wasPublished={Boolean(editing?.published)}
            cancelHref={base}
            initial={{
              values: editing
                ? {
                    title: editing.title,
                    body: editing.body,
                    linkUrl: editing.linkUrl ?? "",
                    linkLabel: editing.linkLabel ?? "",
                    dueAt: editing.dueAt ? isoToKstLocal(editing.dueAt) : "",
                    needsPrep: editing.needsPrep,
                    published: editing.published,
                  }
                : { title: preset?.title ?? "", body: "", linkUrl: "", linkLabel: "", dueAt: "", needsPrep: preset?.needsPrep ?? false, published: false },
            }}
          />
        </section>
      )}

      {guides.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-base text-zinc-600">아직 등록한 안내가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {guides.map((g) => {
            const s = guideStatus(data, g);
            return (
              <li key={g.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold break-keep">{g.title}</p>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${g.published ? "bg-emerald-100 text-emerald-900" : "bg-zinc-200 text-zinc-800"}`}>
                    {g.published ? "공개" : "비공개"}
                  </span>
                  {g.needsPrep && <span className="rounded-full border border-zinc-400 px-3 py-1 text-sm">준비 필요</span>}
                  {g.revision > 1 && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">수정 {g.revision - 1}회</span>}
                </div>
                <p className="text-base">
                  {g.published ? (
                    <>
                      대상 <strong>{s.total}명</strong> · 확인 <strong>{s.confirmed}</strong>
                      {g.needsPrep && (
                        <>
                          {" "}· 준비 <strong>{s.prepared}</strong>
                        </>
                      )}{" "}
                      · 미완료 <strong className={s.incomplete > 0 ? "text-red-700" : undefined}>{s.incomplete}</strong>
                      {s.changedUnconfirmed > 0 && <> · 변경 후 미확인 <strong>{s.changedUnconfirmed}</strong></>}
                    </>
                  ) : (
                    "비공개 상태라 교육생에게 보이지 않습니다."
                  )}
                  {g.dueAt && <span className="block text-zinc-600">준비 기한: {formatKst(g.dueAt)}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`${base}/${g.id}`} className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-4 text-base font-medium hover:bg-zinc-100">
                    확인·준비 현황
                  </Link>
                  {!archived && (
                    <>
                      <Link href={`${base}?edit=${g.id}`} className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-4 text-base font-medium hover:bg-zinc-100">
                        수정
                      </Link>
                      <ArchiveButton
                        action={setGuidePublishedAction.bind(null, courseId, g.id, !g.published)}
                        label={g.published ? "비공개로" : "공개하기"}
                        title={g.published ? "안내를 비공개로 바꿀까요?" : "안내를 공개할까요?"}
                        successMessage={g.published ? "비공개로 바꿨습니다." : "공개했습니다. 참석 회신한 최종 선정자에게 보입니다."}
                        confirmText={
                          g.published
                            ? "비공개로 바꾸면 교육생이 이 안내를 볼 수 없습니다. 확인·준비 기록은 남습니다. 바꿀까요?"
                            : "공개하면 참석으로 회신한 최종 선정자에게 바로 보입니다. 공개할까요?"
                        }
                      />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
