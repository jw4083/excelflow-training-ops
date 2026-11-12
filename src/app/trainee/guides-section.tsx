// 교육생 화면의 「최종 안내」 영역: 선정 + 참석 회신한 교육생에게만 서버가 안내 목록을 넘긴다 (넘길 안내가 없으면 이 영역 자체가 없다).
// 안내마다 제목·내용·링크·준비 기한과 "새 안내 / 변경된 안내" 표시, 그리고 확인 완료·준비 완료 버튼이 있다. 글자만 보여 주고 HTML은 해석하지 않는다.
import { isHttpsUrl } from "@/domain/guides";
import { remainingLabel } from "@/domain/traineeView";
import { formatKst } from "@/lib/datetime";
import type { MyGuide } from "@/lib/guides";
import { GuideActions } from "./guide-actions";
import { card } from "./tone";

export function GuidesSection({ courseId, guides, nowIso }: { courseId: string; guides: MyGuide[]; nowIso: string }) {
  if (guides.length === 0) return null;
  return (
    <section aria-labelledby="guides-title" className="flex flex-col gap-3">
      <h2 id="guides-title" className="text-base font-bold text-zinc-600">
        최종 안내 <span className="font-normal">(참석으로 회신한 분께만 보입니다)</span>
      </h2>
      {guides.map((g) => (
        <article key={g.id} className={card}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold break-keep">{g.title}</h3>
            {g.state.changed && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">변경된 안내</span>}
            {g.state.confirmed && <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">확인함</span>}
          </div>
          {g.body && <p className="mt-2 text-base whitespace-pre-line break-keep">{g.body}</p>}
          {g.linkUrl && isHttpsUrl(g.linkUrl) && (
            <a
              href={g.linkUrl.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex min-h-12 items-center justify-between rounded-xl border border-primary px-4 text-base font-semibold text-primary hover:bg-primary-soft"
            >
              <span>{g.linkLabel || "링크 열기"}</span>
              <span aria-hidden>↗</span>
            </a>
          )}
          {g.needsPrep && g.dueAt && (
            <p className="mt-3 text-base">
              준비 기한: {formatKst(g.dueAt)} <strong className="font-bold text-primary">({remainingLabel(g.dueAt, nowIso)})</strong>
            </p>
          )}
          {g.state.changed && <p className="mt-2 text-sm text-amber-900">내용이 바뀌었습니다. 다시 읽고 「확인 완료」를 눌러 주세요.</p>}
          <div className="mt-4">
            <GuideActions courseId={courseId} guideId={g.id} confirmed={g.state.confirmed} needsPrep={g.needsPrep} prepared={g.state.prepared} />
          </div>
        </article>
      ))}
    </section>
  );
}
