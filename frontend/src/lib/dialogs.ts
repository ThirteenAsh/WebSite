import { shallowRef } from "vue";

type DialogTone = "info" | "warning" | "error" | "danger";
interface DialogOptions {
  title: string;
  message: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
}
interface DialogRequest extends DialogOptions {
  id: number;
  trigger: HTMLElement | null;
  resolve: (accepted: boolean) => void;
}

export const activeDialog = shallowRef<DialogRequest | null>(null);
const queue: DialogRequest[] = [];
let dialogID = 0;

export function openDialog(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({
      ...options,
      id: ++dialogID,
      resolve,
      trigger:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    });
    if (!activeDialog.value) activeDialog.value = queue.shift()!;
  });
}

export function settleDialog(accepted: boolean) {
  const current = activeDialog.value;
  activeDialog.value = queue.shift() || null;
  current?.resolve(accepted);
}

export function showError(message: string, title = "操作未完成") {
  return openDialog({ title, message, tone: "error", confirmText: "我知道了" });
}

export function confirmAction(
  message: string,
  options: Omit<DialogOptions, "message">,
) {
  return openDialog({ cancelText: "取消", ...options, message });
}
