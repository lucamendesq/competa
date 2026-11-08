import { useState, type ReactNode } from 'react';
import { InboxIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonVariants } from '@/shared/components/ui/button';
import { InstallButton, InstallSteps } from '@/shared/pwa';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { EmptyState } from '@/shared/components/ui/empty';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/shared/components/ui/native-select';
import { Pagination } from '@/shared/components/ui/pagination';
import { Separator } from '@/shared/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { Textarea } from '@/shared/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Callout } from '@/shared/components/callout';
import { DueDate } from '@/shared/components/due-date';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { Logo } from '@/shared/components/logo';
import { Modal } from '@/shared/components/modal';
import { NotFoundState } from '@/shared/components/not-found-state';
import { PageHeader } from '@/shared/components/page-header';
import { Spinner } from '@/shared/components/spinner';
import { StatusPill } from '@/shared/components/status-pill';

const VARIANTS: NonNullable<ButtonVariants['variant']>[] = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
];
const SIZES: NonNullable<ButtonVariants['size']>[] = ['xs', 'sm', 'default', 'lg'];
const STATUSES = [
  'pending',
  'submitted',
  'accepted',
  'rejected',
  'open',
  'complete',
  'closed',
  'overdue',
  'queued',
  'sent',
  'delivered',
  'failed',
  'inactive',
  'active',
  'extra',
  'resent',
  'removed',
  'added',
  'not_applicable',
  'own_template',
  'connected',
  'disconnected',
];
const ICON_SIZES: NonNullable<ButtonVariants['size']>[] = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function UiGallery() {
  const [page, setPage] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="bg-canvas min-h-svh space-y-10 p-6">
      <h1 className="font-display text-2xl font-semibold">Galeria de primitivos</h1>

      <Section title="Button">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-2">
            {SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {variant} {size}
              </Button>
            ))}
            {ICON_SIZES.map((size) => (
              <Button key={size} variant={variant} size={size} aria-label={`${variant} ${size}`}>
                <PlusIcon />
              </Button>
            ))}
            <Button variant={variant} disabled>
              desabilitado
            </Button>
          </div>
        ))}
      </Section>

      <Section title="Input, Label, Textarea e NativeSelect">
        <div className="grid max-w-xl gap-4">
          <div className="grid gap-2">
            <Label htmlFor="gallery-name">Nome da empresa</Label>
            <Input id="gallery-name" placeholder="Ex.: Mercado Bom Preço" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gallery-invalid">CNPJ</Label>
            <Input id="gallery-invalid" aria-invalid defaultValue="123" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gallery-disabled">Desabilitado</Label>
            <Input id="gallery-disabled" disabled defaultValue="somente leitura" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gallery-reason">Motivo da recusa</Label>
            <Textarea id="gallery-reason" placeholder="Explique o que precisa ser corrigido" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gallery-select">Canal</Label>
            <NativeSelect id="gallery-select" defaultValue="">
              <NativeSelectOption value="">Todos os canais</NativeSelectOption>
              <NativeSelectOption value="email">E-mail</NativeSelectOption>
              <NativeSelectOption value="whatsapp">WhatsApp</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
      </Section>

      <Section title="Table e Pagination">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Mercado Bom Preço</TableCell>
              <TableCell>11.222.333/0001-81</TableCell>
              <TableCell>Ativa</TableCell>
            </TableRow>
            <TableRow data-state="selected">
              <TableCell>Oficina Roda Viva</TableCell>
              <TableCell>—</TableCell>
              <TableCell>Ativa</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={20} onPageChange={setPage} />
      </Section>

      <Section title="Card e Separator">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Competência atual</CardTitle>
            <CardDescription>Novembro/2026 · 0 de 2 entregues</CardDescription>
          </CardHeader>
          <CardContent>
            <Separator />
          </CardContent>
          <CardFooter className="border-t">
            <Button size="sm">Ver painel</Button>
          </CardFooter>
        </Card>
        <div className="flex h-6 items-center gap-3 text-sm">
          <span>Empresas</span>
          <Separator orientation="vertical" />
          <span>Templates</span>
        </div>
      </Section>

      <Section title="Dialog, Sheet, Tooltip e Toaster">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialogOpen(true)}>Abrir diálogo</Button>
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Abrir sheet
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Passe o mouse</Button>
            </TooltipTrigger>
            <TooltipContent>O link anterior vale por até 30 dias.</TooltipContent>
          </Tooltip>
          <Button variant="secondary" onClick={() => toast.success('Template salvo.')}>
            Toast de sucesso
          </Button>
          <Button variant="secondary" onClick={() => toast.error('Não foi possível concluir.')}>
            Toast de erro
          </Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abrir nova competência</DialogTitle>
              <DialogDescription>
                Isto cria um checklist para cada empresa com base no template delas.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button>Revisar envios</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>Navegação principal</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </Section>

      <Section title="Skeleton e EmptyState">
        <div className="grid max-w-md gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full" />
        </div>
        <EmptyState
          icon={InboxIcon}
          title="Nenhuma empresa"
          description="Cadastre a primeira empresa para solicitar documentos."
          actionLabel="Nova empresa"
        />
      </Section>

      <Section title="PageHeader, Logo e Spinner">
        <PageHeader title="Competências" description="Abertura do mês e disparos de e-mail.">
          <Button>Abrir competência</Button>
        </PageHeader>
        <div className="flex items-center gap-6">
          <Logo className="h-8" />
          <Logo variant="icon" className="h-8" />
          <div className="bg-anchor flex h-12 items-center rounded-md px-3">
            <Logo surface="dark" className="h-8" />
          </div>
          <Spinner />
        </div>
      </Section>

      <Section title="StatusPill">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title="Callout e DueDate">
        <div className="grid max-w-xl gap-3">
          <Callout tone="info" heading="Plano Essencial">
            Até 40 empresas ativas.
          </Callout>
          <Callout tone="warning" heading="Fatura em aberto">
            Pague para continuar abrindo competências.
          </Callout>
          <Callout tone="danger" heading="Falha no envio">
            O e-mail voltou: caixa de entrada cheia.
          </Callout>
          <Callout tone="success" actions={<Button size="sm">Ver</Button>}>
            Template salvo.
          </Callout>
          <Callout tone="neutral" heading="Somente leitura">
            Só o dono da Contabilidade pode alterar estas configurações.
          </Callout>
        </div>
        <div className="flex gap-4">
          <DueDate date={null} />
          <DueDate date="2020-01-10" />
          <DueDate date="2099-01-10" />
        </div>
      </Section>

      <Section title="LoadingRows, ErrorState e NotFoundState">
        <LoadingRows count={2} />
        <ErrorState
          error={new TypeError('Failed to fetch')}
          retry={() => toast('Tentando de novo')}
        />
        <NotFoundState
          title="Competência não encontrada"
          to="/competencias"
          backLabel="Voltar para Competências"
        />
      </Section>

      <Section title="Modal">
        <Button onClick={() => setModalOpen(true)}>Abrir modal</Button>
        <Modal
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Remover contador?"
          description="A sessão e as passkeys dele são revogadas imediatamente."
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive">Remover</Button>
            </>
          }
        />
      </Section>

      <Section title="InstallButton">
        <div className="flex items-center gap-4">
          <InstallButton />
          <InstallButton variant="card" />
        </div>
        <div className="max-w-md rounded-xl border border-border p-4">
          <p className="text-muted-foreground mb-3 text-sm">Dica do iOS (Safari):</p>
          <InstallSteps isIos platform="ios" />
        </div>
      </Section>
    </main>
  );
}
