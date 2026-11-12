"use client";
// 캠코 공식 마스코트 키우미·지키·보따 (https://www.kamco.or.kr/portal/contents.do?mId=0103020000).
// 캠코 저작권 정책(무단 복제·배포 금지)에 따라 이미지 파일을 이 저장소에 복사하지 않고, 캠코 누리집의 공식 주소를 그대로 불러온다.
// 모양·색은 바꾸지 않는다(크기만 조절). 주소가 바뀌거나 막혀 이미지를 못 불러오면 그 자리를 비워 두고 화면은 그대로 쓸 수 있다.
import { useState } from "react";

const BASE = "https://www.kamco.or.kr/portal/img/sub/01/";

/** 쓰는 이미지: 키우미(기본 정면) · 지키(기본 정면) · 보따(기본 정면) */
export const MASCOTS = {
  키우미: { src: `${BASE}emot1_new_001.png`, alt: "캠코 마스코트 키우미" },
  지키: { src: `${BASE}emot2_new_001.png`, alt: "캠코 마스코트 지키" },
  보따: { src: `${BASE}emot3_new_001.png`, alt: "캠코 마스코트 보따" },
} as const;
export type MascotName = keyof typeof MASCOTS;

export const MASCOT_PAGE_URL = "https://www.kamco.or.kr/portal/contents.do?mId=0103020000";

export function Mascot({ name, size = 96, className = "" }: { name: MascotName; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null; // 못 불러오면 자리를 비운다
  const m = MASCOTS[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부(캠코) 공식 이미지를 그대로 쓰므로 next/image 최적화를 쓰지 않는다
    <img
      src={m.src}
      alt={m.alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 select-none object-contain ${className}`}
    />
  );
}

/** 마스코트를 쓴 화면 아래에 출처를 밝힌다 */
export function MascotCredit() {
  return (
    <p className="text-base text-zinc-600">
      마스코트 이미지 출처:{" "}
      <a href={MASCOT_PAGE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary">
        한국자산관리공사(캠코) 공식 누리집
      </a>
    </p>
  );
}
