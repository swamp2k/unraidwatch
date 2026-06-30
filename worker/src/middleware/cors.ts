import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

export const corsMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const origin = c.req.header('Origin') ?? '';
  const allowed = c.env.APP_URL;

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origin === allowed ? origin : allowed,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    await next();
  } finally {
    c.res.headers.set('Access-Control-Allow-Origin', origin === allowed ? origin : allowed);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  }
});
