import { useState } from 'react';
import { Logo } from '@/shared/components/logo';
import { InstallButton } from '@/shared/pwa';

export function UploadHeader({
  firmName,
  logoUrl,
}: {
  firmName: string | undefined;
  logoUrl: string | null;
}) {
  const [logoBroken, setLogoBroken] = useState(false);

  return (
    <header className="bg-white border-b border-border w-full px-4 py-3 flex items-center justify-between sm:px-6">
      {logoUrl && !logoBroken ? (
        <div className="flex min-w-0 items-center gap-2">
          {/* A URL desta página carrega o token: sem no-referrer ele vazaria para o host do logo. */}
          <img
            src={logoUrl}
            alt=""
            className="h-6 w-auto max-w-[120px] shrink-0 object-contain"
            referrerPolicy="no-referrer"
            onError={() => setLogoBroken(true)}
          />
          <span className="truncate text-sm font-semibold text-foreground">{firmName}</span>
        </div>
      ) : (
        <Logo variant="icon" surface="auto" className="h-6" />
      )}
      <InstallButton variant="card" />
    </header>
  );
}
