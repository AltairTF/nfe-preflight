import zipfile,re,sys,xml.etree.ElementTree as ET
N='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def sheets(path):
    z=zipfile.ZipFile(path)
    ss=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(N+'si'):
            ss.append(''.join(t.text or '' for t in si.iter(N+'t')))
    wb=ET.fromstring(z.read('xl/workbook.xml'))
    names=[s.get('name') for s in wb.iter(N+'sheet')]
    for i,n in enumerate(names,1):
        rows=[]
        for r in ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml')).iter(N+'row'):
            row={}
            for c in r.iter(N+'c'):
                col=re.match(r'[A-Z]+',c.get('r')).group()
                v=c.find(N+'v')
                if v is None:
                    t=c.find(N+'is'); val=''.join(x.text or '' for x in t.iter(N+'t')) if t is not None else ''
                else: val=ss[int(v.text)] if c.get('t')=='s' else v.text
                row[col]=val
            rows.append(row)
        yield n,rows
import json,sys

# One-off: docs/*.xlsx -> src/tables.json (run from the repo root: python3 -I scripts/build-tables.py)
sh = {n.split()[0]: rows for n, rows in sheets("docs/IT 2025.002 v.1.70 - cClassTrib.xlsx")}
cred = dict(sheets("docs/IT 2025.002 v.1.70 - cCredPres.xlsx"))["cCredPres"]
mono = dict(sheets("docs/Tabela de Combustíveis Sujeitos à Tributação Monofásica-20251202 (vigência a partir de 01-01-2026).xlsx"))["Dados atuais"]
bios = dict(sheets("docs/IT 2025.004 v.1.20 - Tabela de Índice.xlsx"))
import datetime
iso = lambda v: (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(v)))).isoformat() if v else None
b = lambda r, c: r.get(c) == "1"
out = {
    "cst": {r["A"]: {"gIBSCBS": b(r, "C"), "gIBSCBSMono": b(r, "D"), "gRed": b(r, "E"), "gDif": b(r, "F"), "gTransfCred": b(r, "G"), "gCredPresIBSZFM": b(r, "H")}
            for r in sh["CST"][1:] if r.get("A")},
    "cClassTrib": {r["C"]: {"cst": r["A"], "gTribRegular": b(r, "M"), "gCredPresOper": b(r, "N"), "indNFe": b(r, "Z"), "indNFCe": b(r, "AA")}
                   for r in sh["cClass"][1:] if r.get("C")},
    "cCredPres": {r["A"]: {"deduz": b(r, "F"), "gCBS": b(r, "G"), "gIBS": b(r, "H")} for r in cred[1:] if r.get("A")},
}
# Historico leaves cProdANP blank on continuation rows (same product as the row above); the current sheet is merged in and deduped.
pbio = []
for name in ("pBioObrigatorio_Historico", "pBioObrigatorio"):
    cur = None
    for r in bios[name][1:]:
        cur = r.get("A") or cur
        row = {"cProdANP": cur, "pBio": round(float(r["C"]) * 100, 4), "ini": iso(r.get("D")), "fim": iso(r.get("E"))} if cur and r.get("C") else None
        if row and row not in pbio: pbio.append(row)
out["pBioObrigatorio"] = pbio
out["cProdANPMonofasico"] = [r["A"] for r in mono[1:] if r.get("A")]
json.dump(out, open("src/tables.json", "w"), indent=1)
print({k: len(v) for k, v in out.items()})
