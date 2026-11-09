import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTestWhatsApp } from '@/features/whatsapp/queries/use-whatsapp';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';

export function TestMessageForm() {
  const [phone, setPhone] = useState('');
  const [confirming, setConfirming] = useState(false);
  const testWhatsApp = useTestWhatsApp();

  const send = () => {
    setConfirming(false);
    return testWhatsApp
      .mutateAsync(phone)
      .then(() => {
        toast.success('Mensagem enviada', { description: 'Verifique o celular de destino.' });
        setPhone('');
      })
      .catch(() => toast.error('Erro no envio', { description: 'A mensagem de teste falhou.' }));
  };

  return (
    <Card className="border border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle level={2} className="font-display">
          Disparo de Teste
        </CardTitle>
        <CardDescription>
          Envie uma mensagem para validar se sua integração está funcionando.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-sm items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (phone) setConfirming(true);
          }}
        >
          <Input
            value={phone}
            aria-label="Telefone para o teste"
            placeholder="Ex: 5511999999999"
            className="w-full"
            onChange={(event) => setPhone(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={testWhatsApp.isPending || !phone}>
            {testWhatsApp.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Testar
          </Button>
        </form>
      </CardContent>
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title="Enviar mensagem de teste?"
        description={`A mensagem vai para ${phone}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void send()}>Enviar</Button>
          </>
        }
      />
    </Card>
  );
}
