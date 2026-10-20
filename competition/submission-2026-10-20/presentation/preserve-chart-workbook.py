"""Preserve the presentation benchmark chart and its original workbook after import.

This does not create a new chart or materialize replacement workbook snapshots.
"""
import argparse, hashlib, json, posixpath
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.etree import ElementTree as ET
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--candidate',required=True);parser.add_argument('--output',required=True);parser.add_argument('--report',required=True);a=parser.parse_args()
require=lambda v,c:None if v else (_ for _ in ()).throw(RuntimeError(c))
require(not Path(a.output).exists(),'REPAIRED_OUTPUT_EXISTS')
ns={'c':'http://schemas.openxmlformats.org/drawingml/2006/chart','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','p':'http://schemas.openxmlformats.org/package/2006/relationships'}
def parts(z,slide):
    xml=ET.fromstring(z.read(slide));rel=posixpath.join(posixpath.dirname(slide),'_rels',posixpath.basename(slide)+'.rels');mapping={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read(rel))}
    return [posixpath.normpath(posixpath.join(posixpath.dirname(slide),mapping[e.attrib['{'+ns['r']+'}id']])).lstrip('/') for e in xml.findall('.//c:chart',ns)]
sha=lambda b:hashlib.sha256(b).hexdigest()
copied=[]
with ZipFile(a.source) as source,ZipFile(a.candidate) as candidate:
    data={n:candidate.read(n) for n in candidate.namelist()};content=ET.fromstring(data['[Content_Types].xml']);original_content=ET.fromstring(source.read('[Content_Types].xml'))
    source_parts,candidate_parts=parts(source,'ppt/slides/slide11.xml'),parts(candidate,'ppt/slides/slide12.xml');require(len(source_parts)==len(candidate_parts)==1,'CHART_COUNT_CHANGED')
    for original,destination in zip(source_parts,candidate_parts):
        data[destination]=source.read(original);copied.append({'source':original,'destination':destination,'SHA256':sha(data[destination])})
        rel=posixpath.join(posixpath.dirname(original),'_rels',posixpath.basename(original)+'.rels');dest_rel=posixpath.join(posixpath.dirname(destination),'_rels',posixpath.basename(destination)+'.rels')
        require(rel in source.namelist(),'SOURCE_CHART_WORKBOOK_RELATIONSHIP_MISSING')
        rel_bytes=source.read(rel);data[dest_rel]=rel_bytes
        for relation in ET.fromstring(rel_bytes):
            require(relation.attrib.get('TargetMode')!='External','UNEXPECTED_EXTERNAL_CHART_RESOURCE')
            target=relation.attrib['Target'];src=posixpath.normpath(posixpath.join(posixpath.dirname(original),target));dst=posixpath.normpath(posixpath.join(posixpath.dirname(destination),target))
            require(src.endswith('.xlsx') and dst.startswith('ppt/embeddings/'),'UNEXPECTED_CHART_RESOURCE')
            data[dst]=source.read(src);copied.append({'source':src,'destination':dst,'SHA256':sha(data[dst]),'originalWorkbookBytesPreserved':True})
            node=next((n for n in original_content if n.attrib.get('Extension')=='xlsx' or n.attrib.get('PartName')=='/'+src),None);require(node is not None,'WORKBOOK_CONTENT_TYPE_MISSING')
            if not any(n.attrib==node.attrib for n in content):content.append(node)
    ET.register_namespace('', 'http://schemas.openxmlformats.org/package/2006/content-types')
    data['[Content_Types].xml']=ET.tostring(content,encoding='utf-8',xml_declaration=True)
    with ZipFile(a.output,'w',ZIP_DEFLATED) as out:
        for name,value in data.items():out.writestr(name,value)
Path(a.report).write_text(json.dumps({'schemaVersion':1,'method':'copy original chart parts and exact embedded workbook bytes; preserve imported slide/chart geometry','sourceSHA256':sha(Path(a.source).read_bytes()),'candidateSHA256':sha(Path(a.candidate).read_bytes()),'outputSHA256':sha(Path(a.output).read_bytes()),'copiedParts':copied,'newWorkbookSnapshotCreated':False},indent=2)+'\n')
