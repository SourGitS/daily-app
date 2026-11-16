// The same menu is anchored to the phone header or the current desktop toolbar.
function sharedAddButtonHtml(){
  return '<button type="button" class="shared-add-trigger shared-add-desktop" data-shared-add aria-haspopup="dialog" aria-controls="shared-add-dialog"><span class="shared-add-plus" aria-hidden="true"></span>Add</button>';
}

function sharedAddJournal(kind){
  const today=getLocalDate();
  const fromCalendar=S.view==='notes'&&jrnPlannerActive();
  if(S.view!=='notes') setView('notes');
  const selected=fromCalendar&&jrnPlannerDate(jrnPlannerState.date)?jrnPlannerState.date:today;
  // A task can be planned ahead. Writing from a future day starts today's entry.
  const day=kind==='entry'&&selected>today?today:selected;
  const existing=kind==='entry'?jrnEntries().find(record=>jrnEntryDay(record)===day):null;
  if(jrnPlannerActive()){
    if(day!==jrnPlannerState.date) jrnPlannerPick(day,false);
    jrnPlannerOpen(existing?.id||null,kind);
  }else{
    jrnOpenEditor(existing?.id||null,kind);
  }
  // The ordinary editor focuses new drafts itself. A resumed entry also needs focus
  // when its launcher was on another page or replaced by the writing toolbar.
  if(existing) document.getElementById('jrn-ed-body')?.focus({preventScroll:true});
}

function sharedAddSelect(kind){
  if(S.view==='notes') jrnEdFlush();
  switch(kind){
    case 'expense': openTxnModal({date:getLocalDate()}); break;
    case 'food':
      // Open the editor first so Food's first-visit introduction waits for an ordinary visit.
      nutOpenFoodSheet('snacks');
      nutOpen('snacks');
      document.querySelector('#nutrition-food-overlay .back-btn')?.focus();
      break;
    case 'weight': openLogWeight(); break;
    case 'note':
    case 'entry': sharedAddJournal(kind); break;
  }
}

{
  const dialog=document.getElementById('shared-add-dialog');
  const choices=document.getElementById('shared-add-choices');
  const options=[
    ['expense','wallet','Expense','Record a purchase'],
    ['food','pot','Food','Log a meal or snack'],
    ['weight','scale','Weight','Record a weigh-in'],
    ['note','check','Task or note','Remember something'],
    ['entry','note','Journal entry','Make a little room to reflect']
  ];
  let opener=null;

  function currentTrigger(){
    if(opener?.isConnected&&opener.getClientRects().length) return opener;
    return [...document.querySelectorAll('[data-shared-add]')].find(button=>button.getClientRects().length);
  }

  function positionMenu(){
    if(!dialog.open) return;
    const anchor=currentTrigger()?.getBoundingClientRect();
    if(!anchor) {dialog.close();return;}
    const gap=8, width=dialog.offsetWidth, height=dialog.offsetHeight;
    const left=anchor.right-width+(opener?.classList.contains('shared-add-phone')?56:0);
    const below=anchor.bottom+gap, above=anchor.top-height-gap;
    const top=below+height<=window.innerHeight-gap?below:Math.max(gap,above);
    dialog.style.left=Math.max(gap,Math.min(left,window.innerWidth-width-gap))+'px';
    dialog.style.top=Math.min(top,window.innerHeight-height-gap)+'px';
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-shared-add]');
    if(!button||dialog.open) return;
    opener=button;
    if(!choices.childElementCount){
      choices.innerHTML=options.map(([kind,icon,label,description])=>
        '<button type="button" data-add-kind="'+kind+'">'+cardIcon(icon)+'<span><strong>'+label+'</strong><small>'+description+'</small></span><i aria-hidden="true">›</i></button>'
      ).join('');
    }
    button.setAttribute('aria-expanded','true');
    dialog.showModal();
    positionMenu();
    // A tap opens on the heading. Keyboard activation goes straight to the first action.
    if(event.detail===0) choices.firstElementChild.focus({preventScroll:true});
  });

  dialog.addEventListener('click',event=>{
    const choice=event.target.closest('[data-add-kind]');
    if(choice){
      dialog.close();
      opener?.removeAttribute('aria-expanded');
      opener=null;
      sharedAddSelect(choice.dataset.addKind);
    }else if(event.target.closest('[data-add-close]')){
      dialog.close();
    }else if(event.target===dialog){
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>=rect.right||event.clientY<rect.top||event.clientY>=rect.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close',()=>{
    if(dialog.open||!opener) return;
    opener.removeAttribute('aria-expanded');
    currentTrigger()?.focus({preventScroll:true});
    opener=null;
  });
  window.addEventListener('resize',positionMenu);
}
