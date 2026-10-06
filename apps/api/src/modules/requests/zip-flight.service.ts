import { Injectable } from '@nestjs/common';
import type { StreamableFile } from '@nestjs/common';
import { ZipAlreadyInFlight } from './errors.js';

/** Serializa downloads do MESMO zip. Antes isto era um cache de `Promise<StreamableFile>`:
 *  dois cliques concorrentes recebiam o mesmo `Readable` — que só pode ser consumido uma
 *  vez — e o segundo baixava um arquivo truncado, com os handlers de erro escrevendo na
 *  response do primeiro. Stream não se compartilha; concorrente agora recebe 409. */
@Injectable()
export class ZipFlightService {
  private readonly inFlight = new Set<string>();

  async execute(key: string, fn: () => Promise<StreamableFile>): Promise<StreamableFile> {
    if (this.inFlight.has(key)) throw new ZipAlreadyInFlight();
    this.inFlight.add(key);

    let file: StreamableFile;
    try {
      file = await fn();
    } catch (error) {
      this.inFlight.delete(key);
      throw error;
    }

    /* A chave só é liberada quando o stream termina de verdade: `fn()` resolve assim que o
     * arquivo é montado, muito antes do último byte sair. */
    const release = () => this.inFlight.delete(key);
    const stream = file.getStream();
    stream.once('close', release);
    stream.once('error', release);

    return file;
  }
}
