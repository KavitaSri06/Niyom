interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'h-12 w-12',
  md: 'h-14 w-14',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24'
};

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const sizeClass = sizeMap[size];

  return (
    <img
      src="/niyomlogo.png"
      alt="Niyom Wealth Logo"
      className={`${sizeClass} ${className}`}
    />
  );
}
