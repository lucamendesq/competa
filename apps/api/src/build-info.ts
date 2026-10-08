import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* `compiledAt` é o mtime do arquivo compilado que ESTE processo carregou, lido uma vez na
 * carga do módulo: ele não acompanha rebuilds posteriores. É de propósito — quando o watch
 * do Nest recompila mas não respawna, o valor servido continua o do build antigo e denuncia
 * que o processo está rodando código velho. */
export const buildInfo = {
  startedAt: new Date().toISOString(),
  compiledAt: statSync(fileURLToPath(import.meta.url)).mtime.toISOString(),
};
