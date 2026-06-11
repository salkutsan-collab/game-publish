/* ============================================================
   «Путь двойника» - движок (вертикальный срез).
   Состояние + автосохранение (localStorage) + рендер сцен по данным STORY.
   Типы сцен: dialog / choice / talks / matrix / result / end.
   ============================================================ */
var G = (function(){

var SAVE_KEY = "pd_save_v1";
var WEEKS_TOTAL = 52;
var S = null;          // состояние игры
var prevRes = null;    // прошлые значения ресурсов (для стрелок-дельт)

/* ---------- состояние ---------- */
function freshState(name){
  return {
    v:1, name:name, scene:STORY.start,
    res:{ weeks:0, budget:300, cores:0, trust:50, adeq:0 },
    flags:{}, arts:[], gloss:[], defers:[],
    tech: TECH0.map(function(t){ return { id:t.id, st:t.st }; }),
    log:[], started: Date.now(),
    ui:{}   // незавершенный прогресс внутри сцены (диалоговая строка, визиты talks)
  };
}
function save(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }catch(e){} }
function load(){
  try{ var raw = localStorage.getItem(SAVE_KEY); if(!raw) return null;
    var s = JSON.parse(raw); return (s && s.v===1 && STORY.scenes[s.scene]) ? s : null;
  }catch(e){ return null; }
}
function logEv(type, data){
  var e = { t:Date.now(), scene:S.scene, type:type };
  for(var k in data) e[k]=data[k];
  S.log.push(e);
}

/* ---------- эффекты ---------- */
function applyFx(fx){
  if(!fx) return;
  if(fx.budget) S.res.budget = Math.max(0, S.res.budget + fx.budget);
  if(fx.weeks)  S.res.weeks  = Math.min(WEEKS_TOTAL, S.res.weeks + fx.weeks);
  if(fx.cores)  S.res.cores += fx.cores;
  if(fx.trust)  S.res.trust = Math.max(0, Math.min(100, S.res.trust + fx.trust));
  if(fx.adeq)   S.res.adeq  = Math.max(0, Math.min(100, S.res.adeq + fx.adeq));
  if(fx.gloss)  fx.gloss.forEach(function(g){ if(S.gloss.indexOf(g)<0) S.gloss.push(g); });
  if(fx.art && S.arts.indexOf(fx.art)<0) S.arts.push(fx.art);
  if(fx.flag)   for(var k in fx.flag) S.flags[k]=fx.flag[k];
  if(fx.defer){ S.defers.push(fx.defer); logEv("defer",{text:fx.defer}); }
}

/* ---------- утилиты ---------- */
function el(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function sub(t){ return t.replace(/\{name\}/g, esc(S.name)); }
function say(who, text){
  var c = CHARS[who];
  return "<div class='say "+(c.cls||"")+"'><div class='ava'>"+c.ava+"</div><div class='b'>"+
    "<div class='who'>"+esc(who==="player"?S.name:c.name)+" · "+esc(c.role)+"</div>"+sub(text)+"</div></div>";
}
function qualFx(q){ return q==="good" ? {trust:2} : (q==="weak" ? {trust:0} : {trust:-3}); }

/* ---------- верхняя панель ---------- */
function renderTop(sc){
  el("actlabel").innerHTML = esc(sc.act||"") + "<br>Изделие: авиадвигатель (ГТД)";
  var r = S.res, p = prevRes || r;
  function d(key, inverted){
    var diff = r[key]-p[key]; if(!diff) return "";
    var up = inverted ? diff<0 : diff>0;
    return " <span class='delta "+(up?"up":"down")+"'>"+(diff>0?"+":"")+diff+"</span>";
  }
  el("resbar").innerHTML =
    "<div class='chip'><small>Недели</small><b>"+(WEEKS_TOTAL-r.weeks)+" <span style='color:var(--dim);font-weight:400'>/ "+WEEKS_TOTAL+"</span>"+d("weeks",true)+"</b></div>"+
    "<div class='chip'><small>Бюджет</small><b>"+r.budget+" <span style='color:var(--dim);font-weight:400'>млн</span>"+d("budget")+"</b></div>"+
    "<div class='chip'><small>Ядро-часы</small><b>"+r.cores+"</b></div>"+
    "<div class='chip'><small>Доверие</small><b>"+r.trust+d("trust")+"</b></div>"+
    "<div class='chip adeq'><small>Адекватность</small><b>"+r.adeq+"%"+d("adeq")+"</b><div class='bar'><i style='width:"+r.adeq+"%'></i></div></div>";
  prevRes = { weeks:r.weeks, budget:r.budget, cores:r.cores, trust:r.trust, adeq:r.adeq };
}

/* ---------- правая панель ---------- */
function renderSide(){
  var labels = { have:"есть", no:"нет", rent:"аренда" };
  el("p-tech").innerHTML = "<h3>Карта технологий</h3>" + S.tech.map(function(t){
    var t0 = null; TECH0.forEach(function(x){ if(x.id===t.id) t0=x; });
    return "<div class='tech'>"+esc(t0.t)+" <span class='tag "+t.st+"'>"+labels[t.st]+"</span></div>";
  }).join("") + "<div class='counter'>Чего не хватает - видно заранее. Понять, что и когда понадобится, - часть работы.</div>";

  el("p-art").innerHTML = "<h3>Артефакты двойника</h3>" + ARTS.map(function(a){
    var got = S.arts.indexOf(a.id)>=0;
    return "<div class='art"+(got?"":" locked")+"'><span class='ic'>"+a.ic+"</span><div>"+esc(a.t)+
      "<small>"+(got?"в папке проекта":"впереди")+"</small></div></div>";
  }).join("");

  var wk = "";
  for(var i=1;i<=WEEKS_TOTAL;i++)
    wk += "<div class='wk"+(i<=S.res.weeks?" done":"")+((i===38||i===52)?" mile":"")+"' title='Неделя "+i+"'></div>";
  el("p-cal").innerHTML = "<h3>Календарь · 52 недели</h3><div class='weeks'>"+wk+"</div>"+
    "<div class='legend'><i style='background:var(--acc)'></i>потрачено: "+S.res.weeks+" нед.<br>"+
    "<i style='background:var(--acc2)'></i>вехи: натурные испытания (~38), сдача (52)<br>"+
    "<i style='background:var(--panel2);border:1px solid var(--line)'></i>впереди</div>"+
    "<div class='counter'>Каждое решение стоит недель. Переделки дороже, чем сделать вовремя.</div>";

  var keys = Object.keys(GLOSS);
  el("p-gloss").innerHTML = "<h3>Справочник курса</h3>" + (S.gloss.length
    ? S.gloss.map(function(k){ var g=GLOSS[k]; return "<div class='gl-item'><div class='t'>"+esc(g.t)+"</div><div class='d'>"+esc(g.d)+"</div></div>"; }).join("")
    : "<div class='counter'>Пока пусто. Термины открываются по ходу сюжета.</div>")
    + "<div class='counter'>Открыто терминов: <b>"+S.gloss.length+"</b> из "+keys.length+" (в срезе)</div>";
}

/* ---------- сцена: каркас ---------- */
function shell(sc, inner, foot){
  el("scene").innerHTML =
    "<div class='scene-art'><div class='ph'>фон локации - арт (внешнее приложение)</div>"+
    "<div class='loc'>Локация<b>"+esc(sc.loc||"")+"</b></div></div>" + inner +
    "<div class='scene-foot'>"+(foot||"")+"</div>";
}
function hintBtnHtml(){ return "<button class='hintbtn' onclick='G.hint()'>💡 Спросить наставника</button>"; }
function nextBtnHtml(label, ready){
  return "<button class='nextbtn"+(ready?" ready":"")+"' id='nextbtn' onclick='G.next()'>"+esc(label||"Продолжить")+" →</button>";
}

/* ---------- dialog: реплики по одной ---------- */
function renderDialog(sc){
  var shown = S.ui.line || 0;
  var html = "<div class='dialog' id='dlg'>";
  for(var i=0;i<=Math.min(shown, sc.lines.length-1);i++) html += say(sc.lines[i].who, sc.lines[i].t);
  html += "</div>";
  var last = shown >= sc.lines.length-1;
  shell(sc, html, nextBtnHtml(last ? "Продолжить" : "Дальше", true));
}
function advDialog(sc){
  if((S.ui.line||0) < sc.lines.length-1){ S.ui.line=(S.ui.line||0)+1; save(); renderDialog(sc); }
  else goNext(sc);
}

/* ---------- choice: выбор (+ обоснование) ---------- */
function renderChoice(sc){
  var html = "";
  if(sc.pre){ html += "<div class='dialog'>"; sc.pre.forEach(function(l){ html += say(l.who, l.t); }); html += "</div>"; }
  html += "<div class='task'>"+sub(sc.task)+"</div>";
  if(sc.need) html += "<div class='need'>"+sc.need+"</div>";
  html += "<div class='step-title'>"+(sc.noJust?"Решение":"Шаг 1 из 2 · <span>Выбор решения</span>")+"</div>";
  html += "<div class='choices'>" + sc.options.map(function(o,i){
    return "<div class='card' id='opt"+i+"' onclick='G.pick("+i+")'><h4>"+esc(o.t)+"</h4>"+esc(o.desc)+
      (o.cost?"<div class='cost'><i class='minus'>"+esc(o.cost)+"</i></div>":"")+"</div>";
  }).join("") + "</div>";
  html += "<div class='justify' id='justify'></div>";
  html += "<div class='verdict' id='verdict'></div>";
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(sc.hint||"Здесь подсказки нет - решение за тобой. Но я рядом.")+"</div>";
  shell(sc, html, hintBtnHtml() + nextBtnHtml("Продолжить", false));
}
var pickState = null; // {opt, just, q}
function pick(i){
  var sc = STORY.scenes[S.scene], o = sc.options[i];
  pickState = { opt:i, just:null, q:null };
  document.querySelectorAll(".card").forEach(function(c){ c.classList.remove("sel"); });
  el("opt"+i).classList.add("sel");
  var v = el("verdict"); v.className="verdict"; v.innerHTML="";
  el("nextbtn").classList.remove("ready");
  if(sc.noJust){
    pickState.q = o.fb.q;
    v.className = "verdict show "+o.fb.q;
    v.innerHTML = sub(o.fb.t);
    el("nextbtn").classList.add("ready");
  } else {
    var j = el("justify");
    j.className = "justify open";
    j.innerHTML = "<div class='step-title' style='padding-left:0'>Шаг 2 из 2 · <span>Обоснование - почему так?</span></div>"+
      o.just.map(function(jo,k){
        return "<div class='jopt' id='jopt"+k+"' onclick='G.just("+k+")'><span class='dot'></span>"+esc(jo.t)+"</div>";
      }).join("");
  }
}
function just(k){
  var sc = STORY.scenes[S.scene], o = sc.options[pickState.opt], jo = o.just[k];
  pickState.just = k; pickState.q = jo.q;
  document.querySelectorAll(".jopt").forEach(function(x){ x.classList.remove("good","weak","bad"); });
  el("jopt"+k).classList.add(jo.q);
  var v = el("verdict");
  v.className = "verdict show "+jo.q;
  v.innerHTML = sub(jo.fb);
  el("nextbtn").classList.add("ready");
}
function confirmChoice(sc){
  var o = sc.options[pickState.opt];
  applyFx(o.fx);
  applyFx(qualFx(pickState.q));
  if(o.fx && o.fx.defer){} // defer уже записан в applyFx
  logEv("choice", { opt:o.t, just:(pickState.just!=null ? o.just[pickState.just].t : null), q:pickState.q, hint:!!S.ui.hintUsed });
  pickState = null;
  goNext(sc);
}

/* ---------- talks: разведка мнений ---------- */
function renderTalks(sc){
  var visited = S.ui.visited || [];
  var html = "<div class='task'>"+sub(sc.task)+"</div><div class='advisors'>" +
    sc.persons.map(function(p,i){
      var c = CHARS[p.who], v = visited.indexOf(i)>=0;
      return "<div class='adv"+(v?" visited":"")+"' onclick='G.talk("+i+")'><span class='a'>"+c.ava+"</span>"+esc(c.name)+(v?" <span class='ok'>✓</span>":"")+"</div>";
    }).join("") + "</div>";
  html += "<div class='dialog' id='talkbox'></div>";
  var ready = visited.length >= sc.min;
  var status = "<span style='font-size:12px;color:var(--dim)'>Выслушано: "+visited.length+" из "+sc.persons.length+" (нужно минимум "+sc.min+")</span>";
  shell(sc, html, status + nextBtnHtml("К решению", ready));
}
function talk(i){
  var sc = STORY.scenes[S.scene], p = sc.persons[i];
  S.ui.visited = S.ui.visited || [];
  if(S.ui.visited.indexOf(i)<0){
    S.ui.visited.push(i);
    if(p.gloss) applyFx({gloss:p.gloss});
    logEv("talk", { who:p.who });
    save();
  }
  renderTalks(sc); renderSide();
  el("talkbox").innerHTML = p.lines.map(function(t){ return say(p.who, t); }).join("") +
    (p.gloss ? "<div class='adv-say show'><span class='gl'>📖 В справочник добавлено: "+p.gloss.map(function(g){return GLOSS[g].t;}).join(" · ")+"</span></div>" : "");
}

/* ---------- matrix: балансировка ---------- */
function mxVals(){ return (S.ui.mx || [50,50,50,50]); }
function renderMatrix(sc){
  var s = mxVals();
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='matrix'><div class='mcol'><h5>Конструктивные решения</h5>" +
    MATRIX.sliders.map(function(sl,i){
      var real = sl.min + (sl.max-sl.min)*s[i]/100;
      return "<div class='sl'><label>"+esc(sl.t)+" <b id='slv"+i+"'>"+real.toFixed(sl.fmt)+(sl.unit?" "+sl.unit:"")+"</b></label>"+
        "<input type='range' min='0' max='100' value='"+s[i]+"' oninput='G.slide("+i+",this.value)'>"+
        "<div style='font-size:10.5px;color:var(--faint);margin-top:3px'>"+esc(sl.hint)+"</div></div>";
    }).join("") + "</div><div class='mcol'><h5>Целевые показатели · допуск</h5><div id='inds'></div></div></div>";
  html += "<div class='mxstatus' id='mxstatus'></div>";
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(MATRIX.hint)+"</div>";
  html += "<div class='verdict' id='verdict'></div>";
  shell(sc, html, hintBtnHtml() + nextBtnHtml("Утвердить матрицу", true));
  drawInds();
}
function drawInds(){
  var s = mxVals(), green = 0;
  el("inds").innerHTML = MATRIX.inds.map(function(ind){
    var v = ind.f(s), ok = (ind.dir===">=" ? v>=ind.lim : v<=ind.lim);
    if(ok) green++;
    var pct = Math.max(3, Math.min(100, 100*(v-ind.lo)/(ind.hi-ind.lo)));
    var val = (ind.id==="SFC") ? v.toFixed(1) : (ind.id==="N" ? v.toFixed(1) : Math.round(v));
    return "<div class='ind "+(ok?"green":"red")+"'><div class='row'><span>"+esc(ind.t)+"</span>"+
      "<span class='val'>"+val+" "+ind.unit+"</span></div>"+
      "<div class='lim'>допуск: "+ind.dir+" "+ind.lim+" "+ind.unit+"</div>"+
      "<div class='ib'><i style='width:"+pct+"%'></i></div></div>";
  }).join("");
  el("mxstatus").innerHTML = "В допуске: <b>"+green+" из "+MATRIX.inds.length+"</b>" +
    (green===MATRIX.inds.length ? " - матрица сбалансирована, можно утверждать" : " - есть красные ячейки");
  return green;
}
function slide(i, val){
  S.ui.mx = mxVals(); S.ui.mx[i] = +val;
  S.ui.moves = (S.ui.moves||0)+1;
  var sl = MATRIX.sliders[i];
  var real = sl.min + (sl.max-sl.min)*S.ui.mx[i]/100;
  el("slv"+i).textContent = real.toFixed(sl.fmt)+(sl.unit?" "+sl.unit:"");
  drawInds(); save();
}
function confirmMatrix(sc){
  var s = mxVals(), green = 0;
  MATRIX.inds.forEach(function(ind){ var v=ind.f(s); if(ind.dir===">=" ? v>=ind.lim : v<=ind.lim) green++; });
  var all = green===MATRIX.inds.length;
  if(!all && !S.ui.warned){
    S.ui.warned = true; save();
    var v = el("verdict");
    v.className = "verdict show weak";
    v.innerHTML = "<b>Гарин:</b> в матрице "+(MATRIX.inds.length-green)+" красных ячеек. Можно утвердить и так - но каждая красная ячейка вернется на испытаниях, и тогда исправление будет стоить не недели, а месяцы. Решай: вернуться к балансировке или утвердить как есть (нажми «Утвердить» еще раз).";
    return;
  }
  applyFx(sc.cost ? {weeks:sc.cost.weeks, budget:sc.cost.budget} : null);
  if(all){ applyFx({adeq:6, trust:4}); }
  else { applyFx({trust:-5, defer:"Акт 6: "+(MATRIX.inds.length-green)+" красных ячеек матрицы всплывут на виртуальных испытаниях"}); }
  logEv("matrix", { green:green, total:MATRIX.inds.length, moves:S.ui.moves||0, hint:!!S.ui.hintUsed, sliders:mxVals() });
  goNext(sc);
}

/* ---------- result: итог акта ---------- */
function renderResult(sc){
  var a = null; ARTS.forEach(function(x){ if(x.id===sc.award.art) a=x; });
  var html = "<div class='award'><div class='ic'>"+a.ic+"</div><div><div class='t'>"+esc(a.t)+"</div>"+
    "<div class='d'>"+esc(sc.award.d)+"</div></div></div>";
  html += "<div class='dialog'>" + sc.lines.map(function(l){ return say(l.who,l.t); }).join("") + "</div>";
  shell(sc, html, nextBtnHtml("Дальше", true));
}

/* ---------- end: конец среза ---------- */
function renderEnd(sc){
  var r = S.res;
  var qs = { good:0, weak:0, bad:0 };
  S.log.forEach(function(e){ if(e.type==="choice" && qs[e.q]!=null) qs[e.q]++; });
  var html = "<div class='task'><b>"+esc(sc.title)+".</b> Спасибо! Дальше игра продолжится актами 3-10 и финалом - они в разработке.</div>";
  html += "<div class='sumrow'>"+
    "<div class='sumcell'>Потрачено недель<b>"+r.weeks+" из "+WEEKS_TOTAL+"</b></div>"+
    "<div class='sumcell'>Остаток бюджета<b>"+r.budget+" млн</b></div>"+
    "<div class='sumcell'>Доверие заказчика<b>"+r.trust+"</b></div>"+
    "<div class='sumcell'>Адекватность двойника<b>"+r.adeq+"%</b></div></div>";
  html += "<div class='sumlist'><b style='color:var(--txt)'>Решения:</b> отличных обоснований - <span class='g'>"+qs.good+"</span>, "+
    "спорных - <span class='w'>"+qs.weak+"</span>, слабых - <span class='b'>"+qs.bad+"</span>.";
  if(S.defers.length){
    html += "<br><b style='color:var(--txt)'>Отложенные последствия (вернутся в следующих актах):</b><ul>"+
      S.defers.map(function(d){ return "<li class='w'>"+esc(d)+"</li>"; }).join("")+"</ul>";
  } else {
    html += "<br><span class='g'>Отложенных последствий не накоплено - чистое прохождение.</span>";
  }
  html += "</div>";
  html += "<div class='sumlist'><b style='color:var(--txt)'>Что дальше по сюжету:</b><ul>"+
    sc.coming.map(function(c){ return "<li>"+esc(c)+"</li>"; }).join("")+"</ul></div>";
  shell(sc, html, "<button class='btn ghost' onclick='G.restartConfirm()'>Пройти заново</button>");
}

/* ---------- роутер ---------- */
function render(){
  var sc = STORY.scenes[S.scene];
  renderTop(sc); renderSide();
  if(sc.type==="dialog") renderDialog(sc);
  else if(sc.type==="choice") renderChoice(sc);
  else if(sc.type==="talks") renderTalks(sc);
  else if(sc.type==="matrix") renderMatrix(sc);
  else if(sc.type==="result") renderResult(sc);
  else if(sc.type==="end") renderEnd(sc);
  window.scrollTo(0,0);
}
function goNext(sc){
  S.ui = {};
  S.scene = sc.next;
  var nsc = STORY.scenes[S.scene];
  if(nsc.onenter){ applyFx(nsc.onenter); }
  if(nsc.type==="result" && nsc.award){ applyFx({art:nsc.award.art}); }
  logEv("enter",{});
  save(); render();
}

/* ---------- публичный интерфейс ---------- */
return {
  init: function(){
    var saved = load();
    if(saved){
      S = saved;
      el("login-new").classList.add("hidden");
      el("login-cont").classList.remove("hidden");
      el("contbtn").textContent = "Продолжить · "+S.name;
    }
    el("login").classList.remove("hidden");
  },
  start: function(){
    var name = el("pname").value.trim() || "Инженер";
    S = freshState(name);
    logEv("start",{name:name});
    save();
    el("login").classList.add("hidden");
    el("game").classList.remove("hidden");
    render();
  },
  cont: function(){
    el("login").classList.add("hidden");
    el("game").classList.remove("hidden");
    prevRes = null;
    render();
  },
  restartConfirm: function(){
    if(confirm("Начать проект заново? Текущий прогресс будет удален.")){
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  },
  next: function(){
    var sc = STORY.scenes[S.scene];
    if(sc.type==="dialog") advDialog(sc);
    else if(sc.type==="choice"){ if(pickState && pickState.q) confirmChoice(sc); }
    else if(sc.type==="talks"){ if((S.ui.visited||[]).length>=sc.min){ logEv("talksDone",{n:S.ui.visited.length}); goNext(sc); } }
    else if(sc.type==="matrix") confirmMatrix(sc);
    else if(sc.type==="result") goNext(sc);
  },
  hint: function(){
    var h = el("hintbox");
    if(h){ h.classList.toggle("show"); if(h.classList.contains("show")){ S.ui.hintUsed=true; logEv("hint",{}); save(); } }
  },
  tab: function(elTab){
    document.querySelectorAll(".tab").forEach(function(t){ t.classList.remove("on"); });
    document.querySelectorAll(".pane").forEach(function(p){ p.classList.remove("on"); });
    elTab.classList.add("on");
    el(elTab.getAttribute("data-pane")).classList.add("on");
  },
  pick: pick, just: just, talk: talk, slide: slide,
  _state: function(){ return S; }  // для отладки
};
})();

G.init();
