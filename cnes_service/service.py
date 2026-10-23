import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

from . import parsers
from .cadastro import build_cadastro

BASE = "https://cnes2.datasus.gov.br/"
CATALOG = Path(__file__).resolve().parents[1] / "data" / "unidades.json"


class SourceError(Exception):
    pass


class NotFound(Exception):
    pass


class CNESService:
    def __init__(self, client):
        self.client = client
        self.limit = asyncio.Semaphore(4)
        self.sources = []

    async def fetch(self, path):
        url = urljoin(BASE, path)
        if urlparse(url).netloc != urlparse(BASE).netloc:
            raise SourceError("Link externo inesperado na fonte")
        async with self.limit:
            for attempt in range(3):
                try:
                    response = await self.client.get(url)
                    response.raise_for_status()
                    # O HTML antigo usa Windows-1252, mesmo sem declarar charset.
                    html = response.content.decode("cp1252", errors="replace")
                    if "<html" not in html.lower():
                        raise SourceError("A fonte não retornou HTML")
                    self.sources.append(str(response.url))
                    return html
                except (httpx.HTTPError, SourceError) as exc:
                    if attempt == 2:
                        raise SourceError(f"Falha ao consultar {url}") from exc
                    await asyncio.sleep(0.3 * (attempt + 1))

    async def resolve(self, cnes, municipio=None):
        if municipio:
            return municipio + cnes
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        if cnes in catalog:
            return catalog[cnes]
        try:
            response = await self.client.get("https://cnes.datasus.gov.br/services/estabelecimentos", params={"cnes": cnes})
            response.raise_for_status()
            items = response.json()
            if not isinstance(items, list):
                raise ValueError("Formato inesperado")
            for item in items:
                unit = str(item.get("id", ""))
                if re.fullmatch(r"\d{13}", unit) and unit.endswith(cnes):
                    return unit
            if not items:
                raise NotFound("CNES não encontrado no portal")
            raise ValueError("Identificador ausente")
        except (httpx.HTTPError, ValueError) as exc:
            raise SourceError("Busca nacional indisponível. Informe municipio com o código IBGE de 6 dígitos do CNES para consultar diretamente o CNESNet.") from exc

    async def consult(self, cnes, municipio=None, include_modules=True):
        unit = await self.resolve(cnes, municipio)
        main = await self.fetch(f"Exibe_Ficha_Estabelecimento.asp?VCo_Unidade={unit}")
        estab = parsers.establishment(main, cnes)
        warnings = []

        async def optional(path, parser, label):
            try:
                async with asyncio.timeout(45):
                    return parser(await self.fetch(path))
            except (SourceError, parsers.LayoutError, TimeoutError) as exc:
                warnings.append({"secao": label, "erro": str(exc) or "Tempo limite de 45 segundos excedido"})
                return None

        profs, teams, basic = await asyncio.gather(
            optional(f"Mod_Profissional.asp?VCo_Unidade={unit}", parsers.professionals, "profissionais"),
            optional(f"Mod_Equipes.asp?VCo_Unidade={unit}", parsers.teams, "equipes"),
            optional(f"Mod_Basico.asp?VCo_Unidade={unit}", parsers.module, "Mod_Basico"))

        async def enrich(team):
            path = team.pop("_href")
            team["profissionais"] = await optional(path, parsers.members, f"equipe:{team['ine']}")
        await asyncio.gather(*(enrich(t) for t in teams or []))
        if profs is not None and teams is not None:
            parsers.link_teams(profs, teams)
        modules = {"Mod_Basico": basic}
        if include_modules:
            # Descobre módulos publicados na ficha; preserva tabelas sem inventar semântica.
            paths = sorted({a["href"] for a in parsers.soup(main).select("a[href]")
                            if re.fullmatch(r"Mod_[A-Za-z_]+\.asp\?VCo_Unidade=" + unit + r"(?:&VCo_Cnes=\d{7})?", a["href"], re.I)
                            and not a["href"].startswith(("Mod_Profissional.", "Mod_Equipes.", "Mod_Basico."))})
            async def module(path):
                modules[path.split(".")[0]] = await optional(path, parsers.module, path.split(".")[0])
            await asyncio.gather(*(module(p) for p in paths))
        active = [p for p in profs or [] if p["situacao"].casefold() == "ativo"]
        return {"cnes": cnes, "co_unidade": unit, "estabelecimento": estab,
                "cadastro": build_cadastro(estab, profs, basic, teams is not None),
                "profissionais": profs, "equipes": teams, "modulos": modules,
                "resumo": {"registros_profissionais": len(profs) if profs is not None else None,
                           "vinculos_ativos": len(active) if profs is not None else None,
                           "pessoas_cns_distintos": len({p['cns_principal'] or p['cns'] for p in profs}) if profs is not None else None,
                           "equipes": len(teams) if teams is not None else None},
                "metadados": {"coletado_em": datetime.now(timezone.utc).isoformat(),
                              "fonte": "CNESNet/DATASUS", "urls": sorted(set(self.sources)),
                              "competencia": None, "completo_no_escopo_solicitado": not warnings,
                              "modulos_solicitados": include_modules,
                              "avisos": warnings,
                              "limite": "Dados públicos presentes nas páginas consultadas. Não representa cadastro interno nem garantia de atualização em tempo real. Competência não informada pela página."}}

