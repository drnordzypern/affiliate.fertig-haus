import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const controlClasses =
  "w-full rounded-sm border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm text-charcoal-900 placeholder:text-charcoal-500/60 focus:border-olive-600 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-charcoal-500";

function FieldShell({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-charcoal-900">
        {label}
        {required && (
          <span className="text-terracotta-600" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-charcoal-500">
          {hint}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
};

export function TextField({ id, label, hint, required, ...rest }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} required={required}>
      <input
        id={id}
        required={required}
        className={controlClasses}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  hint?: string;
};

export function TextAreaField({
  id,
  label,
  hint,
  required,
  rows = 4,
  ...rest
}: TextAreaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} required={required}>
      <textarea
        id={id}
        required={required}
        rows={rows}
        className={controlClasses}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({
  id,
  label,
  hint,
  required,
  options,
  placeholder,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} required={required}>
      <select
        id={id}
        required={required}
        defaultValue=""
        className={controlClasses}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      >
        <option value="" disabled>
          {placeholder ?? "Bitte wählen"}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  id,
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded-sm border-stone-300 text-olive-700 focus-visible:outline-2 focus-visible:outline-olive-700"
          aria-describedby={hint ? `${id}-hint` : undefined}
          {...rest}
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-charcoal-700">
          {label}
        </label>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="pl-7 text-xs text-charcoal-500">
          {hint}
        </p>
      )}
    </div>
  );
}
