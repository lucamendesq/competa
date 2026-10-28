import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import env from '../../config/env.js';

export class WhatsappCryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  /* Sem chave NÃO há fallback: o anterior era `'0'.repeat(64)`, uma chave conhecida e
   * pública, e o comentário que o acompanhava dizia "fallback to random" — não era. Token da
   * Meta cifrado com ela é decifrável por qualquer um que leia o banco. Falhar aqui é alto e
   * cedo; o `env.ts` ainda exige a variável em produção, então isto é a segunda barreira. */
  constructor() {
    const secret = env.WHATSAPP_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error(
        'WHATSAPP_ENCRYPTION_KEY ausente: sem ela os tokens da Meta ficariam cifrados com uma chave conhecida.',
      );
    }

    // o formato (64 hex) é garantido pelo env.ts
    this.key = Buffer.from(secret, 'hex');
  }

  encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
