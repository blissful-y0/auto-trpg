import { type TextareaHTMLAttributes, type ReactNode } from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  description?: string;
};

export function Textarea({
  label,
  description,
  className = '',
  id,
  ...textareaProps
}: TextareaProps): JSX.Element {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id}>{label}</label>}
      <textarea
        id={id}
        className={`input-field ${className}`.trim()}
        rows={textareaProps.rows ?? 4}
        {...textareaProps}
      />
      {description && <p className="text-caption text-text-tertiary">{description}</p>}
    </div>
  );
}
