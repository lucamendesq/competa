import ee2 from 'eventemitter2';
import type { ConstructorOptions, EventEmitter2 as Emitter } from 'eventemitter2';

export type EventEmitter2 = Emitter;

/* O `.d.ts` do eventemitter2 declara `export default` num pacote CJS cujo `module.exports`
 * É a própria classe. Sob `nodenext` o TypeScript lê o default como o namespace do módulo,
 * e o loader ESM do node não enxerga export nomeado nenhum (`node dist/main.js` quebra no
 * import, embora o vitest não). Esta é a tradução — o wrapper de DI do Nest tinha um
 * arquivo só para ela. */
export const EventEmitter2 = ee2 as unknown as new (options?: ConstructorOptions) => Emitter;
