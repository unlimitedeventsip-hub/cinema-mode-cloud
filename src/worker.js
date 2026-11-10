import { onRequestPost as uploadInit } from '../functions/api/upload/init.js';
import { onRequestPost as uploadPart } from '../functions/api/upload/part.js';
import { onRequestPost as uploadComplete } from '../functions/api/upload/complete.js';
import { onRequestPost as uploadAbort } from '../functions/api/upload/abort.js';
import { onRequestPost as deleteMovie } from '../functions/api/delete.js';
import { onRequestGet as ticket } from '../functions/api/ticket.js';
import { onRequestGet as playGet, onRequestHead as playHead } from '../functions/api/play.js';

const routes = {
  '/api/upload/init': { POST: uploadInit },
  '/api/upload/part': { POST: uploadPart },
  '/api/upload/complete': { POST: uploadComplete },
  '/api/upload/abort': { POST: uploadAbort },
  '/api/delete': { POST: deleteMovie },
  '/api/ticket': { GET: ticket },
  '/api/play': { GET: playGet, HEAD: playHead }
};

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') {
      if (request.method !== 'GET') return json({error:'Method Not Allowed'}, 405, {Allow:'GET'});
      const checks = {
        storage: Boolean(env.CINEMA_BUCKET),
        authConfig: Boolean((env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)),
        ticketSecret: Boolean(env.TICKET_SECRET && env.TICKET_SECRET.length >= 32)
      };
      return json({service:'Cinema Mode API',ready:Object.values(checks).every(Boolean),checks});
    }
    if (pathname.startsWith('/api/')) {
      const route = routes[pathname];
      if (!route) return json({error:'API route not found'},404);
      const handler = route[request.method];
      if (!handler) return json({error:'Method Not Allowed'},405,{Allow:Object.keys(route).join(', ')});
      try { return await handler({request,env,ctx,params:{}}); }
      catch (err) {
        console.error('Cinema Mode API failure',err);
        return json({error:'Eroare internă a serverului'},500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
