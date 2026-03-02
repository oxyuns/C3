'use client';

interface LogoProps {
  color?: 'white' | 'black';
  size?: number;
  className?: string;
}

export function Logo({ color = 'white', size = 32, className = '' }: LogoProps) {
  const fill = color === 'white' ? '#ffffff' : '#000000';

  return (
    <svg
      width={size * 1.6}
      height={size}
      viewBox="0 0 160 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
        fontWeight="900"
        fontSize="96"
        fill={fill}
        letterSpacing="-4"
      >
        C3
      </text>
    </svg>
  );
}

export function LogoWithText({
  color = 'white',
  logoSize = 28,
  className = '',
}: {
  color?: 'white' | 'black';
  logoSize?: number;
  className?: string;
}) {
  const textColor = color === 'white' ? 'text-white' : 'text-black';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Logo color={color} size={logoSize} />
      <span className={`text-xs ${textColor} opacity-60 font-medium`}>
        Canton Contract Catalyst
      </span>
    </div>
  );
}
