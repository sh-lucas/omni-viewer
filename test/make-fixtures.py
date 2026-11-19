# Gera os documentos de teste em test/fixtures. Cada um tem um marcador de texto
# que o teste e2e procura na página renderizada.
import sys
from pathlib import Path
from docx import Document
from pptx import Presentation
from pptx.util import Inches
from openpyxl import Workbook

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)

d = Document()
d.add_heading('Relatório OMNI_DOCX_MARKER', 0)
d.add_paragraph('Parágrafo com acentuação: ação, coração.')
t = d.add_table(rows=2, cols=2)
t.cell(0, 0).text = 'celula_docx'
d.add_page_break()
d.add_paragraph('Segunda página OMNI_DOCX_PAGE2')
d.save(out / 'sample.docx')

p = Presentation()
s = p.slides.add_slide(p.slide_layouts[0])
s.shapes.title.text = 'Slide um OMNI_PPTX_MARKER'
s.placeholders[1].text = 'Subtítulo'
s = p.slides.add_slide(p.slide_layouts[5])
s.shapes.title.text = 'Slide dois OMNI_PPTX_SLIDE2'
s.shapes.add_textbox(Inches(1), Inches(2), Inches(4), Inches(1)).text_frame.text = 'caixa de texto'
p.save(out / 'sample.pptx')

wb = Workbook()
ws = wb.active
ws.title = 'Primeira'
ws['A1'] = 'OMNI_XLSX_MARKER'
ws['B1'] = 42
ws['A2'] = '<img src=x onerror="document.title=\'XSS\'">'
wb.create_sheet('Segunda')['A1'] = 'OMNI_XLSX_SHEET2'
wb.save(out / 'sample.xlsx')
print('ok')
