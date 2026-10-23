"""Contrato de cadastro estruturado, sem substituir dados ausentes por inferências."""
import re
import unicodedata


def clean(value):
    return value if value and value.strip() not in {"--", "-"} else None


def label(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value)
                   if unicodedata.category(c) != 'Mn').strip().rstrip(':').casefold()


def basic_fields(module):
    if not module:
        return {}
    result = {}
    rows = module.get('linhas', [])
    for index, row in enumerate(rows[:-1]):
        if row and any(cell.endswith(':') for cell in row):
            values = rows[index + 1]
            # Só associa colunas de cabeçalho à linha de valores seguinte.
            if any(cell.endswith(':') for cell in values):
                continue
            for col, key in enumerate(row):
                if key.endswith(':') and col < len(values):
                    result[label(key)] = clean(values[col])
    return result


def hours(value):
    match = re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(?:Hs\.?)?\s*', value or '', re.I)
    if not match:
        return None
    return float(match[1].replace(',', '.'))


def build_cadastro(estab, profs, basic, teams_available):
    fields = basic_fields(basic)
    cnpj = clean(estab.get('cnpj')) or fields.get('cnpj')
    rt = fields.get('responsavel tecnico')
    manager = fields.get('gerente / administrador')
    missing = []
    if not cnpj:
        missing.append({'campo': 'identificacao.cnpj', 'motivo': 'CNPJ próprio não informado na fonte consultada'})
    if not rt:
        missing.append({'campo': 'identificacao.responsavel_tecnico',
                        'motivo': 'Responsável técnico não identificado explicitamente na fonte consultada'})
    employees = None
    if profs is not None:
        employees = []
        for prof in profs:
            cbo = re.fullmatch(r'(\d{6})\s*-\s*(.+)', prof.get('cbo', ''))
            verified = teams_available and prof.get('verificacao_equipes_completa', False)
            employees.append({
                'nome': prof['nome'], 'cns': clean(prof.get('cns')),
                'cns_principal': clean(prof.get('cns_principal')),
                'vinculo': {'vinculacao': clean(prof.get('vinculacao')),
                            'tipo': clean(prof.get('tipo_vinculo')),
                            'subtipo': clean(prof.get('subtipo_vinculo')),
                            'situacao': clean(prof.get('situacao'))},
                'cbo': cbo[1] if cbo else None,
                'cargo_descricao': cbo[2] if cbo else None,
                'cbo_original': prof.get('cbo'),
                'carga_horaria_semanal': {'unidade': 'horas',
                                        'total': hours(prof.get('ch_total')),
                                        'ambulatorial': hours(prof.get('ch_ambulatorial')),
                                        'hospitalar': hours(prof.get('ch_hospitalar')),
                                        'outros': hours(prof.get('ch_outros'))},
                'atende_sus': {'SIM': True, 'NAO': False, 'NÃO': False}.get(prof.get('sus', '').upper()),
                'equipes_vinculadas': [
                    {'ine': team['ine'], 'nome': team['nome'], 'vinculo': team['vinculo']}
                    for team in prof.get('equipes', [])] if teams_available else None,
                'verificacao_equipes_completa': verified,
            })
    return {
        'identificacao': {
            'cnes': estab['cnes'], 'nome_estabelecimento': estab['nome'],
            'telefone': clean(estab.get('telefone')) or fields.get('telefone'),
            'responsavel_tecnico': rt, 'gerente_administrador': manager,
            'cnpj': cnpj, 'cnpj_mantenedora': fields.get('cnpj mantenedora'),
            'endereco': {'logradouro': clean(estab.get('logradouro')),
                         'numero': clean(estab.get('numero')),
                         'complemento': clean((estab.get('localidade') or [None])[0]),
                         'bairro': clean(estab.get('bairro')), 'cep': clean(estab.get('cep')),
                         'municipio': clean(estab.get('municipio')), 'uf': clean(estab.get('uf'))},
        },
        'funcionarios': employees,
        'campos_nao_informados': missing,
        'observacoes': [
            'Cada funcionário representa um registro de vínculo/ocupação; a mesma pessoa pode aparecer mais de uma vez.',
            'Cargo/descrição corresponde à ocupação do CBO publicada pelo CNES.',
            'Equipes são associadas à pessoa por CNS. O CBO na equipe permanece no respectivo vínculo e pode diferir do CBO no estabelecimento.',
        ],
    }

