import { type InputHTMLAttributes, type ReactNode } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  description?: string;
};

export function Input({
  label,
  description,
  className = '',
  id,
  ...inputProps
}: InputProps): JSX.Element {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        className={`input-field ${className}`.trim()}
        {...inputProps}
      />
      {description && <p className="text-caption text-text-tertiary">{description}</p>}
    </div>
  );
}
