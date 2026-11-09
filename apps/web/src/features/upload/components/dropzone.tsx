import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import { Camera, Upload } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type DropzoneProps = {
  title: string;
  hint: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  icon?: boolean;
  camera?: boolean;
};

const filesFrom = (event: ChangeEvent<HTMLInputElement>) => {
  const files = [...(event.target.files ?? [])];
  event.target.value = '';
  return files;
};

function FileInputLabel({
  className,
  disabled,
  onFiles,
  children,
  capture,
}: {
  className: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  capture?: boolean;
}) {
  return (
    <label className={className}>
      {children}
      <input
        type="file"
        className="sr-only"
        disabled={disabled}
        {...(capture ? { accept: 'image/*', capture: 'environment' as const } : { multiple: true })}
        onChange={(event) => {
          const files = filesFrom(event);
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

export function Dropzone({
  title,
  hint,
  disabled,
  onFiles,
  className,
  icon = false,
  camera = false,
}: DropzoneProps) {
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    if (files.length && !disabled) onFiles(files);
  };

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      className={cn(disabled && 'opacity-50 pointer-events-none')}
    >
      <FileInputLabel
        disabled={disabled}
        onFiles={onFiles}
        className={cn(
          'border-border hover:bg-muted/50 focus-within:ring-ring flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center focus-within:ring-2 bg-white',
          className,
        )}
      >
        {icon ? <Upload className="text-muted-foreground h-5 w-5" aria-hidden="true" /> : null}
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </FileInputLabel>
      {camera ? (
        <FileInputLabel
          capture
          disabled={disabled}
          onFiles={onFiles}
          className="border-border hover:bg-muted/50 focus-within:ring-ring mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium focus-within:ring-2 sm:hidden bg-white"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Tirar foto do documento
        </FileInputLabel>
      ) : null}
    </div>
  );
}

export function UploadProgress({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      className={cn(
        'border-border flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center bg-white/60',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Upload className="text-primary animate-bounce h-5 w-5" aria-hidden="true" />
      <span className="text-sm font-medium">Enviando arquivos…</span>
      <div
        className="bg-muted h-2 w-full max-w-xs overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Progresso do envio"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="bg-primary h-full transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-muted-foreground text-xs" aria-hidden="true">
        {percent < 100 ? `${percent}%` : 'Aguarde a confirmação'}
      </span>
    </div>
  );
}
