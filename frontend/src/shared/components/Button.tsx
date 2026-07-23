interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline';
  size?: 'md' | 'lg';
}

/**
 * The one button treatment of the app (DESIGN §4.4). Visuals live in the
 * `.btn*` classes in index.css so hover states stay in CSS; link-shaped
 * actions can reuse those classes directly on an <a>.
 */
export default function Button({
  variant = 'outline',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(' ');
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
