import { useSyncExternalStore } from "react";

export type ToastKind = "success" | "error" | "warning" | "info";

export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
};

const MAX_VISIBLE = 4;

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: readonly Toast[]) {
  toasts = next;
  for (const listener of listeners) listener();
}

export function dismissToast(id: number) {
  if (toasts.some((toast) => toast.id === id)) {
    emit(toasts.filter((toast) => toast.id !== id));
  }
}

/** Show a short notification. Errors stay up a little longer. */
export function showToast(kind: ToastKind, title: string, detail?: string) {
  const id = nextId++;
  emit([...toasts, { id, kind, title, detail }].slice(-MAX_VISIBLE));
  setTimeout(() => dismissToast(id), kind === "error" || kind === "warning" ? 7000 : 4500);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useToasts = () => useSyncExternalStore(subscribe, () => toasts);
