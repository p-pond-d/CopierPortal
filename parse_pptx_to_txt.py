import zipfile
import xml.etree.ElementTree as ET
import os

pptx_path = r"D:\PythonScript\20260602-BOI-IRIS-PITCHING-SUBJECT7-TEMPLATE.pptx"
output_path = r"D:\PythonScript\pptx_text.txt"

def get_slide_text(pptx_file, out_file):
    if not os.path.exists(pptx_file):
        print(f"Error: File {pptx_file} not found")
        return
        
    archive = zipfile.ZipFile(pptx_file)
    slide_files = [f for f in archive.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
    
    def get_slide_num(filename):
        base = os.path.basename(filename)
        num_str = ''.join([c for c in base if c.isdigit()])
        return int(num_str) if num_str else 0
        
    slide_files = sorted(slide_files, key=get_slide_num)
    
    namespaces = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'
    }

    with open(out_file, 'w', encoding='utf-8') as out:
        for slide_file in slide_files:
            slide_num = get_slide_num(slide_file)
            out.write(f"\n=== SLIDE {slide_num} ===\n")
            xml_content = archive.read(slide_file)
            root = ET.fromstring(xml_content)
            
            for paragraph in root.findall('.//a:p', namespaces):
                para_texts = []
                for t_elem in paragraph.findall('.//a:t', namespaces):
                    if t_elem.text:
                        para_texts.append(t_elem.text)
                if para_texts:
                    clean_text = "".join(para_texts).strip()
                    if clean_text:
                        out.write(clean_text + "\n")

    print(f"Success: PPTX content written to {out_file}")

if __name__ == '__main__':
    get_slide_text(pptx_path, output_path)
