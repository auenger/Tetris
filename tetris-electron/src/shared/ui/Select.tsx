import { useLayoutEffect, useRef, type SelectHTMLAttributes } from 'react';
import { enhanceSelect, type SelectHandle } from './select-control.js';

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'> & { variant?: 'outline' | 'ghost' };

/** Drop-in single-select with native form and React change semantics. */
export function Select({ className = '', variant = 'outline', children, style, ...props }: SelectProps) {
  const native = useRef<HTMLSelectElement>(null);
  const control = useRef<SelectHandle | null>(null);
  useLayoutEffect(() => {
    control.current = enhanceSelect(native.current!);
    return () => { control.current?.destroy(); control.current = null; };
  }, []);
  useLayoutEffect(() => { control.current?.refresh(); });
  return <span className={`tetris-select-wrap ${className}`} style={style}><select {...props} data-variant={variant} ref={native}>{children}</select></span>;
}
