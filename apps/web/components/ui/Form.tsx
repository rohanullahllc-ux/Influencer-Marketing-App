export function FormSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {title && <h3 className="text-card-title text-ink">{title}</h3>}
      {description && <p className="mt-0.5 text-supporting text-ink-subtle">{description}</p>}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </div>
  );
}

const inputClasses =
  "w-full rounded-control border border-border-strong bg-white px-3 py-2 text-body text-ink placeholder:text-ink-faint focus-visible:focus-ring";

export function FormField({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-supporting font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-meta text-ink-faint">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClasses} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClasses} ${props.className ?? ""}`} />;
}
