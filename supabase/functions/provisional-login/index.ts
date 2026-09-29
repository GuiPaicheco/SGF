const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });

  return Response.json(
    { error: 'Acesso provisório encerrado. Utilize seu acesso individual.' },
    {
      status: 410,
      headers: {
        ...cors,
        'Cache-Control': 'no-store',
      },
    },
  );
});
