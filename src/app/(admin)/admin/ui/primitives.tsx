'use client';

import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/**
 * The admin's component vocabulary.
 *
 * One file, because the whole point is that there is exactly one Button, one
 * Field and one Panel. The first build drifted — different button shapes on
 * different screens, labels styled inline — and the register is explicit that
 * inconsistent component vocabulary across screens means one of them is wrong.
 *
 * Register is product, not brand: earned familiarity, the tool disappears into
 * the task. No display font, no decorative accent, every state accounted for.
 */

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium ' +
  // 150-250ms, and colour/opacity only — never layout properties.
  'transition-[background-color,border-color,color,opacity] duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-45 ' +
  // 44px minimum hit area on the default size, per the touch-target rule.
  'min-h-11 px-4 py-2.5';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Exactly one primary per surface. The accent earns its use here and nowhere
  // decorative.
  primary:
    'bg-gold text-[rgb(12_10_20)] hover:bg-gold/90 active:bg-gold/80 disabled:hover:bg-gold',
  secondary:
    'border border-border bg-surface-2 text-fg hover:border-gold/50 hover:text-gold active:bg-surface',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg active:bg-surface',
  // Destructive carries its own role and never sits adjacent to the primary.
  danger:
    'border border-red-500/40 bg-transparent text-red-400 hover:border-red-500/70 hover:bg-red-500/10 active:bg-red-500/15',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', loading = false, icon, children, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      // Loading implies disabled: a button that shows a spinner and still
      // accepts a second click is how duplicate writes happen.
      disabled={rest.disabled ?? loading}
      aria-busy={loading || undefined}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

/* -------------------------------------------------------------- Icon button */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control with no accessible name is unusable. */
  label: string;
  tone?: 'default' | 'danger';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, tone = 'default', children, className = '', ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`inline-grid h-9 w-9 place-items-center rounded-lg border border-transparent text-muted transition-colors duration-150 hover:border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 ${
          tone === 'danger' ? 'hover:text-red-400' : 'hover:text-fg'
        } ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/* ------------------------------------------------------------------- Field */

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Label, hint and error wired to the control with `aria-describedby`.
 *
 * Visible label always — a placeholder is not a label, and it disappears the
 * moment someone starts typing. Errors sit below the field they belong to, not
 * in a summary at the top.
 */
export function Field({ label, hint, error, required, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
        {required ? (
          <span className="ms-1 text-gold" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children({ id, describedBy })}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-xl border bg-bg px-3.5 py-2.5 text-sm text-fg placeholder:text-muted/70 ' +
  'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gold/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 read-only:text-muted';

export function TextInput({
  invalid,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={`${CONTROL_BASE} ${invalid ? 'border-red-500/60' : 'border-border focus:border-gold'} ${className}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function TextArea({
  invalid,
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={`${CONTROL_BASE} resize-y ${invalid ? 'border-red-500/60' : 'border-border focus:border-gold'} ${className}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${CONTROL_BASE} border-border focus:border-gold ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

/* ------------------------------------------------------------------- Panel */

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface ${className}`}>
      {children}
    </section>
  );
}

/**
 * A titled group inside the editor: Identity / Content / Media / Link.
 *
 * The first build stacked every input in one column with no grouping, which is
 * what made it read as a wall. A heading plus a hairline is enough structure —
 * nested cards would be worse, not better.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border/60 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------- Badge */

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${
        tone === 'accent' ? 'bg-gold/15 text-gold' : 'border border-border text-muted'
      }`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Skeleton */

/** Skeletons rather than a spinner in the middle of content, per the register. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none ${className}`}
    />
  );
}

/* -------------------------------------------------------------- EmptyState */

/**
 * Empty states teach the interface. "Nothing here" tells the reader something
 * they already knew; this says what the space is for and hands them the action.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        {description}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
