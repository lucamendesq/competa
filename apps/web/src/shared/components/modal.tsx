import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  wide,
  footer,
  children,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? 'max-w-5xl' : 'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        <div className="-mx-6 -mb-6 max-h-[70vh] overflow-x-hidden overflow-y-auto px-6 pb-6">
          {children}
          {footer ? (
            <div className="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex flex-wrap justify-end gap-2 border-t p-4">
              {footer}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
