# R/Form Channel Control v0.3.1 hotfix

This hotfix addresses two issues observed after the first v0.3 deployment:

1. the dashboard still displays `v0.2.0` because `RFORM_CC.version` in `Code.gs` was not incremented;
2. the `Следующая публикация` block can fail with `Cannot read properties of null (reading 'item')` because the v0.3 client makes a second server call for the next item even though the active queue is already present in `DATA.queue`.

## A. Version label

In `Code.gs`, replace:

```javascript
// R/Form Channel Control v0.2
```

with:

```javascript
// R/Form Channel Control v0.3.1
```

and replace:

```javascript
version: '0.2.0',
```

with:

```javascript
version: '0.3.1',
```

## B. Replace `renderNext()` in `ChannelControlUX_v0_3.html`

Replace the entire existing `async function renderNext(){...}` with:

```javascript
async function renderNext(){
  ensureNext();
  const root=document.getElementById('cc3Next');
  try{
    const rank={SCHEDULED:0,APPROVED:1,REVIEW:2,PLANNED:3};
    const rows=(Array.isArray(DATA&&DATA.queue)?DATA.queue:[])
      .filter(x=>x&&['SCHEDULED','APPROVED','REVIEW','PLANNED'].includes(x.Lifecycle_State))
      .slice();

    function sortDate(v){
      const s=String(v||'').trim();
      if(!s)return Number.MAX_SAFE_INTEGER;
      let m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
      if(m)return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0)).getTime();
      const d=new Date(s);
      return isNaN(d)?Number.MAX_SAFE_INTEGER:d.getTime();
    }

    rows.sort((a,b)=>{
      const ra=rank[a.Lifecycle_State]??9, rb=rank[b.Lifecycle_State]??9;
      if(ra!==rb)return ra-rb;
      return sortDate(a.Publish_At||a.Date)-sortDate(b.Publish_At||b.Date);
    });

    if(!rows.length){
      root.innerHTML='<div class="cc3-next-label">Следующая публикация</div><div class="sub" style="margin-top:6px">Активных материалов нет.</div>';
      return;
    }

    const x=rows[0];
    let r={state:'NOT_REVIEWED'};
    try{
      const rr=await api('rformCcGetReviewStatusV03',{contentId:x.Content_ID});
      if(rr&&rr.state)r=rr;
    }catch(reviewErr){
      r={state:'UNKNOWN',error:reviewErr.message||String(reviewErr)};
    }

    const title=x.Reader_Value||x.Audience_Problem||x.Content_ID;
    const visualOk=String(x.Telegram_Post_Mode||'TEXT_ONLY').toUpperCase()==='TEXT_ONLY'||String(x.Visual_Status||'').toUpperCase()==='APPROVED';
    const block=x.Blocking_Issue||(!['VERIFIED','LOCKED'].includes(r.state)?'Нужно проверить финальную версию в Preview.':'');

    root.innerHTML=`<div class="cc3-next-grid"><div><div class="cc3-next-label">Следующая публикация</div><div class="cc3-next-title">${e(truncate(title,180))}</div><div class="cc3-next-meta"><span>${e(x.Content_ID)}</span>${stateBadge(x.Lifecycle_State)}<span>${e(x.Publish_At||x.Date||'дата не назначена')}</span><span class="cc3-review-state ${e(r.state)}">${e(r.state)}</span></div><div class="cc3-next-ready"><div><small>Text</small><b>${e(x.Text_Status||'—')}</b></div><div><small>Visual</small><b>${e(visualOk?(x.Visual_Status||'NOT_REQUIRED'):(x.Visual_Status||'NOT_READY'))}</b></div><div><small>Approval</small><b>${e(x.Approval_Status||'—')}</b></div><div><small>Preview</small><b>${e(r.state||'—')}</b></div></div>${block?`<div class="cc3-next-blocker">Блокер: ${e(truncate(block,220))}</div>`:''}</div><div class="cc3-next-actions"><button class="btn preview" onclick="rformCcOpenPreview('${e(x.Content_ID)}',false)">Предпросмотр</button><button class="btn" onclick="openEdit('${e(x.Content_ID)}')">Редактировать</button>${['DRAFT','REVIEW','PLANNED'].includes(x.Lifecycle_State)?`<button class="btn primary" onclick="approve('${e(x.Content_ID)}')">Approve</button>`:''}${x.Lifecycle_State==='APPROVED'?`<button class="btn primary" onclick="openSchedule('${e(x.Content_ID)}')">Schedule</button>`:''}</div></div>`;
  }catch(err){
    root.innerHTML=`<div class="cc3-next-label">Следующая публикация</div><div class="cc3-next-blocker">Ошибка: ${e(err.message||String(err))}</div>`;
  }
}
```

This version selects the next item from the already loaded dashboard `DATA.queue`, eliminating the redundant server call that returned null in the observed deployment. Only the review status is fetched separately, and failure there is non-fatal.

## C. Deploy

Save the project, then update the existing Web App deployment to a `New version`. Keep the same `/exec` URL. Refresh with `Ctrl+F5`.

Expected result:

- header shows `v0.3.1`;
- `Следующая публикация` shows an actual queue item instead of the null-item error;
- other v0.3 functionality remains unchanged.
