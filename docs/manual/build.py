#!/usr/bin/env python3
"""Build the illustrated manual from public text and original raster screenshots.

Cropping and numbered annotations are PDF vectors. PNG originals are unchanged.
No network, wallet, private configuration or application service is accessed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import zipfile
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

ROOT = Path(__file__).resolve().parent
W, H = landscape(A4)
INK = colors.HexColor('#172231')
MUTED = colors.HexColor('#59677a')
BLUE = colors.HexColor('#2069d7')
PALE = colors.HexColor('#eef4ff')
LINE = colors.HexColor('#dbe3ee')
AMBER = colors.HexColor('#99612b')
CONTENT_BOTTOM = 45


def load(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8'))


def font_setup():
    candidates = [os.environ.get('MANDATE_MANUAL_FONT'),
                  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
                  '/usr/share/fonts/truetype/arphic/uming.ttc']
    selected = next((Path(x) for x in candidates if x and Path(x).is_file()), None)
    if not selected:
        raise SystemExit('Set MANDATE_MANUAL_FONT to a Chinese-capable TrueType font.')
    pdfmetrics.registerFont(TTFont('Manual', str(selected)))
    pdfmetrics.registerFontFamily('Manual', normal='Manual', bold='Manual', italic='Manual', boldItalic='Manual')
    return str(selected)


def style(size=10.6, leading=None, color=INK, **kwargs):
    return ParagraphStyle('manual', fontName='Manual', fontSize=size,
                          leading=leading or size * 1.48, textColor=color,
                          wordWrap='CJK', alignment=TA_LEFT, **kwargs)


class Manual:
    def __init__(self, output, content, steps):
        self.c = canvas.Canvas(str(output), pagesize=(W,H), pageCompression=1)
        self.c.setTitle(content['title'])
        self.c.setAuthor('Mandate Labs')
        self.c.setSubject('以 Agent MCP 采购 ETH 数据为主线的中文案例教程，逐步说明目的、操作与结果')
        self.content, self.steps = content, steps
        self.page = 0
        self.page_map = {}
        self.layout = []
        self.image_cache = {}

    def paragraph(self, text, x, top, width, *, size=10.6, color=INK, gap=7, minimum=CONTENT_BOTTOM):
        p = Paragraph(escape(text).replace('\n','<br/>'), style(size, color=color))
        _, height = p.wrap(width, H)
        if top-height < minimum:
            raise ValueError(f'Page {self.page}: text overflows ({top-height:.1f}): {text[:85]}')
        p.drawOn(self.c,x,top-height)
        self.layout.append({'page':self.page,'type':'text','bottom':round(top-height,2),'text':text[:70]})
        return top-height-gap

    def heading(self, text, x, top, width, size=13):
        return self.paragraph(text,x,top,width,size=size,color=BLUE,gap=7)

    def base(self, section, title, key=None):
        self.page += 1
        c=self.c
        c.setFillColor(colors.white);c.rect(0,0,W,H,fill=1,stroke=0)
        c.setFillColor(INK);c.setFont('Helvetica-Bold',10);c.drawString(32,H-25,'mandate')
        c.setFont('Manual',8.5);c.setFillColor(MUTED);c.drawRightString(W-32,H-25,'操作手册  /  测试网版本  /  '+self.content['date'])
        c.setStrokeColor(LINE);c.line(32,H-34,W-32,H-34)
        c.setFillColor(BLUE);c.setFont('Manual',9);c.drawString(32,H-53,section)
        p=Paragraph(escape(title),style(22,26))
        _,hh=p.wrap(W-64,70)
        if hh>30: raise ValueError('Title must fit one line: '+title)
        p.drawOn(c,32,H-87)
        c.setStrokeColor(LINE);c.line(32,34,W-32,34)
        c.setFont('Manual',8);c.setFillColor(MUTED)
        c.drawString(32,20,'Mandate Wallet  ·  v'+self.content['version']+'  ·  测试网操作手册')
        c.drawRightString(W-32,20,str(self.page))
        if key:
            c.bookmarkPage(key);c.addOutlineEntry(title,key,level=0,closed=False)
            self.page_map[key]=self.page

    def finish_page(self): self.c.showPage()

    def table(self, rows, x, top, width):
        n=len(rows[0])
        # Preserve room for the explanatory column while wrapping long identifiers.
        ratios=([.36,.64] if n==2 else [.26,.24,.50] if n==3 else [1/n]*n)
        widths=[width*v for v in ratios]
        data=[[Paragraph(escape(str(v)),style(9.1,13.5,color=colors.white if i==0 else INK))
               for v in row] for i,row in enumerate(rows)]
        t=Table(data,colWidths=widths,hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),INK),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f4f7fb'),colors.white]),
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
            ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
            ('LINEBELOW',(0,0),(-1,-1),.4,LINE)
        ]))
        _,hh=t.wrap(width,H)
        if top-hh<CONTENT_BOTTOM: raise ValueError(f'Page {self.page}: table overflow {top-hh}')
        t.drawOn(self.c,x,top-hh)
        self.layout.append({'page':self.page,'type':'table','bottom':round(top-hh,2)})
        return top-hh-12

    def code(self, text, x, top, width):
        # Wrap at visible whitespace; no shell execution is part of document generation.
        lines=[]
        for line in text.splitlines():
            while pdfmetrics.stringWidth(line,'Courier',8.5)>width-20:
                limit=len(line)
                while pdfmetrics.stringWidth(line[:limit],'Courier',8.5)>width-20:limit-=1
                split=line.rfind(' ',0,limit)
                if split<8:split=limit
                lines.append(line[:split]);line='  '+line[split:].lstrip()
            lines.append(line)
        hh=len(lines)*12+18
        if top-hh<CONTENT_BOTTOM:raise ValueError(f'Page {self.page}: code overflow')
        self.c.setFillColor(colors.HexColor('#f0f3f8'));self.c.roundRect(x,top-hh,width,hh,5,fill=1,stroke=0)
        self.c.setFillColor(INK);self.c.setFont('Courier',8.5)
        for i,line in enumerate(lines):self.c.drawString(x+10,top-15-i*12,line)
        return top-hh-12

    def blocks(self, blocks, x, top, width):
        for block in blocks:
            if 'heading' in block:top=self.heading(block['heading'],x,top,width)
            elif 'p' in block:top=self.paragraph(block['p'],x,top,width)
            elif 'list' in block:
                for item in block['list']:
                    self.c.setFillColor(BLUE);self.c.circle(x+3,top-6,2,fill=1,stroke=0)
                    top=self.paragraph(item,x+14,top,width-14,gap=7)
                top-=5
            elif 'table' in block:top=self.table(block['table'],x,top,width)
            elif 'code' in block:top=self.code(block['code'],x,top,width)
        return top

    def content_page(self,p,key):
        self.base(p['section'],p['title'],key)
        width=(W-88)/2
        for i,col in enumerate(p['columns']):self.blocks(col,32+i*(width+24),H-112,width)
        self.finish_page()

    def setup_page(self,p,key):
        self.base(p['section'],p['title'],key)
        self.blocks(p['blocks'],32,H-112,316)
        self.paragraph(p['caption'],372,H-112,W-404,size=8.5,color=MUTED,gap=10)
        self.image(p['image'],p['crop'],372,H-145,W-404,H-198,p.get('marks',[]))
        self.finish_page()

    def image(self,name,crop,x,top,width,height,marks=()):
        path=ROOT/'assets'/'screenshots'/name
        if name not in self.image_cache:self.image_cache[name]=ImageReader(str(path))
        reader=self.image_cache[name];iw,ih=reader.getSize()
        cx,cy,cw,ch=crop
        if not (cx>=0 and cy>=0 and cw>0 and ch>0 and cx+cw<=iw and cy+ch<=ih):
            raise ValueError(f'Invalid crop {name}: {crop} in {iw}x{ih}')
        scale=min(width/cw,height/ch);rw,rh=cw*scale,ch*scale
        left=x+(width-rw)/2;bottom=top-rh
        c=self.c;c.saveState()
        clip=c.beginPath();clip.rect(left,bottom,rw,rh);c.clipPath(clip,stroke=0)
        c.drawImage(reader,left-cx*scale,bottom-(ih-cy-ch)*scale,width=iw*scale,height=ih*scale,mask='auto')
        c.restoreState()
        c.setStrokeColor(LINE);c.setLineWidth(.55);c.rect(left,bottom,rw,rh,fill=0,stroke=1)
        for mx,my,mw,mh,num in marks:
            if mx<cx or my<cy or mx+mw>cx+cw or my+mh>cy+ch:continue
            rx=left+(mx-cx)*scale;ry=bottom+(cy+ch-my-mh)*scale
            c.setStrokeColor(colors.HexColor('#67adff'));c.setLineWidth(1.25)
            c.roundRect(rx,ry,mw*scale,mh*scale,3,fill=0,stroke=1)
            bx=max(left+7,rx-4);by=min(top-7,ry+mh*scale+2)
            c.setFillColor(BLUE);c.circle(bx,by,7,fill=1,stroke=0)
            c.setFillColor(colors.white);c.setFont('Helvetica-Bold',8);c.drawCentredString(bx,by-2.7,num)
        self.layout.append({'page':self.page,'type':'image','file':name,'crop':crop,'bottom':round(bottom,2)})
        return bottom

    def step(self,s):
        self.base('完整案例 · 按实际操作顺序阅读','第 '+s['id']+' 步  '+s['title'],s['id'])
        x,width,top=32,316,H-111
        top=self.heading('本步骤的目的',x,top,width,10)
        top=self.paragraph(s['purpose'],x,top,width,size=10.5,gap=11)
        top=self.heading('操作方法',x,top,width,10)
        for item in s['operation']:
            top=self.paragraph(item,x,top,width,size=10.5,gap=9)
        top=self.heading('完成标志',x,top-2,width,10)
        top=self.paragraph(s['result'],x,top,width,size=10.5,gap=8)
        if s.get('note'):
            top=self.paragraph(s['note'],x,top,width,size=8.9,color=MUTED,gap=0)
        rx,rw,rt=372,W-404,H-111
        if s.get('code'):
            self.paragraph('配置与命令示例 · 请替换实际路径',rx,rt,rw,size=8.5,color=MUTED)
            rt=self.code(s['code'],rx,rt-20,rw)
        if s.get('launch'):
            rt=self.paragraph('在可信项目目录运行的启动命令',rx,rt,rw,size=8.5,color=MUTED)
            rt=self.code(s['launch'],rx,rt-20,rw)
        if s.get('prompt'):
            rt=self.heading('可发送给 Agent 的完整指令',rx,rt-5,rw,11)
            rt=self.paragraph(s['prompt'],rx,rt,rw,size=10.5,gap=12)
        if s.get('reference'):
            self.blocks(s['reference'],rx,rt,rw)
        if s.get('image'):
            source=s.get('source')
            label='Claude Desktop 原生截图 · 2026-10-18 · 局部裁切' if source=='claude-gui' else '历史 Rabby 实测 · 2026-10-15 · 旧版界面' if source=='history' else '既有本地实测 · 文案修订前界面' if source=='prior-local' else '既有本地界面 · 2026-10-17 · 文案版本 1.1'
            rt=self.paragraph(label,rx,rt,rw,size=8.0,color=AMBER if source in ['history','prior-local'] else MUTED,gap=8)
            room=rt-CONTENT_BOTTOM
            if s.get('panels'):
                total=sum(v['height']+26 for v in s['panels']);factor=min(1,room/total)
                for panel in s['panels']:
                    rt=self.paragraph(panel['label'],rx,rt,rw,size=8.0,color=MUTED,gap=6)
                    height=panel['height']*factor
                    self.image(s['image'],panel['crop'],rx,rt,rw,height,s.get('marks',[]))
                    rt-=height+10
            elif s.get('zoom'):
                main=min(294,room-115)
                self.image(s['image'],s['crop'],rx,rt,rw,main,s.get('marks',[]))
                rt-=main+12
                rt=self.paragraph('局部放大 · 原始截图对应区域',rx,rt,rw,size=8,color=MUTED,gap=5)
                self.image(s['image'],s['zoom'],rx,rt,rw,min(88,rt-CONTENT_BOTTOM),s.get('marks',[]))
            else:
                self.image(s['image'],s['crop'],rx,rt,rw,min(415,room),s.get('marks',[]))
        elif s['id'] in ['10','11']:
            rt-=18
            self.blocks([{'heading':'本例的执行顺序'},
                {'p':'Agent 先核对上下文和报价，再调用已批准的服务。付款后异常沿用原订单恢复，结果经检查后用于撰写简报。'},
                {'p':'使用者在本阶段无需切回网页重复执行同一采购；管理钱包的权限审批已在前面的步骤完成。'}],rx,rt,rw)
        self.finish_page()

    def cover(self):
        self.page+=1;c=self.c
        c.setFillColor(colors.HexColor('#0b0e13'));c.rect(0,0,W,H,fill=1,stroke=0)
        # Original project brand; no Deye art or third-party visual is used.
        from io import BytesIO
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPDF
        svg=(ROOT/'assets'/'lockup.svg').read_text().replace('currentColor','#ffffff')
        drawing=svg2rlg(BytesIO(svg.encode()))
        drawing.scale(210/drawing.width,210/drawing.width)
        renderPDF.draw(drawing,c,44,H-91)
        c.setStrokeColor(colors.HexColor('#1d2d46'))
        for radius in [80,125,170,215]:c.circle(W-118,235,radius,fill=0,stroke=1)
        c.setFillColor(colors.HexColor('#70afff'));c.roundRect(44,373,5,48,2,fill=1,stroke=0)
        c.setFillColor(colors.white);c.setFont('Manual',33);c.drawString(65,385,'Mandate Wallet 操作手册')
        c.setFont('Manual',17);c.setFillColor(colors.HexColor('#a8b8d1'));c.drawString(65,345,self.content['subtitle'])
        c.setFillColor(colors.HexColor('#3386eb'));c.roundRect(44,223,100,30,15,fill=1,stroke=0)
        c.setFont('Manual',10);c.setFillColor(colors.white);c.drawCentredString(94,233,'中文 · v'+self.content['version'])
        self.paragraph('案例：让自己的 Agent 采购 ETH 统计数据并生成中文简报。',44,194,610,size=13,color=colors.HexColor('#d7e1ef'),minimum=0)
        self.paragraph('自动向导图解  /  20 个手动主步骤与 6 个桌面接入子步骤  /  三种 Agent 接入路线',44,164,710,size=11,color=colors.HexColor('#a8b8d1'),minimum=0)
        c.setStrokeColor(colors.HexColor('#2c3545'));c.line(44,94,W-44,94)
        c.setFont('Manual',10);c.setFillColor(colors.HexColor('#a8b8d1'));c.drawString(44,68,'Mandate Labs  ·  测试网版本  ·  '+self.content['date'])
        c.drawRightString(W-44,68,'不使用主网资金')
        c.bookmarkPage('cover');c.addOutlineEntry('封面','cover',level=0)
        self.finish_page()

    def workflow(self,p):
        self.base(p['section'],p['title'],'workflow')
        c=self.c
        nodes=[('使用者 + Rabby','批准任务总授权\n批准有限会话'),('所选 Agent 软件','通过 MCP 查询报价\n请求采购与恢复'),('Gateway + 智能账户','核对范围与预算\n登记付款、保留订单'),('商户 + 使用者','商户交付统计数据\nAgent 撰写简报')]
        boxw=(W-100)/4
        for i,(title,body) in enumerate(nodes):
            bx=32+i*(boxw+12)
            c.setFillColor(INK if i==0 else PALE);c.roundRect(bx,316,boxw,128,9,fill=1,stroke=0)
            self.paragraph(title,bx+14,428,boxw-28,size=12,color=colors.white if i==0 else BLUE,minimum=0)
            self.paragraph(body,bx+14,391,boxw-28,size=11,color=colors.HexColor('#dce6f7') if i==0 else INK,minimum=0)
            if i<3:
                c.setStrokeColor(BLUE);c.setLineWidth(1.2);yy=301
                c.line(bx+boxw-30,yy,bx+boxw+24,yy);c.line(bx+boxw+24,yy,bx+boxw+18,yy+4);c.line(bx+boxw+24,yy,bx+boxw+18,yy-4)
        width=(W-88)/2
        left=[{'heading':'使用者在浏览器中完成什么'},
              {'p':'使用者通过工作区连接自己的 Gateway，在 Rabby 中审核并签署任务授权和会话授权。第 01 至 07 步还会将 Agent 配置与刚批准的任务绑定。'},
              {'p':'这部分批准明确了允许的服务、收款人、预算和期限。管理钱包私钥由使用者保管，不交给 Agent 或 Gateway。'}]
        right=[{'heading':'Agent 接入后完成什么'},
               {'p':'命令行接入见第 08、09 步，Claude Desktop 图形接入见第 09.1 至 09.6 步。接入并核对后，Agent 查询报价、支付 0.01 USDC、恢复原订单并生成 ETH 简报。'},
               {'p':'第 16 至 20 步回到工作区核对付款和证据，再由账户所有者撤销会话。BTC 保持未购买，以便检查后续权限已终止。'}]
        self.blocks(left,32,266,width);self.blocks(right,56+width,266,width)
        self.finish_page()

    def contents(self,p):
        self.base(p['section'],p['title'],'contents')
        # Cover + front matter; every case step has one page.
        start=2+len(self.content['front'])
        split=(len(self.steps)+1)//2
        for ci,group in enumerate((self.steps[:split],self.steps[split:])):
            xx=32+ci*(W/2);yy=H-118
            for index,s in enumerate(group):
                pg=start+(index if ci==0 else split+index)
                self.c.setFont('Helvetica-Bold',10);self.c.setFillColor(BLUE);self.c.drawString(xx,yy,s['id'])
                self.c.setFont('Manual',10.4);self.c.setFillColor(INK);self.c.drawString(xx+32,yy,s['title'])
                self.c.setFont('Helvetica',9);self.c.setFillColor(MUTED);self.c.drawRightString(xx+W/2-53,yy,str(pg))
                self.c.linkRect('',s['id'],(xx,yy-5,xx+W/2-48,yy+14),relative=0,thickness=0)
                self.c.setStrokeColor(LINE);self.c.line(xx,yy-9,xx+W/2-48,yy-9)
                yy-=25
        self.paragraph('三种接入路线任选其一。命令行配置后继续第 10 步；桌面分支在第 09.6 步完成只读核对后，继续第 11 步。',32,84,W-64,size=10.4,color=MUTED)
        self.finish_page()

    def save(self): self.c.save()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'../../output/pdf/mandate-wallet-manual.zh-CN.pdf')
    parser.add_argument('--source-zip',type=Path)
    parser.add_argument('--qa-json',type=Path)
    args=parser.parse_args()
    font=font_setup();content=load('manual.zh-CN.json');steps=load('steps.zh-CN.json')['steps']
    manifest=load('capture-manifest.json')
    for item in manifest['images']:
        path=ROOT/item['path']
        actual=hashlib.sha256(path.read_bytes()).hexdigest()
        if actual!=item['sha256']:raise ValueError('Screenshot hash mismatch: '+str(path))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    m=Manual(args.output,content,steps);m.cover()
    for i,p in enumerate(content['front']):
        if p.get('kind')=='workflow':m.workflow(p)
        elif p.get('kind')=='contents':m.contents(p)
        elif p.get('kind')=='setup':m.setup_page(p,'front-'+str(i))
        else:m.content_page(p,'front-'+str(i))
    for s in steps:m.step(s)
    for i,p in enumerate(content['appendix']):m.content_page(p,'appendix-'+str(i))
    m.save()
    qa={'pageCount':m.page,'stepCount':len(steps),'uniqueScreenshots':len(set(s['image'] for s in steps+content['front'] if s.get('image'))),
        'minimumTextBottom':min(x['bottom'] for x in m.layout if x['type']=='text'),
        'font':font,'pages':m.page_map,'layout':m.layout,
        'pdfSHA256':hashlib.sha256(args.output.read_bytes()).hexdigest()}
    if args.qa_json:
        args.qa_json.parent.mkdir(parents=True,exist_ok=True)
        args.qa_json.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if args.source_zip:
        args.source_zip.parent.mkdir(parents=True,exist_ok=True)
        paths=[ROOT/x for x in ['build.py','launch-host.mjs','test-launch-host.mjs','requirements.txt','README.zh-CN.md','LICENSE','manual.zh-CN.json','steps.zh-CN.json','capture-manifest.json','validation.json','assets/lockup.svg']]
        paths += [ROOT/item['path'] for item in manifest['images']]
        with zipfile.ZipFile(args.source_zip,'w',zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(set(paths)):archive.write(path,'mandate-wallet-manual-source/'+str(path.relative_to(ROOT)))
    print(json.dumps({k:v for k,v in qa.items() if k not in ['layout','pages']},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
