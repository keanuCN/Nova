"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, LoaderCircle, Check, AlertCircle } from "lucide-react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
export function Button({
  children,
  variant = "secondary",
  busy = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`btn btn-${variant} ${className}`}
    >
      {busy && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  drawer = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`${drawer ? "drawer" : "modal"} ${wide ? "modal-wide" : ""}`}
          aria-describedby={description ? "dialog-description" : undefined}
        >
          <div className="modal-heading">
            <div>
              <div className="eyebrow">Nova</div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="dialog-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="icon-btn" aria-label="关闭">
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-heading">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}
export function Toast({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`toast ${error ? "toast-error" : ""}`}
    >
      {error ? <AlertCircle size={18} /> : <Check size={18} />}
      <span>{message}</span>
    </div>
  );
}
export function Money({ value }: { value: number }) {
  return (
    <span className="mono">
      ¥
      {value.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}
