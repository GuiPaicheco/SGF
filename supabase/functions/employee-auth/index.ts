const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  return new Response(JSON.stringify({
    error: 'Endpoint encerrado. Use o acesso unificado e a solicitação sujeita à aprovação administrativa.',
  }), {
    status: 410,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
