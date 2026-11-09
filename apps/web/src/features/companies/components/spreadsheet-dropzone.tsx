import { useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import type { ReadSpreadsheet } from '@/features/companies/utils/spreadsheet';
import { cn } from '@/shared/lib/cn';

type SpreadsheetDropzoneProps = { file: ReadSpreadsheet | null; onFile: (file: File) => void };

export function SpreadsheetDropzone({ file, onFile }: SpreadsheetDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div
      className={cn(
        'bg-card rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition-colors shadow-xs',
        dragging ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <span className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-full mb-4 shadow-xs">
        <Upload className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold font-display text-foreground">
        Arraste sua planilha (.xlsx ou .csv) aqui ou escolha o arquivo
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Aceita o .xlsx exportado do seu sistema ou um CSV. Só a primeira aba é lida.
      </p>
      <label className="bg-primary text-primary-foreground hover:bg-primary/90 focus-within:ring-ring mt-5 inline-flex h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium focus-within:ring-2 shadow-xs transition-colors">
        Escolher arquivo
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) onFile(chosen);
          }}
        />
      </label>
      {file ? (
        <p className="mt-4 text-sm text-foreground">
          Arquivo selecionado: <strong className="font-semibold text-primary">{file.name}</strong>
        </p>
      ) : null}
    </div>
  );
}
