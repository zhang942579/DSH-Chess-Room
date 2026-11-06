import { z } from 'zod';

/**
 * Open the caller-owned, single-record persistent chess-room domain.
 * The envelope is validated by a real Zod schema. Game payloads intentionally
 * remain unknown here: the controller must replay/validate them through its
 * GameAdapter before use. Domain/storage errors propagate; no memory fallback.
 *
 * createStorage(ctx) -> Promise<{read():Envelope,
 *   write(value:Envelope):Promise<void>, close():Promise<void>}>.
 */
export async function createStorage(ctx) {
  const domain = await ctx.storageDomain.open({
    name: 'dsh_chess_room',
    version: 1,
    layout: 'single',
    global: {
      schema: z.object({
        format: z.literal(1),
        revision: z.number().int().nonnegative(),
        current: z.unknown().nullable(),
        archived: z.array(z.unknown()),
      }),
      initial: { format: 1, revision: 0, current: null, archived: [] },
    },
    tables: {},
  });
  return {
    read: () => structuredClone(domain.global.get()),
    write: async value => domain.global.set(value),
    close: () => domain.close(),
  };
}
