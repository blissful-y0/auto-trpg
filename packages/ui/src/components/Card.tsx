import { type ReactNode } from 'react';

type CardProps = {
  title?: string;
  description?: string;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Card({ title, description, footer, className = '', children }: CardProps): JSX.Element {
  return (
    <div className={`card ${className}`}>
      {(title || description) && (
        <div className="mb-3">
          {title && <h3 className="text-heading-3 text-text-primary">{title}</h3>}
          {description && <p className="text-caption text-text-tertiary mt-1">{description}</p>}
        </div>
      )}

      {children && <div>{children}</div>}

      {footer && <div className="mt-4 pt-3 border-t border-line">{footer}</div>}
    </div>
  );
}
