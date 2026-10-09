import json,base64
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
chars=''.join(chr(i) for i in range(32,127))+''.join(chr(i) for i in range(1040,1104))+'Ёё·×—–№…'
fonts={}
for key,size,bold in [('small',27,False),('detail',30,True),('title',37,True),('heading',54,True)]:
 f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',size)
 glyphs={}
 for ch in chars:
  x0,y0,x1,y1=f.getbbox(ch);w=x1-x0;h=y1-y0
  im=Image.new('L',(max(w,1),max(h,1)));ImageDraw.Draw(im).text((-x0,-y0),ch,font=f,fill=255)
  vals=[round(p/17) for p in im.getdata()] if w*h else []
  runs=[]
  for val in vals:
   if runs and runs[-1]==val and runs[-2]<255:runs[-2]+=1
   else:runs.extend([1,val])
  glyphs[ch]=[round(f.getlength(ch)),x0,y0,w,h,base64.b64encode(bytes(runs)).decode()]
 fonts[key]=glyphs
out=Path(__file__).with_name('font-data.generated.gs')
out.write_text('// DejaVu Sans raster glyphs; font license in automation/post_templates/fonts/LICENSE-DejaVu.txt.\nconst RFORM_CARD_FONT = '+json.dumps(fonts,ensure_ascii=False,separators=(',',':'))+';\n')
print(out.stat().st_size)
