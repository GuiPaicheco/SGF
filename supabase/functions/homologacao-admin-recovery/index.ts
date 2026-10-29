// Recuperação temporária autorizada em 29/10/2026 já encerrada.
// O recurso permanece inerte e exige JWT no gateway.
Deno.serve(()=>new Response('Recurso de recuperação encerrado.',{status:410}));
