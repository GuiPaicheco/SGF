"""Verifica PDFs de fixtures fictícias; não autentica nem lê dados de produção."""
import json
import re
from pathlib import Path
import pdfplumber

def compact(value):
    return re.sub(r"\s+", "", value)

for name, expected_pages in [("comprovante-curto", 1), ("comprovante-extenso", 2)]:
    expected = json.loads(Path(f"tmp/pdfs/{name}.json").read_text(encoding="utf-8"))
    with pdfplumber.open(f"output/pdf/{name}.pdf") as pdf:
        assert len(pdf.pages) == expected_pages, (name, len(pdf.pages))
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        for field in expected["required"]:
            assert compact(field) in compact(text), (name, "conteúdo ausente")
        for field in ["COMPROVANTE", "CBO", "Carga horária semanal", "Retorno ao trabalho", "RH ou Chefia Imediata", "Página"]:
            assert field in text, (name, field)
        for page in pdf.pages:
            assert abs(page.width - 595.276) < 1 and abs(page.height - 841.89) < 1
            assert page.chars, (name, "página vazia")
            for char in page.chars:
                assert char["x0"] >= 0 and char["x1"] <= page.width + 1
                assert char["top"] >= 0 and char["bottom"] <= page.height + 1
        print(f"{name}: {len(pdf.pages)} página(s) A4; conteúdo e limites conferidos")
