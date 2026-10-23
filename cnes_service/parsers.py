"""Extratores do CNESNet. Campos textuais preservam os valores da fonte."""
import re
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup


class LayoutError(ValueError):
    pass


def soup(html):
    return BeautifulSoup(html, "html.parser")


def module(html):
    doc = soup(html)
    text = " ".join(doc.get_text(" ", strip=True).split())
    data = [r for _, r in rows(doc)]
    if re.search(r"estabelecimento n.o possui", text, re.I):
        return {"status": "sem_registros", "linhas": data, "texto": text}
    if not data or not any(marker in text for marker in ("Consulta Estabelecimento", "Ficha Estabelecimento")):
        raise LayoutError("Módulo vazio ou inesperado")
    return {"status": "disponivel", "linhas": data, "texto": text}


def rows(doc):
    for tr in doc.select("tr"):
        cells = tr.find_all(["td", "th"], recursive=False)
        if cells and not any(c.find("table") for c in cells):
            yield tr, [" ".join(c.get_text(" ", strip=True).split()) for c in cells]


PROF_FIELDS = ["nome", "data_entrada", "cns", "cns_principal", "data_atribuicao",
               "cbo", "ch_outros", "ch_ambulatorial", "ch_hospitalar", "ch_total",
               "sus", "vinculacao", "tipo_vinculo", "subtipo_vinculo",
               "competencia_desativacao", "situacao", "portaria_134"]
MEMBER_FIELDS = ["nome", "cns", "cbo", "atividade", "equipe_minima", "ch_hospitalar",
                 "ch_ambulatorial", "ch_outras", "diferenciada", "complementar",
                 "data_entrada", "data_desligamento"]
TEAM_FIELDS = ["tipo", "ine", "nome", "area", "quilombola", "assentado", "geral",
               "escola", "pronasci", "indigena", "ribeirinha", "data_ativacao",
               "data_desativacao"]


def professionals(html):
    doc = soup(html)
    result = []
    header = False
    for _, cells in rows(doc):
        if "Nome" in cells and "CNS" in cells and "CBO" in cells:
            header = True
        elif any(re.fullmatch(r"\d{15}", c) or re.match(r"\d{6}\s*-", c) for c in cells):
            if len(cells) != len(PROF_FIELDS) or not re.fullmatch(r"\d{15}", cells[2]):
                raise LayoutError("Colunas de profissionais alteradas")
            result.append(dict(zip(PROF_FIELDS, cells)))
    if not header:
        raise LayoutError("Cabeçalho de profissionais não reconhecido")
    return result


def members(html):
    result = []
    header = False
    for _, cells in rows(soup(html)):
        if "Nome" in cells and "CNS" in cells and "CBO" in cells:
            header = True
        elif any(re.fullmatch(r"\d{15}", c) or re.fullmatch(r"\d{6}", c) for c in cells):
            if len(cells) != len(MEMBER_FIELDS) or not re.fullmatch(r"\d{15}", cells[1]):
                raise LayoutError("Colunas de membros alteradas")
            result.append(dict(zip(MEMBER_FIELDS, cells)))
    if not header:
        raise LayoutError("Cabeçalho de membros da equipe não reconhecido")
    return result


def teams(html):
    doc = soup(html)
    result = []
    for tr, cells in rows(doc):
        link = tr.find("a", href=re.compile(r"^Mod_Equipes_Profisssional\.asp\?", re.I))
        if link:
            if len(cells) != len(TEAM_FIELDS):
                raise LayoutError("Colunas de equipe alteradas")
            query = parse_qs(urlparse(link["href"]).query)
            if not all(k in query for k in ["VUnidade", "Varea", "VTipo", "VMunicipio", "VSeqEq"]):
                raise LayoutError("Chave da equipe incompleta")
            result.append({**dict(zip(TEAM_FIELDS, cells)), "_href": link["href"]})
    if not result and "INE" not in doc.get_text():
        raise LayoutError("Tabela de equipes não reconhecida")
    return result


def establishment(html, cnes):
    doc = soup(html)
    table_rows = [cells for _, cells in rows(doc)]
    identity = next((r for r in table_rows if len(r) == 3 and r[1] == cnes), None)
    if identity is None:
        raise LayoutError("Ficha não corresponde ao CNES solicitado")
    def after(label):
        for i, r in enumerate(table_rows[:-1]):
            if r and r[0] == label:
                return table_rows[i + 1]
        return []
    text = " ".join(doc.get_text(" ", strip=True).split())
    dates = re.findall(r"(?:\d{1,2}/){2}\d{4}", text)
    address = after("Logradouro:")
    locality = after("Complemento:")
    return {"cnes": cnes, "nome": identity[0], "cnpj": identity[2],
            "logradouro": address[0] if address else None,
            "numero": address[1] if len(address) > 1 else None,
            "telefone": address[2] if len(address) > 2 else None,
            "bairro": locality[1] if len(locality) > 1 else None,
            "cep": locality[2] if len(locality) > 2 else None,
            "municipio": locality[3] if len(locality) > 3 else None,
            "uf": locality[4] if len(locality) > 4 else None,
            "cadastrado_em": dates[0] if dates else None,
            "atualizacao_nacional": dates[1] if len(dates) > 1 else None,
            "atualizacao_local": dates[2] if len(dates) > 2 else None,
            "empresa": after("Nome Empresarial:"), "endereco": after("Logradouro:"),
            "localidade": after("Complemento:"), "tipo": after("Tipo Estabelecimento:"),
            "datas_encontradas_na_ficha": dates[:3], "linhas_ficha": table_rows}


def link_teams(profs, teams_data):
    """Vínculo por CNS; ocupação e dados da equipe permanecem no registro original."""
    for prof in profs:
        ids = {prof.get("cns"), prof.get("cns_principal")} - {None, ""}
        prof["equipes"] = []
        for team in teams_data:
            if team.get('data_desativacao'):
                continue
            matches = [m for m in (team.get("profissionais") or [])
                       if m["cns"] in ids and not m["data_desligamento"]]
            for member in matches:
                prof["equipes"].append({"ine": team["ine"], "nome": team["nome"],
                                          "vinculo": member})
        prof["verificacao_equipes_completa"] = all(t.get("profissionais") is not None for t in teams_data)
    return profs

