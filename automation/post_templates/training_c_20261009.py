from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
out=Path(__file__).parent
W=1080; carbon='#0B1016';surface='#101A23';white='#F2F5F7';steel='#7FA8BC';green='#6F9B84'
def font(n,b=False):return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if b else '')+'.ttf',n)
rows=[('Жим штанги лёжа — объём','80 кг × 6 × 4','4 / 4 / 4 / 3','4 подхода'),('Присед со штангой','110 кг × 8 × 3','4 / 4 / 4','3 подхода'),('Тяга гантелей с опорой грудью на наклонной скамье','35 кг × 12 × 3','4 / 3 / 2','3 подхода'),('Разведения гантелей лёжа / на небольшом наклоне','16 кг × 15; 15 кг × 15','3 / 2','2 подхода'),('Разведения гантелей в наклоне — задняя дельта','10 кг × 15 × 2','3 / 3','2 подхода')]
im=Image.new('RGB',(W,2200),carbon);d=ImageDraw.Draw(im)
def wrap(s,f,w):
 lines=[];line=''
 for word in s.split():
  trial=(line+' '+word).strip()
  if d.textlength(trial,font=f)>w and line:lines.append(line);line=word
  else:line=trial
 lines.append(line);return lines
d.rounded_rectangle((24,24,1056,2168),radius=34,fill=surface,outline='#29404E',width=2)
d.text((60,55),'R/FORM · TRAINING LOG',font=font(27,True),fill=steel)
d.text((60,110),'ТРЕНИРОВКА C',font=font(59,True),fill=white)
d.text((60,190),'09.10.2026 · 65 минут · 14/14 подходов',font=font(30),fill=steel)
y=265
for i,(name,fact,rir,count) in enumerate(rows,1):
 title=wrap(str(i)+'. '+name,font(37,True),880);h=96+len(title)*48+105
 d.rounded_rectangle((55,y,1025,y+h),radius=28,outline=green,width=3)
 ty=y+28
 for line in title:d.text((82,ty),line,font=font(37,True),fill=white);ty+=48
 ty+=20;d.text((82,ty),'ФАКТ  '+fact,font=font(35,True),fill=white);ty+=52
 d.text((82,ty),'RIR  '+rir,font=font(30,True),fill=steel)
 y+=h+24
d.text((60,y+8),'Вес гантелей указан для одной гантели.',font=font(27),fill=steel)
d.text((60,y+51),'R/Form by Rulev Denis',font=font(25),fill=steel)
H=y+115
im=im.crop((0,0,W,H));ImageDraw.Draw(im).rounded_rectangle((24,24,1056,H-18),radius=34,outline='#29404E',width=2)
im.save(out/'training-C-20261009.png')
caption='''09.10 · Тренировка C

65 минут, все 14 рабочих подходов выполнены.

Тоннаж жима: 1 920 кг.
Общий тоннаж тренировки: 8 610 кг.

Тоннаж — сумма веса снарядов × повторений во всех записанных подходах; в упражнениях с гантелями учтены обе гантели. Разминка и масса тела в расчёт не входят.

Полный список упражнений, фактические веса и запас повторов — на карточке. В жиме 80 кг × 6 × 4, запас в последнем подходе — 3 повтора. Этот результат фиксирую; следующий шаг нагрузки остаётся отдельным решением.

#RForm_Training'''
(out/'caption.txt').write_text(caption)
print(im.size,len(caption))
