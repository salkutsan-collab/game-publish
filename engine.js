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
  if(fx.tech)   for(var k in fx.tech) S.tech.forEach(function(t){ if(t.id===k) t.st=fx.tech[k]; });
  if(fx.defer){ S.defers.push(fx.defer); logEv("defer",{text:fx.defer}); }
}
/* списать ядро-часы; если своих нет (аутсорс) - платим подрядчику деньгами */
function spendCores(n){
  if(!n) return "";
  if(S.res.cores >= n){ S.res.cores -= n; return ""; }
  var fee = Math.max(2, Math.round(n/10000));
  S.res.budget = Math.max(0, S.res.budget - fee);
  return " Своих ядро-часов нет - счет подрядчика: -"+fee+" млн.";
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
  var art = (typeof ART!=="undefined") ? ART.forLoc(sc.loc) : null;
  el("scene").innerHTML =
    "<div class='scene-art'>"+
    (art ? art : "<div class='ph'>фон локации - арт</div>")+
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

/* ---------- tree: сборка системы моделей (акт 3) ---------- */
function treeCount(){
  var done = S.ui.tdone || [];
  var n = A3TREE.start;
  A3TREE.levels.forEach(function(lv){ lv.nodes.forEach(function(nd){ if(done.indexOf(nd.id)>=0) n += nd.n; }); });
  return n;
}
function renderTree(sc){
  var done = S.ui.tdone || [];
  var total = 0; A3TREE.levels.forEach(function(lv){ total += lv.nodes.length; });
  var html = "<div class='task'>"+sub(sc.task)+"</div><div class='tree'>";
  A3TREE.levels.forEach(function(lv, li){
    html += "<div class='tlevel'><h5>"+esc(lv.t)+"</h5><div class='tnodes'>";
    lv.nodes.forEach(function(nd){
      var on = done.indexOf(nd.id)>=0;
      html += "<div class='tnode"+(on?" on":"")+"' onclick=\"G.treeNode('"+nd.id+"')\">"+
        "<div class='tt'>"+esc(nd.t)+"</div><div class='tn'>"+(on?"+"+nd.n+" моделей":"запустить разработку")+"</div></div>";
    });
    html += "</div></div>";
    if(li < A3TREE.levels.length-1) html += "<div class='tlink'>↓ результаты уровня питают следующий ↓</div>";
  });
  html += "</div>";
  html += "<div class='adv-say show' id='treeinfo' style='"+(S.ui.tinfo?"":"display:none")+"'>"+(S.ui.tinfo||"")+"</div>";
  var cnt = treeCount(), allDone = done.length===total;
  html += "<div class='mxstatus'>Моделей в системе: <b style='font-size:16px;color:var(--acc2)'>"+cnt+"</b> из "+A3TREE.target+
    (allDone ? " - <span style='color:var(--ok)'>система собрана</span>" : "") + "</div>";
  if(allDone) html += "<div class='verdict show good'><b>Гарин:</b> "+esc(A3TREE.done)+"</div>";
  shell(sc, html, nextBtnHtml("Готово", allDone));
}
function treeNode(id){
  var sc = STORY.scenes[S.scene];
  S.ui.tdone = S.ui.tdone || [];
  var node = null;
  A3TREE.levels.forEach(function(lv){ lv.nodes.forEach(function(nd){ if(nd.id===id) node=nd; }); });
  if(S.ui.tdone.indexOf(id)<0){ S.ui.tdone.push(id); logEv("tree",{node:id}); }
  S.ui.tinfo = "<b>"+esc(node.t)+":</b> "+esc(node.info);
  save(); renderTree(sc);
}
function confirmTree(sc){
  var total = 0; A3TREE.levels.forEach(function(lv){ total += lv.nodes.length; });
  if((S.ui.tdone||[]).length!==total) return;
  if(sc.cost) applyFx({weeks:sc.cost.weeks||0, budget:sc.cost.budget||0});
  logEv("treeDone",{models:treeCount()});
  goNext(sc);
}

/* ---------- diag: диагностика расчета (акт 4, верификация) ---------- */
function renderDiag(sc){
  var st = S.ui.dg || (S.ui.dg = {stage:{}, finds:[], concluded:false});
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='need'>"+esc(A4DIAG.intro)+"</div>";
  html += "<div class='choices' style='grid-template-columns:repeat(auto-fit,minmax(230px,1fr))'>";
  A4DIAG.actions.forEach(function(a,i){
    var sIdx = st.stage[a.id]||0;
    var spent = a.trap ? false : sIdx >= a.stages.length;
    var label = a.t;
    var costTxt = "";
    if(!a.trap && !spent){
      var c = a.stages[sIdx].cost;
      var parts = [];
      if(c.weeks) parts.push("-"+c.weeks+" нед");
      if(c.cores) parts.push("-"+(c.cores/1000)+" тыс. ядро-часов");
      costTxt = parts.length ? "<div class='cost'><i class='minus'>"+parts.join(" · ")+"</i></div>" : "<div class='cost'><i class='note'>бесплатно</i></div>";
    }
    html += "<div class='card"+(spent?" sel":"")+"' onclick=\"G.diagAct("+i+")\"><h4>"+esc(label)+"</h4>"+
      (spent?"<div class='cost'><i class='note'>выполнено</i></div>":costTxt)+"</div>";
  });
  html += "</div>";
  if(st.finds.length){
    html += "<div class='findings'>"+st.finds.map(function(f){ return "<div class='find'>"+f+"</div>"; }).join("")+"</div>";
  }
  html += "<div class='verdict' id='verdict'></div>";
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(sc.hint||"")+"</div>";
  /* диагноз доступен после сходимости сетки */
  var meshDone = (st.stage[A4DIAG.needId]||0) >= 2;
  if(meshDone && !st.concluded){
    html += "<div class='step-title'>"+esc(A4DIAG.conclude.q)+"</div><div id='conc'>"+
      A4DIAG.conclude.options.map(function(o,k){
        return "<div class='jopt' id='copt"+k+"' onclick='G.diagConclude("+k+")'><span class='dot'></span>"+esc(o.t)+"</div>";
      }).join("")+"</div><div class='verdict' id='cverdict'></div>";
  }
  shell(sc, html, hintBtnHtml() + nextBtnHtml("Продолжить", !!st.concluded));
}
function diagAct(i){
  var sc = STORY.scenes[S.scene], a = A4DIAG.actions[i];
  var st = S.ui.dg;
  if(a.trap){
    logEv("diag",{act:a.id, trap:true});
    applyFx({trust:-4});
    st.finds.push("<b style='color:var(--bad)'>"+esc(a.t.replace(/^[^\s]+\s/,""))+":</b> "+esc(a.verdict));
    save(); renderDiag(sc); renderTop(sc);
    return;
  }
  var sIdx = st.stage[a.id]||0;
  if(sIdx >= a.stages.length) return;
  var stage = a.stages[sIdx];
  var extra = "";
  if(stage.cost){
    if(stage.cost.weeks) applyFx({weeks:stage.cost.weeks});
    extra = spendCores(stage.cost.cores||0);
  }
  st.stage[a.id] = sIdx+1;
  st.finds.push("<b style='color:var(--acc2)'>Проверка:</b> "+esc(stage.find)+(extra?"<b style='color:var(--warn)'>"+extra+"</b>":""));
  logEv("diag",{act:a.id, stage:sIdx+1});
  save(); renderDiag(sc); renderTop(sc); renderSide();
}
function diagConclude(k){
  var sc = STORY.scenes[S.scene], o = A4DIAG.conclude.options[k];
  var st = S.ui.dg;
  document.querySelectorAll("#conc .jopt").forEach(function(x){ x.classList.remove("good","weak","bad"); });
  var elc = el("copt"+k); if(elc) elc.classList.add(o.q);
  var v = el("cverdict");
  v.className = "verdict show "+o.q;
  v.innerHTML = sub(o.fb);
  logEv("diagConclude",{opt:o.t, q:o.q, hint:!!S.ui.hintUsed});
  if(o.q==="good"){
    st.concluded = true;
    applyFx({trust:2});
    el("nextbtn").classList.add("ready");
  } else {
    applyFx({trust:-2});
  }
  save(); renderTop(sc);
}

/* ---------- valid: сверка расчет-эксперимент (акт 5) ---------- */
function vchartSvg(calibrated){
  /* АЧХ: расчет (оранжевая) vs эксперимент (голубая); рабочая зона слева */
  var W=560, H=210, padL=44, padB=26, zoneW=(W-padL)*A5VALID.workZone;
  function pts(arr){ return arr.map(function(p){ return (padL+p[0]*(W-padL-8)).toFixed(0)+","+(H-padB-p[1]*(H-padB-18)).toFixed(0); }).join(" "); }
  var exp = [[0,.12],[ .12,.55],[.2,.2],[.34,.68],[.42,.25],[.55,.32],[.66,.75],[.78,.3],[.9,.5],[1,.22]];
  var calc0 = [[0,.12],[.12,.57],[.2,.22],[.34,.71],[.42,.27],[.55,.34],[.66,.92],[.78,.42],[.9,.66],[1,.34]];
  var calcC = [[0,.12],[.12,.56],[.2,.21],[.34,.7],[.42,.26],[.55,.33],[.66,.78],[.78,.32],[.9,.53],[1,.24]];
  var calc = calibrated ? calcC : calc0;
  return "<svg viewBox='0 0 "+W+" "+H+"' style='width:100%;background:#0c1626;border:1px solid var(--line);border-radius:10px'>"+
    "<rect x='"+padL+"' y='10' width='"+zoneW.toFixed(0)+"' height='"+(H-padB-10)+"' fill='rgba(90,209,138,.06)'/>"+
    "<line x1='"+(padL+zoneW).toFixed(0)+"' y1='10' x2='"+(padL+zoneW).toFixed(0)+"' y2='"+(H-padB)+"' stroke='var(--line)' stroke-dasharray='4 4'/>"+
    "<text x='"+(padL+8)+"' y='24' font-size='10' fill='var(--ok)'>рабочая зона · расхождение ~"+(calibrated?"3":"4")+"%</text>"+
    "<text x='"+(padL+zoneW+8).toFixed(0)+"' y='24' font-size='10' fill='"+(calibrated?"var(--ok)":"var(--bad)")+"'>выше · "+(calibrated?"~4% после калибровки":"до 18%")+"</text>"+
    "<line x1='"+padL+"' y1='"+(H-padB)+"' x2='"+(W-6)+"' y2='"+(H-padB)+"' stroke='var(--line)'/>"+
    "<line x1='"+padL+"' y1='10' x2='"+padL+"' y2='"+(H-padB)+"' stroke='var(--line)'/>"+
    "<text x='"+(W/2)+"' y='"+(H-8)+"' font-size='10' fill='var(--dim)' text-anchor='middle'>частота</text>"+
    "<text x='14' y='"+(H/2)+"' font-size='10' fill='var(--dim)' transform='rotate(-90 14 "+(H/2)+")' text-anchor='middle'>амплитуда отклика</text>"+
    "<polyline points='"+pts(exp)+"' fill='none' stroke='var(--acc2)' stroke-width='2.2'/>"+
    "<polyline points='"+pts(calc)+"' fill='none' stroke='var(--acc)' stroke-width='2.2' stroke-dasharray='"+(calibrated?"none":"7 4")+"' style='transition:all .6s'/>"+
    "<rect x='"+(W-168)+"' y='14' width='154' height='40' rx='6' fill='#0e1f33'/>"+
    "<line x1='"+(W-158)+"' y1='28' x2='"+(W-130)+"' y2='28' stroke='var(--acc2)' stroke-width='2.5'/><text x='"+(W-124)+"' y='31' font-size='10' fill='var(--txt)'>эксперимент (стенд)</text>"+
    "<line x1='"+(W-158)+"' y1='44' x2='"+(W-130)+"' y2='44' stroke='var(--acc)' stroke-width='2.5'/><text x='"+(W-124)+"' y='47' font-size='10' fill='var(--txt)'>расчет (модель)</text>"+
  "</svg>";
}
function renderValid(sc){
  var st = S.ui.vd || (S.ui.vd = {resolved:false, calibrated:false});
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div style='padding:0 18px'>"+vchartSvg(st.calibrated)+"</div>";
  html += "<div class='need'>"+esc(A5VALID.intro)+"</div>";
  if(!st.resolved){
    html += "<div class='step-title'>Инженерное решение</div><div id='vopts'>"+
      A5VALID.options.map(function(o,k){
        var c = o.cost && o.cost.weeks ? " <span style='color:var(--bad);font-size:11px'>(-"+o.cost.weeks+" нед)</span>" : "";
        return "<div class='jopt' id='vopt"+k+"' onclick='G.validPick("+k+")'><span class='dot'></span>"+esc(o.t)+c+"</div>";
      }).join("")+"</div>";
  }
  html += "<div class='verdict' id='verdict'"+(st.lastFb?" class='verdict show "+st.lastQ+"'":"")+"></div>";
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(sc.hint||"")+"</div>";
  shell(sc, html, hintBtnHtml() + nextBtnHtml("Продолжить", !!st.resolved));
  if(st.lastFb){ var v=el("verdict"); v.className="verdict show "+st.lastQ; v.innerHTML=st.lastFb; }
}
function validPick(k){
  var sc = STORY.scenes[S.scene], o = A5VALID.options[k];
  var st = S.ui.vd;
  document.querySelectorAll("#vopts .jopt").forEach(function(x){ x.classList.remove("good","weak","bad"); });
  var eo = el("vopt"+k); if(eo) eo.classList.add(o.q);
  if(o.cost && o.cost.weeks) applyFx({weeks:o.cost.weeks});
  logEv("valid",{opt:o.id, q:o.q, hint:!!S.ui.hintUsed});
  st.lastFb = "<b>Гарин:</b> "+esc(o.fb.replace(/^Гарин:\s*/,""));
  st.lastQ = o.q;
  if(!o.stay){
    st.resolved = true;
    st.calibrated = (o.id==="calib");
    applyFx(o.q==="good" ? {adeq:12, trust:2} : {adeq:12});
  }
  save(); renderValid(sc); renderTop(sc); renderSide();
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
  else if(sc.type==="tree") renderTree(sc);
  else if(sc.type==="diag") renderDiag(sc);
  else if(sc.type==="valid") renderValid(sc);
  else if(sc.type==="result") renderResult(sc);
  else if(sc.type==="end") renderEnd(sc);
  window.scrollTo(0,0);
}
function resolveNext(sc){
  if(sc.nextIf){
    for(var i=0;i<sc.nextIf.length;i++){
      var c = sc.nextIf[i];
      if(S.flags[c.flag]===c.eq) return c.next;
    }
  }
  return sc.next;
}
function goNext(sc){
  S.ui = {};
  S.scene = resolveNext(sc);
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
    else if(sc.type==="tree") confirmTree(sc);
    else if(sc.type==="diag"){ if(S.ui.dg && S.ui.dg.concluded) goNext(sc); }
    else if(sc.type==="valid"){ if(S.ui.vd && S.ui.vd.resolved) goNext(sc); }
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
  treeNode: treeNode, diagAct: diagAct, diagConclude: diagConclude, validPick: validPick,
  _state: function(){ return S; }  // для отладки
};
})();

G.init();
