import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const baseClasses = [
  'inline-flex',
  'items-center',
  'justify-center',
  'gap-2',
  'rounded-xl',
  'font-medium',
  'transition-colors',
  'disabled:cursor-not-allowed',
  'disabled:opacity-50',
];

const variantClasses: Record<ButtonVariant, string[]> = {
  primary: ['btn-primary'],
  secondary: ['bg-bg-overlay', 'text-text-primary', 'border', 'border-line', 'hover:bg-bg-elevated'],
  ghost: ['bg-transparent', 'text-text-secondary', 'hover:bg-bg-overlay'],
  danger: ['bg-danger/15', 'text-danger', 'border', 'border-danger/30', 'hover:bg-danger/25'],
};

const sizeClasses: Record<ButtonSize, string[]> = {
  sm: ['px-3', 'py-1.5', 'text-sm'],
  md: ['px-4', 'py-2.5', 'text-sm'],
  lg: ['px-5', 'py-3', 'text-base'],
};

function joinClasses(values: (string | undefined | null | false)[]): string {
  return values.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...buttonProps
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={joinClasses([
        ...baseClasses,
        ...variantClasses[variant],
        ...sizeClasses[size],
        className,
      ])}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
