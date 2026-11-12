// 교육생 화면의 링크 영역 (PRD M2-12): 「내 결과」「교육 안내」「회신」과 나란히 놓이는 네 번째 영역의 **자리**.
// 보여 줄 링크가 없으면 아무것도 그리지 않는다(빈 자리). 나중에 카톡방·퀴즈·설문 링크를 넘겨주기만 하면 같은 자리에 나타난다.
import { usableResourceLinks, type ResourceLink } from "@/domain/traineeResources";

export function ResourceLinks({ links = [] }: { links?: readonly ResourceLink[] }) {
  const usable = usableResourceLinks(links);
  if (usable.length === 0) return null;

  return (
    <section aria-labelledby="resource-links-title" className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h2 id="resource-links-title" className="text-base font-bold">
        함께 보기
      </h2>
      <ul className="flex flex-col gap-2">
        {usable.map((l) => (
          <li key={`${l.kind}-${l.url}`}>
            <a
              href={l.url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-between rounded-lg border border-zinc-300 px-4 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span>{l.label ?? l.kind}</span>
              <span className="text-zinc-600 dark:text-zinc-400">{l.kind}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
