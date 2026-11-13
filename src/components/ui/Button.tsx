// 공통 버튼. 처리 중(pending)이면 크기를 그대로 둔 채 글자 대신 도는 표시와 "처리 중"을 보여 주고, 다시 누를 수 없게 막는다.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./styles";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`h-4 w-4 motion-safe:animate-spin ${className}`} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  pendingLabel?: string;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  pendingLabel = "처리 중",
  className = "",
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}
    >
      {/* 처리 중에도 원래 글자 자리를 차지하게 두어 버튼 크기가 바뀌지 않는다 */}
      <span className={`inline-flex items-center gap-2 ${pending ? "invisible" : ""}`}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5">
          <Spinner />
          <span className="text-[0.9em]">{pendingLabel}</span>
        </span>
      )}
    </button>
  );
}
