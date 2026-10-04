(function() {
  'use strict';
  var endpoint='https://script.google.com/macros/s/AKfycbxa5lYHDL1qhP7MOad4TzuJ5ff7HI_7_PMKwB2d5gxNVWFJTJuktcyqL6FswLvMS9c0/exec';
  var currentId=typeof CLINICA_ID!=='undefined'?CLINICA_ID:location.hostname.split('.')[0];
  var schedule=[], units=[], busy=false;
  var heading=document.querySelector('.hero h2'),originalHeading=heading?heading.textContent:'';
  var initialSubmit=document.getElementById('btn-sub');if(initialSubmit)initialSubmit.disabled=true;
  var notice=document.createElement('p');
  notice.setAttribute('role','status'); notice.style.cssText='font-size:13px;margin-top:8px';
  var hero=document.getElementById('disp-info-dinamico');
  if(hero) hero.parentElement.appendChild(notice);
  function first(id) { return schedule.filter(function(slot) { return slot.unitId===id; })[0]; }
  function daySlots(slot) { return schedule.filter(function(s) { return s.unitId===slot.unitId && s.date===slot.date; }); }
  function label(slot) {
    var list=daySlots(slot), periods=list.map(function(s){return s.period;});
    if(periods.indexOf('manha')!==-1 && periods.indexOf('tarde')!==-1) return {period:'ambos',text:'Manhã e tarde',time:slot.unitId==='caruaru'?'8h às 18h':'8h às 17h'};
    if(slot.period==='horario') return {period:'horario',text:'Horário específico',time:slot.time};
    return slot.period==='manha'?{period:'manha',text:'Manhã',time:'8h às 12h'}:{period:'tarde',text:'Tarde',time:'13h às 17h'};
  }
  function text(id,value) { var el=document.getElementById(id); if(el)el.textContent=value; }
  function dateText(slot) { return new Date(slot.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}); }
  function render() {
    var slot=first(currentId), unit=units.filter(function(u){return u.id===currentId;})[0];
    if(!slot || !unit) {
      if(heading)heading.textContent='Consulte a disponibilidade';
      text('disp-info-dinamico','Sem data disponível no período'); text('disp-sub-dinamico','Consulte a equipe pelo WhatsApp');
      text('ubox-bot-dinamico','Consulte a equipe para disponibilidade'); text('prox-data-txt','A confirmar'); text('prox-turno-txt','');
      var submit=document.getElementById('btn-sub'); if(submit)submit.disabled=true;
      return;
    }
    var info=label(slot), formatted=dateText(slot);
    if(heading)heading.textContent=slot.source==='base'?originalHeading:'Atendimento em '+formatted;
    PROX_DATA=slot.date; TURNO=info.period; HORARIO=info.time;
    if(typeof TURNO_NOME!=='undefined') TURNO_NOME.horario='Horário específico';
    text('disp-info-dinamico',formatted); text('disp-sub-dinamico',info.text+' · '+info.time);
    text('ubox-bot-dinamico','📅 '+formatted+' · '+info.text+' · '+info.time);
    text('prox-data-txt',formatted); text('prox-turno-txt',info.text+' · '+info.time);
    notice.textContent='Disponibilidade consultada na agenda. Confirmação pela equipe.';
    var submit=document.getElementById('btn-sub'); if(submit)submit.disabled=false;
    var message='Olá, gostaria de confirmar atendimento em '+unit.city+' em '+slot.date.split('-').reverse().join('/')+', '+info.text.toLowerCase()+' ('+info.time+').';
    document.querySelectorAll('a[href*="api.whatsapp.com/send"], a[href*="wa.me/"]').forEach(function(link) {
      var url=new URL(link.href); url.searchParams.set('text',message); link.href=url.toString();
    });
  }
  function alternativeCard(prefix) {
    var card=document.createElement('div');card.className='sugestao-alt';
    card.innerHTML='<span class="alt-label"></span><div class="alt-info"><strong id="'+prefix+'-cidade"></strong><span id="'+prefix+'-dist" style="font-size:12px;color:rgba(255,255,255,.7)"></span><br>— <span id="'+prefix+'-nome"></span><span class="alt-data" id="'+prefix+'-data"></span></div><a class="btn-alt" id="'+prefix+'-link" hidden>Ver disponibilidade</a>';
    return card;
  }
  var nearbyCard=document.querySelector('.sugestao-alt');
  if(!nearbyCard){
    nearbyCard=alternativeCard('seg');
    var availability=document.querySelector('.disp');
    if(availability)availability.after(nearbyCard);
  }
  nearbyCard.setAttribute('aria-live','polite');
  function clearAlternatives(message) {
    text('seg-cidade','Outra unidade');text('seg-nome','');text('seg-dist','');text('seg-data',message);
    document.getElementById('seg-link').hidden=true;
  }
  clearAlternatives('Consultando a agenda…');
  var latestPosition=null;
  function alternative() {
    var nearby=AgendaRegional.nearestAlternative(schedule,units,currentId,latestPosition);
    if(!nearby){clearAlternatives('Consulte a equipe para outras unidades');return;}
    var local=units.filter(function(u){return u.id===currentId;})[0];
    function fill(card,prefix,candidate,title) {
      var info=label(candidate.slot);
      card.querySelector('.alt-label').textContent=title;
      text(prefix+'-nome',candidate.unit.clinic);text(prefix+'-cidade',candidate.unit.city);
      text(prefix+'-data',dateText(candidate.slot)+' · '+info.text+' · '+info.time);
      text(prefix+'-dist',Math.round(candidate.distance)+' km '+(latestPosition?'de você':'de '+(local?local.city:'referência')));
      var link=document.getElementById(prefix+'-link');link.hidden=false;link.href='https://'+candidate.unit.id+'.pneumologia-pe.com.br/';
    }
    fill(nearbyCard,'seg',nearby,'OPÇÃO PRÓXIMA');
  }
  // A cidade da página é a referência até a localização ser disponibilizada.
  if(navigator.geolocation)navigator.geolocation.getCurrentPosition(function(position){
    latestPosition={lat:position.coords.latitude,lng:position.coords.longitude};
    if(units.length)alternative();
  },function(){},{timeout:8000,maximumAge:300000});
  async function refresh() {
    if(busy) return; busy=true;
    var controller=new AbortController(), timeout=setTimeout(function(){controller.abort();},15000);
    try {
      var response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({acao:'agenda_regional_publica'}),cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Agenda indisponível');
      var data=await response.json();
      if(!data.ok || data.schemaVersion!==1)throw Error('Agenda indisponível');
      units=data.units; schedule=AgendaRegional.resolve(data,90); render();
      alternative();
    } catch(error) {
      clearAlternatives('Confirme outras unidades com a equipe pelo WhatsApp.');
      notice.textContent='Não foi possível atualizar a agenda. Confirme a disponibilidade pelo WhatsApp.';
      var submit=document.getElementById('btn-sub');if(submit)submit.disabled=true;
    } finally {clearTimeout(timeout);busy=false;}
  }
  refresh();setInterval(function(){if(!document.hidden)refresh();},60000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
})();
