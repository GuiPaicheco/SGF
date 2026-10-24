"""Consulta CNES somente para administrador autenticado; nunca grava cadastros."""
import asyncio
import json
import os
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from cnes_service.service import CNESService, SourceError
from cnes_service.parsers import LayoutError

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
SUPABASE = os.environ.get('SUPABASE_URL', 'https://ijhvbzomakbbxverqfqh.supabase.co').rstrip('/')
CATALOG = json.loads((Path(__file__).resolve().parents[1] / 'config/rh-units.json').read_text(encoding='utf-8'))
_cache = {}
_gate = asyncio.Semaphore(2)


async def collect_unit(cnes):
    cached = _cache.get(cnes)
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    try:
        async with asyncio.timeout(3):
            await _gate.acquire()
    except TimeoutError:
        raise HTTPException(429, 'Há consultas CNES em andamento. Aguarde e tente novamente.') from None
    try:
        async with asyncio.timeout(120):
            for attempt in range(2):
                # Uma falha transitória de uma seção não deve exigir repetir a ação.
                # Reconsulta inteira, com cliente novo; nunca mescla coletas parciais.
                async with httpx.AsyncClient(timeout=20, follow_redirects=False) as source:
                    result = await CNESService(source).consult(cnes, '310670', False)
                if result['metadados']['completo_no_escopo_solicitado']:
                    break
                if attempt == 0:
                    await asyncio.sleep(0.3)
        if result['metadados']['completo_no_escopo_solicitado']:
            _cache[cnes] = (time.monotonic(), result)
        return result
    finally:
        _gate.release()


@app.get('/api/cnes')
async def consult(request: Request, cnes: str):
    if cnes not in {u['cnes'] for u in CATALOG}:
        raise HTTPException(422, 'Unidade não disponível no catálogo.')
    auth = request.headers.get('authorization', '')
    key = request.headers.get('apikey', '')
    if not auth.startswith('Bearer ') or not key:
        raise HTTPException(401, 'Sessão obrigatória.')
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            headers = {'Authorization': auth, 'apikey': key}
            user = await client.get(SUPABASE + '/auth/v1/user', headers=headers)
            if user.status_code != 200:
                raise HTTPException(401, 'Sessão inválida.')
            profile = await client.get(SUPABASE + '/rest/v1/profiles', headers=headers,
                params={'id': 'eq.' + user.json()['id'], 'select': 'roles,disabled_at,must_change_password,institutional_cnes_unit_id'})
            rows = profile.json() if profile.status_code == 200 else []
            if not isinstance(rows, list) or len(rows) != 1:
                raise HTTPException(403, 'Acesso exclusivo do Administrador.')
            p = rows[0]
            if 'administrador' not in p['roles'] or p['disabled_at'] or p['must_change_password'] or p['institutional_cnes_unit_id']:
                raise HTTPException(403, 'Acesso exclusivo do Administrador.')
        result = await collect_unit(cnes)
        # O consumidor exige completude e nunca transforma falha em lista vazia.
        if len(json.dumps(result).encode('utf-8')) > 3_800_000:
            raise HTTPException(413, 'Consulta excedeu o limite seguro. Nenhum cadastro alterado.')
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})
    except HTTPException:
        raise
    except (httpx.HTTPError, SourceError, LayoutError, TimeoutError):
        raise HTTPException(502, 'Fonte CNES indisponível ou incompleta. Nenhum cadastro foi alterado.') from None
