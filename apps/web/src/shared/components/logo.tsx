type LogoProps = {
  variant?: 'icon' | 'horizontal';
  surface?: 'auto' | 'dark';
  alt?: string;
  className?: string;
};

export function Logo({
  variant = 'horizontal',
  surface = 'auto',
  alt = 'Competa',
  className,
}: LogoProps) {
  const tone = surface === 'dark' ? 'white' : 'cobalt';

  return (
    <div className={className ?? 'inline-block'}>
      <img src={`/brand/logo-${variant}-${tone}.svg`} alt={alt} className="h-full w-auto" />
    </div>
  );
}
