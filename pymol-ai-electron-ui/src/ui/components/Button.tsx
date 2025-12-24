import React from 'react';

type Variant = 'solid'|'ghost'|'outline'|'outlineBrand'|'brandSolid';
type Size = 'sm'|'md'|'lg';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button: React.FC<Props> = ({ className='', variant='solid', size='md', ...rest }) => {
  const sizes: Record<Size,string> = {
    sm: 'px-3 h-8 text-sm',         // narrow pill
    md: 'px-4 h-10',
    lg: 'px-6 h-12 text-lg',
  };
  const base = 'inline-flex items-center justify-center select-none rounded-[999px] border-0 focus:outline-none focus:ring-2 focus:ring-brand/60 transition';
  const styles: Record<Variant,string> = {
  solid: 'bg-[#2A2A2A] text-neutral-100 hover:bg-[#1F1F1F]',
  ghost: 'bg-transparent text-neutral-200 hover:bg-[#2A2A2A]',
  outline: 'bg-transparent text-neutral-100 border border-neutral-500 hover:bg-[#2A2A2A]',
  outlineBrand: 'bg-transparent text-brand border border-brand hover:bg-brand/10',
  brandSolid: 'bg-brand text-black hover:bg-brandHover'   // ← new
  };
  return <button className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...rest} />;
};
