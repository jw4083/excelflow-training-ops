// 교육생 화면의 「최종 안내」 영역: 선정 + 참석 회신한 교육생에게만 서버가 안내 목록을 넘긴다 (넘길 안내가 없으면 이 영역 자체가 없다).
// - 할 일이 남은 안내를 먼저: 내용이 바뀌어 다시 확인해야 하는 안내 → 아직 확인하지 않은 안내 → 확인했지만 준비가 남은 안내
// - 다 끝낸 안내는 "완료한 안내"로 접어 두고, 눌러서 다시 볼 수 있다
// - 글자만 보여 주고 HTML은 해석하지 않는다. 링크는 https만 새 창으로 연다.
import { isHttpsUrl } from "@/domain/guides";
import { remainingLabel } from "@/domain/traineeView";
import { badgeClass, buttonClass } from "@/components/ui/styles";
import { formatKst } from "@/lib/datetime";
import type { MyGuide } from "@/lib/guides";
import { GuideActions } from "./guide-actions";
import { card } from "./tone";

const isDone = (g: MyGuide) => g.state.confirmed && (!g.needsPrep || g.state.prepared);
const rank = (g: MyGuide) => (g.state.changed ? 0 : !g.state.confirmed ? 1 : 2);

function GuideBody({ courseId, g, nowIso }: { courseId: string; g: MyGuide; nowIso: string }) {
  return (
    <>
      {g.body && <p className="mt-2 text-base whitespace-pre-line break-keep">{g.body}</p>}
      {g.linkUrl && isHttpsUrl(g.linkUrl) && (
        <a href={g.linkUrl.trim()} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "lg", "mt-3 w-full justify-between")}>
          <span>{g.linkLabel || "링크 열기"}</span>
          <span aria-hidden>↗</span>
          <span className="sr-only">(새 창)</span>
        </a>
      )}
      {g.needsPrep && g.dueAt && (
        <p className="mt-3 text-base">
          준비 기한: {formatKst(g.dueAt)} <strong className="font-bold text-primary">({remainingLabel(g.dueAt, nowIso)})</strong>
        </p>
      )}
      <div className="mt-4">
        <GuideActions courseId={courseId} guideId={g.id} confirmed={g.state.confirmed} changed={g.state.changed} needsPrep={g.needsPrep} prepared={g.state.prepared} />
      </div>
    </>
  );
}

function Badges({ g }: { g: MyGuide }) {
  return (
    <>
      {g.state.changed && <span className={badgeClass("amber")}>내용 변경 · 다시 확인</span>}
      {!g.state.changed && !g.state.confirmed && <span className={badgeClass("blue")}>확인 필요</span>}
      {g.needsPrep && !g.state.prepared && <span className={badgeClass("neutral")}>준비 필요</span>}
    </>
  );
}

export function GuidesSection({ courseId, guides, nowIso }: { courseId: string; guides: MyGuide[]; nowIso: string }) {
  if (guides.length === 0) return null;
  const todo = guides.filter((g) => !isDone(g)).sort((a, b) => rank(a) - rank(b));
  const done = guides.filter(isDone);

  return (
    <section id="guides" aria-labelledby="guides-title" className="flex scroll-mt-4 flex-col gap-3">
      <h2 id="guides-title" className="text-lg font-bold">
        최종 안내 <span className="text-base font-normal text-zinc-600">(참석으로 회신한 분께만 보입니다)</span>
      </h2>

      {todo.map((g) => (
        <article key={g.id} className={`${card} ${g.state.changed ? "ring-2 ring-amber-400" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold break-keep">{g.title}</h3>
            <Badges g={g} />
          </div>
          {g.state.changed && <p className="mt-2 text-base font-medium text-amber-900">내용이 바뀌었습니다. 다시 읽고 「바뀐 내용 확인」을 눌러 주세요.</p>}
          <GuideBody courseId={courseId} g={g} nowIso={nowIso} />
        </article>
      ))}

      {done.length > 0 && (
        <details className="group rounded-card bg-white px-5 py-1" open={todo.length === 0 ? undefined : false}>
          <summary className="flex min-h-12 cursor-pointer items-center justify-between text-base font-semibold">
            완료한 안내 {done.length}건 <span className="text-sm font-normal text-zinc-600">눌러서 다시 보기</span>
          </summary>
          <ul className="flex flex-col gap-2 pb-4">
            {done.map((g) => (
              <li key={g.id}>
                <details className="rounded-xl bg-zinc-50 px-4 py-1">
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-base font-semibold">
                    <span aria-hidden className="text-emerald-600">
                      ✓
                    </span>
                    {g.title}
                  </summary>
                  <div className="pb-3">
                    <GuideBody courseId={courseId} g={g} nowIso={nowIso} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** 맨 위 "할 일" 요약에 쓰는 개수 */
export function guideTodoCounts(guides: MyGuide[]) {
  return {
    toConfirm: guides.filter((g) => !g.state.confirmed).length,
    changed: guides.filter((g) => g.state.changed).length,
    toPrepare: guides.filter((g) => g.needsPrep && !g.state.prepared).length,
  };
}
