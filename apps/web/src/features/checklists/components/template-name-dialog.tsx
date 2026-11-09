import { useState } from 'react';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

type TemplateNameDialogProps = {
  title: string;
  description: string;
  label: string;
  inputId: string;
  initialName: string;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
};

function NameForm({
  label,
  inputId,
  initialName,
  submitLabel,
  pendingLabel,
  pending,
  onSubmit,
  onClose,
}: Omit<TemplateNameDialogProps, 'title' | 'description'>) {
  const [name, setName] = useState(initialName);

  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId} className="font-medium text-foreground">
          {label}
        </Label>
        <Input
          id={inputId}
          value={name}
          className="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim()} className="shadow-xs font-medium">
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function TemplateNameDialog({
  title,
  description,
  onClose,
  ...form
}: TemplateNameDialogProps) {
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
    >
      <NameForm onClose={onClose} {...form} />
    </Modal>
  );
}
