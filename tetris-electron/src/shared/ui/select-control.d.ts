export interface SelectHandle {
  trigger: HTMLButtonElement;
  menu: HTMLDivElement;
  wrapper: HTMLElement;
  refresh(): void;
  open(): void;
  close(restoreFocus?: boolean): void;
  destroy(): void;
}
export function enhanceSelect(select: HTMLSelectElement, options?: { variant?: 'outline' | 'ghost' }): SelectHandle;
