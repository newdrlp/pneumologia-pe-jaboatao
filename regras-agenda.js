(function(root) {
  'use strict';
  function periods(value) {
    var labels = {'Manhã':'manha','Tarde':'tarde','Dia todo':'dia_todo','Manhã e tarde':'dia_todo','ambos':'dia_todo'};
    value = labels[value] || value;
    return value === 'dia_todo' ? ['manha','tarde'] : [value];
  }
  function timePeriod(time) { return time < '12:00' ? 'manha' : 'tarde'; }
  function matches(slot, exception) {
    if (slot.unitId!==exception.unitId || slot.date!==exception.date) return false;
    var scopes = periods(exception.period);
    if (scopes[0]==='horario') return slot.period==='horario' && slot.time===exception.time;
    return scopes.indexOf(slot.period==='horario'?timePeriod(slot.time):slot.period)!==-1;
  }
  function resolve(data, days) {
    var availability = [], units = data.units || [], active = {};
    var lastDay=new Date(data.today+'T12:00:00Z');lastDay.setUTCDate(lastDay.getUTCDate()+(days||90)-1);
    var end=lastDay.toISOString().slice(0,10);
    units.forEach(function(unit) {
      if (!unit.active) return;
      active[unit.id] = true;
      var today = new Date(data.today+'T12:00:00Z');
      for (var offset=0;offset<(days||90);offset++) {
        var date = new Date(today); date.setUTCDate(date.getUTCDate()+offset);
        var scheduled = unit.frequency===7 ? date.getUTCDay()===unit.weekday :
          unit.base && Math.round((date-new Date(unit.base+'T12:00:00Z'))/86400000)%unit.frequency===0;
        if (scheduled) unit.periods.forEach(function(period) { availability.push({unitId:unit.id,date:date.toISOString().slice(0,10),period:period,time:null,source:'base'}); });
      }
    });
    (data.explicit || []).forEach(function(entry) {
      if (!active[entry.unitId] || entry.date<data.today || entry.date>end) return;
      availability = availability.filter(function(slot) { return slot.unitId!==entry.unitId || slot.date!==entry.date; });
      if (entry.status==='aberta') periods(entry.period).forEach(function(period) { availability.push({unitId:entry.unitId,date:entry.date,period:period,time:null,source:'explicit'}); });
    });
    // Ordem persistida: uma suspensão posterior remove um extra anterior;
    // um extra posterior reabre o escopo previamente suspenso.
    (data.exceptions || []).forEach(function(entry) {
      if (!active[entry.unitId] || entry.date<data.today || entry.date>end) return;
      if (entry.type==='suspend') availability = availability.filter(function(slot) { return !matches(slot,entry); });
      if (entry.type==='extra') periods(entry.period).forEach(function(period) {
        var item={unitId:entry.unitId,date:entry.date,period:period,time:entry.time||null,source:'extra'};
        if (!availability.some(function(slot) { return slot.unitId===item.unitId && slot.date===item.date && slot.period===item.period && slot.time===item.time; })) availability.push(item);
      });
    });
    return availability.sort(function(a,b) { return a.date.localeCompare(b.date) || (a.time||({manha:'08:00',tarde:'13:00'}[a.period])).localeCompare(b.time||({manha:'08:00',tarde:'13:00'}[b.period])); });
  }
  function dateLabel(date) { return date.split('-').reverse().join('/'); }
  function periodLabel(period,time) { return {manha:'pela manhã',tarde:'à tarde',dia_todo:'durante o dia',horario:'às '+time}[period]; }
  function preview(input, units) {
    function line(side,suspended) {
      var unit=units.filter(function(u) { return u.id===side.unitId; })[0];
      if (!unit || !side.date || (side.period==='horario'&&!side.time)) return 'Preencha unidade, data e turno.';
      return suspended ? 'O atendimento em '+unit.city+' em '+dateLabel(side.date)+', '+periodLabel(side.period,side.time)+', está indisponível.' :
        'Há possibilidade de atendimento em '+unit.city+' em '+dateLabel(side.date)+', '+periodLabel(side.period,side.time)+', mediante confirmação pela equipe.';
    }
    var out=[];
    if (input.action!=='extra') out.push(line(input.source,true));
    if (input.action!=='suspend') out.push(line(input.target,false));
    return out.join(' ');
  }
  root.AgendaRegional={resolve:resolve,preview:preview,periods:periods};
})(typeof globalThis!=='undefined'?globalThis:this);
