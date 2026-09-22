import * as icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

// Generic pengganti pola `data-lucide="x"` + `lucide.createIcons()` dari SPA lama -
// terima nama ikon kebab-case yang sama persis (mis. 'layout-dashboard',
// 'bar-chart-3') dan render komponen lucide-react yang sesuai secara dinamis,
// supaya nama ikon di tiap halaman tidak perlu diketik ulang/dipetakan manual.
function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function Icon({ name, className }: { name: string; className?: string }) {
  const Component = (icons as unknown as Record<string, React.ComponentType<LucideProps>>)[toPascalCase(name)];
  if (!Component) return null;
  return <Component className={className} />;
}
