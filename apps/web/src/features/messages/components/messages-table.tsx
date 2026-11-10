import { RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import type { Message } from '@/features/messages/api/message.types';
import { CHANNEL_LABEL, PURPOSE_LABEL } from '@/features/messages/components/message-labels';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { dateTimeBr } from '@/shared/lib/format';

type MessagesTableProps = {
  messages: Message[];
  resendingId: string | null;
  onResend: (message: Message) => void;
};

export function MessagesTable({ messages, resendingId, onResend }: MessagesTableProps) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-sunken/60">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="font-semibold text-foreground">Data</TableHead>
              <TableHead className="font-semibold text-foreground">Empresa</TableHead>
              <TableHead className="font-semibold text-foreground">Tipo</TableHead>
              <TableHead className="font-semibold text-foreground">Canal</TableHead>
              <TableHead className="font-semibold text-foreground">Destinatário</TableHead>
              <TableHead className="font-semibold text-foreground">Status</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.map((row) => (
              <TableRow key={row.id} className="border-border align-top">
                <TableCell className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                  {dateTimeBr(row.createdAt)}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/solicitacoes/${row.requestId}`}
                    className="text-foreground hover:text-primary text-sm font-medium hover:underline"
                  >
                    {row.companyName}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{PURPOSE_LABEL[row.purpose]}</TableCell>
                <TableCell className="text-sm">{CHANNEL_LABEL[row.channel]}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{row.recipient}</TableCell>
                <TableCell>
                  <StatusPill status={row.status} />
                  {row.error ? (
                    <p className="text-danger mt-1 max-w-xs text-xs break-words whitespace-normal">
                      {row.error}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    disabled={resendingId === row.id}
                    onClick={() => onResend(row)}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {resendingId === row.id ? 'Reenviando…' : 'Reenviar mensagem'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
