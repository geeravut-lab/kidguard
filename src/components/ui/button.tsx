import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-colors " +
    "focus-visible:outline-3 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-strong",
        secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
        ghost: "text-ink hover:bg-surface-2",
        danger: "bg-danger text-white hover:opacity-90",
        accent: "bg-accent text-accent-fg hover:opacity-90",
      },
      size: {
        md: "min-h-12 px-5 text-base",
        lg: "min-h-14 px-6 text-lg",
        sm: "min-h-11 px-4 text-sm",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** ใช้ภายใน AsyncButton/SubmitButton เท่านั้น */
    busy?: boolean;
    busyLabel?: string;
    leading?: ReactNode;
  };

/**
 * ปุ่มกลาง: เมื่อ busy → แสดงสปินเนอร์ + disabled + aria-busy
 * (ห้ามใช้ <button> ดิบนอกโฟลเดอร์นี้ — มี ESLint บังคับ)
 */
export function Button({ className, variant, size, busy, busyLabel, leading, children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-busy={busy ? "true" : undefined}
      {...rest}
    >
      {busy ? <Spinner label={busyLabel} /> : leading}
      <span>{children}</span>
    </button>
  );
}
