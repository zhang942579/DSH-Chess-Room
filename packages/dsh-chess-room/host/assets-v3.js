import { readFile } from 'node:fs/promises';

const STATES = Object.freeze(['idle', 'thinking', 'smug', 'surprised', 'troubled', 'victory', 'defeat']);
export const AVATAR_BASE = '/api/dsh-chess-room/avatar-v2';
// Connection dispatches these exact paths only after browser admission. Neither
// URLs nor request bodies ever become filesystem paths; no wildcard file route.
export function registerAvatarAssets(ctx,readAsset=readFile) {
  for (const state of STATES) for (const format of ['png', 'webp']) {
    const file = new URL(`../assets/expressions/${state}.${format}`, import.meta.url);
    ctx.connection.fetch.register({
      path: `${AVATAR_BASE}/${state}.${format}`, methods: ['GET'], requestBody: 'buffered',
      // Without this mode the native HTTP bridge supplies a stream body to GET;
      // WHATWG Request throws before this handler can return the image.
      async fetch() {
        try {
          const bytes = await readAsset(file);
          return new Response(bytes, {headers: {
            'content-type': `image/${format}`,
            'cache-control': 'private, max-age=86400',
            'x-content-type-options': 'nosniff',
          }});
        } catch {
          return Response.json({ok: false, code: 'avatar-unavailable'}, {
            status: 503, headers: {'cache-control': 'no-store'},
          });
        }
      },
    });
  }
}
