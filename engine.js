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
var IZD = "gtd";       // активное изделие (выбирается на входе)

/* ---------- продукты ----------
   Данные сюжета лежат в window.GAMEDATA[izd] (см. story.js / story_*.js).
   bindProduct «привязывает» выбранное изделие к глобальным именам,
   которые читает движок (STORY, ACTS, GLOSS, MATRIX, ...). Вызывается
   ДО первого чтения STORY (в start и в init/cont перед render). */
var PRODUCT_KEYS = ["CHARS","TECH0","ARTS","GLOSS","MATRIX","A2FILL","A1CASES",
  "A3TREE","A4DIAG","A6CAMP","A7TREE","ESSAY","FINTREE","TREES","REDO",
  "REVIEW_LESSONS","DECISIONS","NTEST","SENS","A5VALID","ACTS","STORY"];
function bindProduct(izd){
  var reg = window.GAMEDATA || {};
  var d = reg[izd] || reg.gtd;
  if(!d) return;
  IZD = reg[izd] ? izd : "gtd";
  window.GAME_IZD = IZD;   // арт (art.js) рисует мотив изделия по этому флагу
  PRODUCT_KEYS.forEach(function(k){ if(d[k]!==undefined) window[k]=d[k]; });
}
function izdLabel(){ var d=(window.GAMEDATA||{})[IZD]; return (d&&d.izdLabel)||"авиадвигатель (ГТД)"; }

/* Авто-отправка отчета преподавателю - БЕЗ действий игрока: на финале
   и при закрытии страницы. Та же гугл-форма, что у тренажера «Фабрика
   цифровых двойников»: ответ ложится строкой в таблицу формы (а если в
   форме включены уведомления - приходит письмом на почту владельца).
   Сменить форму: взять «заполненную ссылку» новой формы и обновить url
   + entry-id. Вместо формы можно указать endpoint (Formspree/webhook,
   POST JSON) - тогда url формы оставить пустым. */
var ANALYTICS = {
  googleForm: {
    url: "https://docs.google.com/forms/d/e/1FAIpQLScf9j-oP3YxrzCKCvR2gG9L-TetPSii_Y60kqrw0nkxHO0IGw/formResponse",
    fields: {
      player:       "entry.1517313908",
      izdelie:      "entry.392570465",
      stationsDone: "entry.1173437971",
      readiness:    "entry.1631590768",
      report:       "entry.326757868"
    }
  },
  endpoint: ""
};
function analyticsOn(){ return !!((ANALYTICS.googleForm && ANALYTICS.googleForm.url) || ANALYTICS.endpoint); }
function makeReport(reason){
  var pr = projRank();
  return {
    игра:"Путь двойника", версия:"полный сюжет (пролог + 11 актов + финал)",
    изделие:izdLabel(),
    причина:reason||"",
    слушатель:S.name, начало:new Date(S.started).toISOString(),
    достигнут_акт:(ACTS[Math.max(0, actIdx(S.maxActId||"p"))]||{}).t || "Пролог",
    итог:{ звание:pr.rank, балл:pr.score, недели:S.res.weeks, бюджет_млн:S.res.budget,
      ядро_часы:S.res.cores, доверие:S.res.trust, адекватность:S.res.adeq },
    артефакты:S.arts, неисправленные_последствия:S.defers,
    решения:S.log.filter(function(e){ return ["choice","valid","diagConclude","matrix","camp","sens","redo","essayReject"].indexOf(e.type)>=0; }),
    эссе:(S.log.filter(function(e){ return e.type==="essay"; })[0]||null),
    подсказки:S.log.filter(function(e){ return e.type==="hint"; }).length,
    полный_лог:S.log
  };
}
function sendReport(reason, useBeacon){
  if(!S || !analyticsOn()) return false;
  var rep = makeReport(reason);
  var gf = ANALYTICS.googleForm;
  try{
    if(gf && gf.url){
      var prm = new URLSearchParams();
      prm.append(gf.fields.player, S.name||"");
      prm.append(gf.fields.izdelie, "игра «Путь двойника» · "+izdLabel());
      prm.append(gf.fields.stationsDone, rep.достигнут_акт);
      prm.append(gf.fields.readiness, rep.итог.балл+"/100 · "+rep.итог.звание);
      prm.append(gf.fields.report, JSON.stringify(rep));
      if(useBeacon && navigator.sendBeacon){ navigator.sendBeacon(gf.url, prm); }
      else { fetch(gf.url, { method:"POST", mode:"no-cors", body:prm, keepalive:true }).catch(function(){}); }
      return true;
    }
    if(ANALYTICS.endpoint){
      var body = JSON.stringify(rep);
      if(useBeacon && navigator.sendBeacon){ navigator.sendBeacon(ANALYTICS.endpoint, new Blob([body], {type:"application/json"})); }
      else { fetch(ANALYTICS.endpoint, { method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"}, body:body, keepalive:true }).catch(function(){}); }
      return true;
    }
  }catch(e){ return false; }
  return false;
}

/* ---------- состояние ---------- */
function freshState(name){
  return {
    v:1, name:name, izd:IZD, scene:STORY.start,
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
    var s = JSON.parse(raw); if(!s || s.v!==1) return null;
    /* сейв из старой версии: сцены может уже не быть - возвращаем игрока
       на вход достигнутого акта, ресурсы и прогресс сохраняются */
    if(!STORY.scenes[s.scene]){
      var ai = s.maxActId ? actIdx(s.maxActId) : 0;
      if(ai<0) ai = 0;
      s.scene = ACTS[ai].entry; s.ui = {};
    }
    /* миграция: новые позиции карты технологий для старых сейвов */
    TECH0.forEach(function(t0){
      var has = s.tech.some(function(t){ return t.id===t0.id; });
      if(!has) s.tech.push({ id:t0.id, st:t0.st });
    });
    /* миграция: флаги для отложенных последствий, выводим из текстов defers */
    s.flags = s.flags || {};
    if(s.flags.matrixReds===undefined && (s.defers||[]).some(function(d){ return d.indexOf("красных ячеек матрицы")>=0; })) s.flags.matrixReds = true;
    if(s.flags.gas===undefined && (s.defers||[]).some(function(d){ return d.indexOf("испытания встанут")>=0; })) s.flags.gas = "none";
    if(s.flags.twinDone===undefined && (s.defers||[]).some(function(d){ return d.indexOf("готовый двойник")>=0; })) s.flags.twinDone = "promised";
    /* сейв стоит на «Итоге среза», а в игре появились НОВЫЕ акты:
       по логу находим последний реально сыгранный акт и ставим игрока
       на вход следующего - можно продолжать, не проходя заново */
    if(s.scene==="sliceEnd"){
      var maxReal = -1;
      (s.log||[]).forEach(function(e){
        if(e.scene && e.scene!=="sliceEnd"){
          var ai = actIdx(sceneActId(e.scene));
          if(ai>maxReal) maxReal = ai;
        }
      });
      var lastReal = ACTS.length-2; /* последний сюжетный акт (перед «Итогом») */
      if(maxReal>=0 && maxReal<lastReal){
        s.scene = ACTS[maxReal+1].entry;
        s.ui = {};
        s.maxActId = ACTS[maxReal+1].id;
      }
    }
    return s;
  }catch(e){ return null; }
}
/* ---------- акты: индексация и навигация ---------- */
function actIdx(id){ for(var i=0;i<ACTS.length;i++) if(ACTS[i].id===id) return i; return -1; }
function sceneActId(sceneId){
  if(sceneId==="sliceEnd") return "end";
  var best = null;
  ACTS.forEach(function(a){
    if(a.id!=="end" && sceneId.indexOf(a.id)===0 && (!best || a.id.length>best.length)) best = a.id;
  });
  return best || "p";
}
function touchAct(){
  var cur = sceneActId(S.scene);
  if(!S.maxActId || actIdx(cur) > actIdx(S.maxActId)) S.maxActId = cur;
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
  if(fx.spendCores) spendCores(fx.spendCores);
  if(fx.defer){ S.defers.push(fx.defer); logEv("defer",{text:fx.defer}); }
}
/* снять отложенное последствие по подстроке (когда оно сработало или исправлено) */
function removeDefers(match){
  S.defers = S.defers.filter(function(d){ return d.indexOf(match)<0; });
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
/* ПРАВИЛО: правильный вариант не должен всегда стоять первым. permFor дает
   детерминированную перестановку индексов [0..n-1] по ключу + номеру игры:
   порядок «перемешан», но стабилен в пределах партии (между пере-рендерами
   сцены и перезагрузками), а логика работает по РЕАЛЬНОМУ индексу варианта. */
function permFor(key, n){
  var s = ((S && S.started) ? S.started : 1) >>> 0;
  var str = ""+key;
  for(var c=0;c<str.length;c++){ s = (Math.imul(s,31) + str.charCodeAt(c)) >>> 0; }
  var idx=[]; for(var i=0;i<n;i++) idx.push(i);
  for(var i=n-1;i>0;i--){ s = (Math.imul(s,1103515245)+12345) >>> 0; var j=s%(i+1); var t=idx[i]; idx[i]=idx[j]; idx[j]=t; }
  return idx;
}

/* ---------- верхняя панель ---------- */
function renderTop(sc){
  el("actlabel").innerHTML = esc(sc.act||"") + "<br>Изделие: " + esc(izdLabel());
  var r = S.res, p = prevRes || r;
  function d(key, inverted){
    var diff = r[key]-p[key]; if(!diff) return "";
    var up = inverted ? diff<0 : diff>0;
    return " <span class='delta "+(up?"up":"down")+"'>"+(diff>0?"+":"")+diff+"</span>";
  }
  el("resbar").innerHTML =
    "<div class='chip' title='Время проекта: всего 52 недели до сдачи. Каждое решение и переделка стоят недель. Уложитесь в срок - бонус к итоговому званию.'><small>Недели</small><b>"+(WEEKS_TOTAL-r.weeks)+" <span style='color:var(--dim);font-weight:400'>/ "+WEEKS_TOTAL+"</span>"+d("weeks",true)+"</b></div>"+
    "<div class='chip' title='Деньги проекта, млн руб. Идут на лицензии, вычислительные мощности, испытания и переделки.'><small>Бюджет</small><b>"+r.budget+" <span style='color:var(--dim);font-weight:400'>млн</span>"+d("budget")+"</b></div>"+
    "<div class='chip' title='Вычислительный ресурс на расчёты и виртуальные испытания. Свои кончились - расчёты оплачиваются подрядчику деньгами.'><small>Ядро-часы</small><b>"+r.cores+"</b></div>"+
    "<div class='chip' title='Доверие директора и заказчика к вам. Растёт от обоснованных решений, падает от слабых. Влияет на итоговое звание.'><small>Доверие</small><b>"+r.trust+d("trust")+"</b></div>"+
    "<div class='chip adeq' title='Насколько цифровой двойник соответствует реальному изделию - главный показатель качества. Растёт от проверенных моделей и испытаний. Влияет на итоговое звание.'><small>Адекватность</small><b>"+r.adeq+"%"+d("adeq")+"</b><div class='bar'><i style='width:"+r.adeq+"%'></i></div></div>";
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

  /* панель «Акты»: переходы по достигнутым актам */
  var curAct = sceneActId(S.scene), maxI = actIdx(S.maxActId||"p");
  var actsHtml = "<h3>Акты · переходы</h3>" + ACTS.map(function(a,i){
    var here = a.id===curAct, open = i<=maxI;
    var right = here ? "<span class='tag rent'>вы здесь</span>"
      : open ? "<span class='tag have' style='cursor:pointer' onclick=\"G.gotoAct('"+a.id+"')\">перейти</span>"
      : "<span class='tag no'>впереди</span>";
    return "<div class='tech'"+(here?" style='border-color:var(--acc)'":"")+">"+esc(a.t)+" "+right+"</div>";
  }).join("") +
  "<div class='counter'>Достигнутые акты можно открыть заново - например, чтобы продолжить с нового места после обновления игры. Ресурсы при переходе сохраняются как есть.</div>";
  /* пересмотр решений: активные отложенные последствия можно исправить точечно */
  if(S.defers.length){
    actsHtml += "<h3 style='margin-top:14px'>Отложенные последствия · пересмотр</h3>" + S.defers.map(function(d,i){
      var fix = null;
      REDO.forEach(function(rd){ if(!fix && d.indexOf(rd.match)>=0) fix = rd; });
      var btn = fix ? "<div style='margin-top:6px'><span class='tag have' style='cursor:pointer' onclick='G.redoFix("+i+")'>исправить · "+
        esc([(fix.cost.budget?(-fix.cost.budget)+" млн":""),(fix.cost.weeks?fix.cost.weeks+" нед":"")].filter(Boolean).join(" + ")||"бесплатно")+"</span> "+
        "<span style='font-size:11px;color:var(--dim)'>"+esc(fix.t)+"</span></div>" : "";
      return "<div class='tech' style='display:block'>"+esc(d)+btn+"</div>";
    }).join("") +
    "<div class='counter'>Пересмотр решения - принцип платформы с ядром SPDM: изменились условия - меняется ОДНО решение и его связи, а не весь проект. Исправление стоит ресурсов, но дешевле аврала, когда последствие выстрелит само.</div>";
  }
  el("p-acts").innerHTML = actsHtml;
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
  pickState = null;  // чистый вход в сцену
  var html = "";
  if(sc.pre){ html += "<div class='dialog'>"; sc.pre.forEach(function(l){ html += say(l.who, l.t); }); html += "</div>"; }
  html += "<div class='task'>"+sub(sc.task)+"</div>";
  if(sc.need) html += "<div class='need'>"+sc.need+"</div>";
  html += "<div class='step-title'>"+(sc.noJust?"Решение":"Шаг 1 из 2 · <span>Выбор решения</span>")+"</div>";
  html += "<div class='choices'>" + permFor(S.scene+"#opt", sc.options.length).map(function(i){ var o=sc.options[i];
    return "<div class='card' id='opt"+i+"' onclick='G.pick("+i+")'><h4>"+esc(o.t)+"</h4>"+esc(o.desc)+
      (o.cost?"<div class='cost'><i class='minus'>"+esc(o.cost)+"</i></div>":"")+"</div>";
  }).join("") + "</div>";
  html += "<div class='justify' id='justify'></div>";
  html += "<div class='verdict' id='verdict'></div>";
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(sc.hint||"Здесь подсказки нет - решение за тобой. Но я рядом.")+"</div>";
  /* сначала реши - кнопка «Принять решение»; последствие покажется ПОСЛЕ фиксации */
  shell(sc, html, hintBtnHtml() + nextBtnHtml("Принять решение", false));
}
var pickState = null; // {opt, just, q, fbText, committed}
function pick(i){
  var sc = STORY.scenes[S.scene], o = sc.options[i];
  if(pickState && pickState.committed) return;  // решение уже принято - не переигрываем
  pickState = { opt:i, just:null, q:null, fbText:null, committed:false };
  document.querySelectorAll(".card").forEach(function(c){ c.classList.remove("sel"); });
  el("opt"+i).classList.add("sel");
  var v = el("verdict"); v.className="verdict"; v.innerHTML="";  // НИКАКОГО превью последствия до фиксации
  var j = el("justify");
  if(sc.noJust){
    pickState.q = o.fb.q;
    pickState.fbText = sub(o.fb.t);
    if(j){ j.className="justify"; j.innerHTML=""; }
    el("nextbtn").classList.add("ready");   // выбор полон - можно фиксировать
  } else {
    el("nextbtn").classList.remove("ready");  // ждём обоснование
    j.className = "justify open";
    j.innerHTML = "<div class='step-title' style='padding-left:0'>Шаг 2 из 2 · <span>Обоснование - почему так?</span></div>"+
      permFor(S.scene+"#just"+pickState.opt, o.just.length).map(function(k){ var jo=o.just[k];
        return "<div class='jopt' id='jopt"+k+"' onclick='G.just("+k+")'><span class='dot'></span>"+esc(jo.t)+"</div>";
      }).join("");
  }
}
function just(k){
  if(!pickState || pickState.committed) return;
  var sc = STORY.scenes[S.scene], o = sc.options[pickState.opt], jo = o.just[k];
  pickState.just = k; pickState.q = jo.q; pickState.fbText = sub(jo.fb);
  document.querySelectorAll(".jopt").forEach(function(x){ x.classList.remove("sel"); });  // нейтральное выделение, без цвета качества
  el("jopt"+k).classList.add("sel");
  el("nextbtn").classList.add("ready");   // выбор полон - можно фиксировать
}
/* фиксация решения: применяем эффекты и ТОЛЬКО ТЕПЕРЬ показываем последствие (нейтрально, без цвета) */
function commitChoice(sc){
  var o = sc.options[pickState.opt];
  applyFx(o.fx);
  applyFx(qualFx(pickState.q));
  logEv("choice", { opt:o.t, just:(pickState.just!=null ? o.just[pickState.just].t : null), q:pickState.q, hint:!!S.ui.hintUsed });
  pickState.committed = true;
  var v = el("verdict");
  v.className = "verdict show neutral";
  v.innerHTML = pickState.fbText || "";
  document.querySelectorAll(".card, .jopt").forEach(function(x){ x.style.pointerEvents = "none"; });  // назад нельзя
  var b = el("nextbtn"); if(b){ b.textContent = "Продолжить →"; b.classList.add("ready"); }
  save(); renderTop(sc); renderSide();   // ресурсы изменились по факту - показать сразу
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
  else { applyFx({trust:-5, flag:{matrixReds:true}, defer:"Акт 9 (натурные): "+(MATRIX.inds.length-green)+" красных ячеек матрицы всплывут на испытаниях опытного образца"}); }
  logEv("matrix", { green:green, total:MATRIX.inds.length, moves:S.ui.moves||0, hint:!!S.ui.hintUsed, sliders:mxVals() });
  goNext(sc);
}

/* ---------- reqfill: наполнение матрицы требованиями (акт 2) ----------
   Раскрой каждое требование - увидишь целевое значение, источник, от чего зависит
   и с чем конфликтует. Это условия задачи, без решения (балансировка - позже). */
function renderReqfill(sc){
  var st = S.ui.rf || (S.ui.rf = { open:[] });
  var total = A2FILL.items.length;
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='reqgrid'>" + A2FILL.items.map(function(it,i){
    var on = st.open.indexOf(i)>=0;
    return "<div class='reqcard"+(on?" open":"")+"' onclick='G.reqOpen("+i+")'>"+
      "<div class='reqtop'><b>"+esc(it.t)+"</b><span class='reqtgt'>"+esc(it.target)+"</span></div>"+
      (on
        ? "<div class='reqdet'><div><i>источник:</i> "+esc(it.src)+"</div>"+
          "<div><i>зависит от:</i> "+esc(it.levers)+"</div>"+
          "<div class='reqconf'><i>конфликт:</i> "+esc(it.conflict)+"</div></div>"
        : "<div class='reqhint'>нажмите, чтобы разложить</div>")+
    "</div>";
  }).join("") + "</div>";
  var done = st.open.length===total;
  html += "<div class='mxstatus'>Разложено требований: <b>"+st.open.length+" из "+total+"</b>"+(done?" - матрица требований наполнена":"")+"</div>";
  if(done) html += "<div class='verdict show neutral'><b>Гарин:</b> "+esc(A2FILL.done)+"</div>";
  shell(sc, html, nextBtnHtml("Матрица наполнена", done));
}
function reqOpen(i){
  var sc = STORY.scenes[S.scene];
  var st = S.ui.rf || (S.ui.rf = { open:[] });
  if(st.open.indexOf(i)<0){ st.open.push(i); logEv("reqfill",{ item:A2FILL.items[i].id }); }
  save(); renderReqfill(sc); renderSide();
}
function confirmReqfill(sc){
  var st = S.ui.rf || { open:[] };
  if(st.open.length !== A2FILL.items.length) return;
  if(sc.cost) applyFx({ weeks:sc.cost.weeks||0, budget:sc.cost.budget||0 });
  logEv("reqfillDone", {});
  goNext(sc);
}

/* ---------- cases: разведка кейсов (акт 1) ----------
   Изучить кейсы из разных отраслей и рассортировать на релевантность:
   «В работу» (опыт применим к нашему ГТД) / «Отложить» (другой объект, ярлык).
   Из взятого в работу собираются технологии для дальнейшей работы. */
function caseBucketLabel(id){ var r=id; A1CASES.buckets.forEach(function(b){ if(b.id===id) r=b.label; }); return r; }
function renderCases(sc){
  var st = S.ui.cs || (S.ui.cs = { pick:{}, open:[], checked:false });
  var items = A1CASES.items, review = st.checked;
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='need'>"+esc(A1CASES.intro)+"</div>";
  html += "<div class='cases'>";
  items.forEach(function(it,i){
    var pick = st.pick[i], open = st.open.indexOf(i)>=0, ok = pick===it.bucket;
    html += "<div class='casecard"+(review?(ok?" ok":" bad"):"")+"'>"+
      "<div class='casetop'><b>"+esc(it.t)+"</b><span class='caseind'>"+esc(it.ind)+"</span></div>"+
      "<button class='caseread' onclick='G.caseRead("+i+")'>"+(open?"▲ Скрыть":"ⓘ Читать")+"</button>"+
      (open ? "<div class='casefacts'>"+esc(it.facts)+"<div class='caselink'><a href='"+esc(it.url)+"' target='_blank' rel='noopener'>Читать статью →</a></div></div>" : "");
    if(!review){
      html += "<div class='casebtns'>"+A1CASES.buckets.map(function(b){
        return "<button class='casebtn"+(pick===b.id?" on":"")+"' onclick='G.casePick("+i+",\""+b.id+"\")'>"+esc(b.label)+"</button>";
      }).join("")+"</div>";
    } else {
      html += "<div class='caseverdict'>"+(ok?"✓ верно: "+esc(caseBucketLabel(it.bucket)) : "ваш выбор: "+esc(caseBucketLabel(pick))+" · верно: "+esc(caseBucketLabel(it.bucket)))+
        "<div class='casewhy'>"+esc(it.why)+"</div></div>";
    }
    html += "</div>";
  });
  html += "</div>";
  if(review){
    var techs = {}; items.forEach(function(it){ if(it.bucket==="work") (it.tech||[]).forEach(function(t){ techs[t]=1; }); });
    html += "<div class='casetech'><b>В работу взяты технологии:</b> "+Object.keys(techs).map(function(t){ return "<span class='techchip'>"+esc(t)+"</span>"; }).join("")+"</div>";
    var correct=0; items.forEach(function(it,i){ if(st.pick[i]===it.bucket) correct++; });
    html += "<div class='verdict show neutral'><b>Гарин:</b> "+esc(A1CASES.done)+" Верно рассортировано: "+correct+" из "+items.length+".</div>";
  }
  var assigned = Object.keys(st.pick).length;
  var foot = review
    ? nextBtnHtml("Продолжить", true)
    : "<button class='nextbtn"+(assigned>=items.length?" ready":"")+"' id='nextbtn' onclick='G.casesCheck()'>Проверить сортировку</button>";
  shell(sc, html, foot);
}
function caseRead(i){
  var st = S.ui.cs || (S.ui.cs={pick:{},open:[],checked:false});
  var ix = st.open.indexOf(i); if(ix>=0) st.open.splice(ix,1); else st.open.push(i);
  save(); renderCases(STORY.scenes[S.scene]);
}
function casePick(i,b){
  var st = S.ui.cs; if(!st || st.checked) return;
  st.pick[i]=b; logEv("casePick",{ id:A1CASES.items[i].id, bucket:b });
  save(); renderCases(STORY.scenes[S.scene]);
}
function casesCheck(){
  var sc = STORY.scenes[S.scene], st = S.ui.cs, items = A1CASES.items;
  if(!st || Object.keys(st.pick).length < items.length) return;
  st.checked = true;
  var correct=0; items.forEach(function(it,i){ if(st.pick[i]===it.bucket) correct++; });
  applyFx({ adeq:2, trust: (correct>=items.length-1 ? 2 : 0) });
  logEv("casesDone",{ correct:correct, total:items.length });
  save(); renderCases(sc); renderTop(sc); renderSide();
}
function confirmCases(sc){
  if(!S.ui.cs || !S.ui.cs.checked) return;
  if(sc.cost) applyFx({ weeks:sc.cost.weeks||0 });
  logEv("casesNext",{});
  goNext(sc);
}

/* ---------- tree: интерактивная сборка по узлам (акты 3 и 7) ---------- */
function treeCfg(sc){ return TREES[sc.tree || "a3"]; }
function treeNodeById(cfg,id){ var r=null; cfg.levels.forEach(function(lv){ lv.nodes.forEach(function(nd){ if(nd.id===id) r=nd; }); }); return r; }
/* ПРАВИЛО: в множественном выборе «взять всё» не должно быть верным.
   Узлы с trap:true - ложные (их подключать НЕ надо). Завершение возможно,
   только когда подключены все настоящие узлы И не выбрано ни одного ложного. */
function treeStats(cfg){
  var done = S.ui.tdone || [];
  var realTotal=0, realDone=0, trapSel=[];
  cfg.levels.forEach(function(lv){ lv.nodes.forEach(function(nd){
    if(nd.trap){ if(done.indexOf(nd.id)>=0) trapSel.push(nd); }
    else { realTotal++; if(done.indexOf(nd.id)>=0) realDone++; }
  }); });
  return { realTotal:realTotal, realDone:realDone, trapSel:trapSel, allDone:(realDone===realTotal && trapSel.length===0) };
}
function treeCount(cfg){
  var done = S.ui.tdone || [];
  var n = cfg.start;
  cfg.levels.forEach(function(lv){ lv.nodes.forEach(function(nd){ if(!nd.trap && done.indexOf(nd.id)>=0) n += nd.n; }); });
  return n;
}
function renderTree(sc){
  var cfg = treeCfg(sc);
  var done = S.ui.tdone || [];
  var html = "<div class='task'>"+sub(sc.task)+"</div><div class='tree'>";
  cfg.levels.forEach(function(lv, li){
    html += "<div class='tlevel'><h5>"+esc(lv.t)+"</h5><div class='tnodes'>";
    lv.nodes.forEach(function(nd){
      var on = done.indexOf(nd.id)>=0;
      var onLabel = (cfg.label ? "подключено" : "+"+nd.n+" моделей");
      var offLabel = (cfg.label ? "подключить" : "запустить разработку");
      var lbl = on ? (nd.trap ? "лишнее - убрать" : onLabel) : offLabel;
      html += "<div class='tnode"+(on?" on":"")+(on&&nd.trap?" trap":"")+"' onclick=\"G.treeNode('"+nd.id+"')\">"+
        "<div class='tt'>"+esc(nd.t)+"</div><div class='tn'>"+lbl+"</div></div>";
    });
    html += "</div></div>";
    if(li < cfg.levels.length-1) html += "<div class='tlink'>↓ результаты уровня питают следующий ↓</div>";
  });
  html += "</div>";
  html += "<div class='adv-say show' id='treeinfo' style='"+(S.ui.tinfo?"":"display:none")+"'>"+(S.ui.tinfo||"")+"</div>";
  var st = treeStats(cfg), cnt = treeCount(cfg);
  html += "<div class='mxstatus'>"+esc(cfg.label||"Моделей в системе")+": <b style='font-size:16px;color:var(--acc2)'>"+cnt+"</b> из "+cfg.target+
    (st.allDone ? " - <span style='color:var(--ok)'>готово</span>" : "") + "</div>";
  if(st.trapSel.length){
    html += "<div class='verdict show weak'><b>Гарин:</b> сюда затесалось лишнее. "+
      st.trapSel.map(function(nd){ return "<b>"+esc(nd.t)+"</b> - "+esc(nd.info); }).join(" ")+
      " Убери лишнее (клик по узлу еще раз) - и продолжим.</div>";
  } else if(st.allDone){
    html += "<div class='verdict show good'><b>Гарин:</b> "+esc(cfg.done)+"</div>";
  }
  shell(sc, html, nextBtnHtml("Готово", st.allDone));
}
function treeNode(id){
  var sc = STORY.scenes[S.scene], cfg = treeCfg(sc);
  S.ui.tdone = S.ui.tdone || [];
  var node = treeNodeById(cfg, id);
  var ix = S.ui.tdone.indexOf(id);
  if(ix>=0){ S.ui.tdone.splice(ix,1); }                  /* повторный клик - снять узел */
  else { S.ui.tdone.push(id); logEv("tree",{node:id, trap:!!(node&&node.trap)}); }
  if(node) S.ui.tinfo = "<b>"+esc(node.t)+":</b> "+esc(node.info);
  save(); renderTree(sc);
}
function confirmTree(sc){
  var cfg = treeCfg(sc);
  if(!treeStats(cfg).allDone) return;
  if(sc.cost) applyFx({weeks:sc.cost.weeks||0, budget:sc.cost.budget||0});
  logEv("treeDone",{count:treeCount(cfg)});
  goNext(sc);
}

/* ---------- camp: кампания виртуальных испытаний (акт 6) ---------- */
function renderCamp(sc){
  var st = S.ui.cp || (S.ui.cp = { sel:{}, runs:0, done:false, shown:0 });
  var noPoly = !!S.flags.noPoly;
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='need'>"+esc(A6CAMP.intro)+(noPoly?" <b style='color:var(--bad)'>Полигона нет - полигонные задачи выполнить не получится.</b>":"")+"</div>";
  html += "<div class='camp'>";
  A6CAMP.tasks.forEach(function(tk,i){
    var sel = st.sel[i];
    var wrongNow = st.wrong && st.wrong.indexOf(i)>=0;
    var skipped = noPoly && tk.right==="poly";
    html += "<div class='crow"+(wrongNow?" wrong":"")+(skipped?" skip":"")+"'>"+
      "<div class='ct'>"+esc(tk.t)+(wrongNow?"<div class='cwhy'>"+esc(tk.why)+"</div>":"")+"</div>"+
      (skipped
        ? "<div class='cbtns'><span class='tag no'>нет полигона - пропуск</span></div>"
        : "<div class='cbtns'>"+
          "<button class='cbtn"+(sel==="stand"?" on":"")+"' onclick='G.campSel("+i+",\"stand\")'>🔬 Стенд</button>"+
          "<button class='cbtn"+(sel==="poly"?" on":"")+"' onclick='G.campSel("+i+",\"poly\")'>🏟️ Полигон</button></div>")+
      "</div>";
  });
  html += "</div>";
  if(st.done){
    html += "<div class='bigcount'>Выполнено испытаний: <b id='ccount'>"+(st.shown||0)+"</b><div class='cmx'>матрица требований заполняется результатами</div></div>";
    html += "<div class='verdict show good'><b>Гарин:</b> кампания прошла. "+(noPoly?"Без полигона часть ячеек осталась пустой - это мы еще вспомним. ":"")+"Каждая зеленая ячейка матрицы теперь подтверждена не мнением, а испытаниями.</div>";
  } else if(st.runs>0 && st.wrong && st.wrong.length){
    html += "<div class='verdict show weak'><b>Гарин:</b> "+st.wrong.length+" "+(st.wrong.length===1?"кампания спланирована":"кампании спланированы")+" не на ту установку - неделя и тридцать тысяч ядро-часов впустую. Смотри подсказки на красных строках, переназначь и запускай заново.</div>";
  }
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(A6CAMP.hint)+"</div>";
  var assignable = A6CAMP.tasks.filter(function(tk){ return !(noPoly && tk.right==="poly"); }).length;
  var allSel = Object.keys(st.sel).length >= assignable;
  var foot = st.done
    ? nextBtnHtml("Продолжить", true)
    : hintBtnHtml() + "<button class='nextbtn"+(allSel?" ready":"")+"' id='nextbtn' onclick='G.campLaunch()'>🚀 Запустить кампанию</button>";
  shell(sc, html, foot);
}
function campSel(i, v){
  var st = S.ui.cp; if(st.done) return;
  st.sel[i] = v;
  if(st.wrong){ var ix = st.wrong.indexOf(i); if(ix>=0) st.wrong.splice(ix,1); }
  save(); renderCamp(STORY.scenes[S.scene]);
}
function campLaunch(){
  var sc = STORY.scenes[S.scene], st = S.ui.cp;
  if(st.done) return;
  var noPoly = !!S.flags.noPoly;
  var assignable = A6CAMP.tasks.filter(function(tk){ return !(noPoly && tk.right==="poly"); }).length;
  if(Object.keys(st.sel).length < assignable) return;
  st.runs++;
  if(st.runs===1){ applyFx({weeks:A6CAMP.launchCost.weeks}); spendCores(A6CAMP.launchCost.cores); }
  var wrong = [];
  A6CAMP.tasks.forEach(function(tk,i){
    if(noPoly && tk.right==="poly") return;
    if(st.sel[i] !== tk.right) wrong.push(i);
  });
  if(wrong.length){
    st.wrong = wrong;
    applyFx({weeks:A6CAMP.failCost.weeks}); spendCores(A6CAMP.failCost.cores);
    logEv("camp",{run:st.runs, wrong:wrong.length});
    save(); renderCamp(sc); renderTop(sc); renderSide();
    return;
  }
  st.done = true; st.wrong = null;
  var total = noPoly ? Math.round(A6CAMP.total*0.62) : A6CAMP.total;
  st.total = total;
  applyFx(noPoly ? {adeq:12, trust:2} : {adeq:20, trust:4});
  logEv("camp",{run:st.runs, done:true, tests:total, hint:!!S.ui.hintUsed});
  save(); renderCamp(sc); renderTop(sc); renderSide();
  /* анимация счетчика испытаний */
  var elc = el("ccount"), cur = 0, step = Math.max(7, Math.round(total/120));
  var iv = setInterval(function(){
    cur += step;
    if(cur >= total){ cur = total; clearInterval(iv); }
    st.shown = cur;
    if(elc && document.body.contains(elc)) elc.textContent = cur.toLocaleString("ru-RU");
    else clearInterval(iv);
  }, 24);
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
    "<text x='"+(padL+zoneW+8).toFixed(0)+"' y='24' font-size='10' fill='"+(calibrated?"var(--ok)":"var(--bad)")+"'>выше · "+(calibrated?"~4% после уточнения модели":"до 18%")+"</text>"+
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

/* ---------- ntest: протокол натурного испытания (акт 8) ---------- */
function renderNtest(sc){
  var st = S.ui.nt || (S.ui.nt = { i:0, recs:[], done:false });
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='need'>"+esc(NTEST.intro)+"</div>";
  html += "<div class='findings'>";
  for(var k=0;k<st.recs.length;k++){
    var r = st.recs[k], step = NTEST.steps[r.i];
    html += "<div class='find' style='border-left-color:"+(r.fired?"var(--bad)":"var(--ok)")+"'>"+
      "<b style='color:"+(r.fired?"var(--bad)":"var(--ok)")+"'>Шаг "+(r.i+1)+" · "+esc(step.t)+":</b> "+
      esc(r.fired ? step.bad : step.ok)+"</div>";
  }
  html += "</div>";
  if(st.done){
    var anyFired = st.recs.some(function(r){ return r.fired; });
    var sum = anyFired ? NTEST.dirty : NTEST.clean;
    html += "<div class='verdict show "+(anyFired?"weak":"good")+"'><b>"+esc(sum.t)+".</b> "+esc(sum.d)+"</div>";
  }
  var label = st.done ? "Продолжить" : (st.i===0 ? "▶ Начать испытания" : "Следующий шаг протокола");
  shell(sc, html, nextBtnHtml(label, true));
}
function ntestStep(sc){
  var st = S.ui.nt;
  if(st.done){ goNext(sc); return; }
  if(st.i < NTEST.steps.length){
    var step = NTEST.steps[st.i];
    var fired = !!(step.fire && step.fire(S.flags, S.arts));
    if(fired && step.fx) applyFx(step.fx);
    if(fired && step.clearDefer) removeDefers(step.clearDefer);
    st.recs.push({ i:st.i, fired:fired });
    logEv("ntest",{ step:st.i, fired:fired });
    st.i++;
    if(st.i === NTEST.steps.length){
      st.done = true;
      var anyFired = st.recs.some(function(r){ return r.fired; });
      applyFx((anyFired ? NTEST.dirty : NTEST.clean).fx);
      applyFx({flag:{testClean: !anyFired}});
      logEv("ntestDone",{ clean:!anyFired });
    }
    save(); renderNtest(sc); renderTop(sc); renderSide();
  }
}

/* ---------- sens: расстановка датчиков (акт 10) ---------- */
function renderSens(sc){
  var st = S.ui.sn || (S.ui.sn = { sel:[], runs:0, done:false, virt:false });
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='need'>"+esc(SENS.intro)+"</div>";
  html += "<div class='choices' style='grid-template-columns:repeat(auto-fit,minmax(200px,1fr))'>";
  SENS.spots.forEach(function(sp,i){
    var on = st.sel.indexOf(i)>=0;
    var imp = sp.kind==="imp";
    var missNow = st.miss && st.miss.indexOf(i)>=0;
    html += "<div class='card"+(on?" sel":"")+(missNow?" " : "")+"' "+(missNow?"style='border-color:rgba(255,209,102,.6)'":"")+
      " onclick='G.sensPick("+i+")'><h4>"+(imp?"🚫 ":"📡 ")+esc(sp.t)+"</h4>"+esc(sp.d)+
      (imp && st.virt ? "<div class='cost'><i class='note'>виртуальный датчик подключен</i></div>" : "")+
      (missNow && SENS.whyJunk[sp.id] ? "<div class='cost'><i class='note'>"+esc(SENS.whyJunk[sp.id])+"</i></div>" : "")+
      "</div>";
  });
  html += "</div>";
  html += "<div class='mxstatus'>Каналов занято: <b>"+st.sel.length+" из "+SENS.channels+"</b>"+
    (st.virt ? " · <span style='color:var(--acc2)'>+ виртуальный датчик в камере сгорания (канал не нужен)</span>" : "")+"</div>";
  html += "<div class='verdict' id='verdict'></div>";
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(SENS.hint)+"</div>";
  if(st.done){
    html += "<div class='verdict show good'><b>Гарин:</b> телеметрия совпала с картой критических зон из акта 6: модель сама подсказала, где слушать изделие. Это и есть осмысленные данные вместо больших.</div>";
  }
  var foot = st.done
    ? nextBtnHtml("Продолжить", true)
    : hintBtnHtml() + "<button class='nextbtn"+(st.sel.length===SENS.channels?" ready":"")+"' id='nextbtn' onclick='G.sensLaunch()'>📡 Подключить телеметрию</button>";
  shell(sc, html, foot);
}
function sensPick(i){
  var st = S.ui.sn; if(st.done) return;
  var sp = SENS.spots[i];
  if(sp.kind==="imp"){
    if(!st.virt){
      st.virt = true;
      applyFx({gloss:["vsens"]});
      logEv("sens",{virt:true});
    }
    save(); renderSens(STORY.scenes[S.scene]);
    var v = el("verdict");
    v.className = "verdict show good";
    v.innerHTML = "<b>Гарин:</b> в камере сгорания физический датчик не живет - там работает ВИРТУАЛЬНЫЙ датчик: расчетная точка на модели, значение восстанавливается по соседним измерениям. Канал телеметрии не тратится.";
    return;
  }
  var ix = st.sel.indexOf(i);
  if(ix>=0) st.sel.splice(ix,1);
  else { if(st.sel.length>=SENS.channels) return; st.sel.push(i); }
  if(st.miss){ var mi = st.miss.indexOf(i); if(mi>=0) st.miss.splice(mi,1); }
  save(); renderSens(STORY.scenes[S.scene]);
}
function sensLaunch(){
  var sc = STORY.scenes[S.scene], st = S.ui.sn;
  if(st.done || st.sel.length!==SENS.channels) return;
  st.runs++;
  if(st.runs===1 && sc.cost) applyFx({budget:sc.cost.budget||0, weeks:sc.cost.weeks||0});
  var miss = st.sel.filter(function(i){ return SENS.spots[i].kind!=="crit"; });
  if(miss.length){
    st.miss = miss;
    applyFx({budget:-2});
    logEv("sens",{run:st.runs, miss:miss.length});
    save(); renderSens(sc); renderTop(sc);
    var v = el("verdict");
    v.className = "verdict show weak";
    v.innerHTML = "<b>Гарин:</b> "+miss.length+" "+(miss.length===1?"канал занят":"канала заняты")+" не тем - смотри пометки на карточках и сверься с картой критических зон. Перенастройка - минус два миллиона.";
    return;
  }
  st.done = true; st.miss = null;
  applyFx({adeq:10, trust:4, tech:{sens:"have"}});
  logEv("sens",{run:st.runs, done:true, hint:!!S.ui.hintUsed});
  save(); renderSens(sc); renderTop(sc); renderSide();
}

/* ---------- review: разбор полетов - интерактивная карта игры (финал) ----------
   Верхний ряд - все акты и переходы между ними (архитектура игры целиком),
   под актами - развилки решений. Узел кликабелен: панель показывает решение,
   разбор Гарина и - если последствие еще активно - кнопку точечного исправления. */
function decisionOf(scene){
  /* последнее событие решения по сцене */
  var ev = null;
  S.log.forEach(function(e){
    if(e.scene!==scene) return;
    if(e.type==="choice" || e.type==="diagConclude") ev = { opt:(e.opt||""), q:e.q };
    if(e.type==="valid"){
      var o = null; A5VALID.options.forEach(function(x){ if(x.id===e.opt) o = x; });
      ev = { opt:(o ? o.t : (e.opt||"")), q:e.q };
    }
    if(e.type==="matrix") ev = { opt:(e.green===e.total ? "Все показатели в допуске" : "Утверждена с красными ячейками ("+(e.total-e.green)+")"), q:(e.green===e.total ? "good":"bad") };
  });
  return ev;
}
function stripEmoji(s){ return String(s).replace(/^[^\wа-яё]+\s*/i,""); }
/* активные последствия -> развилка, на которой они родились (по логу) */
function deferLinks(){
  var links = {};
  S.defers.forEach(function(dt, i){
    var org = null;
    S.log.forEach(function(e){ if(e.type==="defer" && e.text===dt) org = e.scene; });
    var di = -1;
    DECISIONS.forEach(function(d, k){ if(di<0 && d.scene===org) di = k; });
    if(di<0 && org){ /* последствие из сцены-сателлита - вешаем на развилку того же акта */
      var act = sceneActId(org);
      DECISIONS.forEach(function(d, k){ if(di<0 && sceneActId(d.scene)===act) di = k; });
    }
    if(di<0) return;
    var rd = null; REDO.forEach(function(r){ if(!rd && dt.indexOf(r.match)>=0) rd = r; });
    (links[di] = links[di]||[]).push({ i:i, redo:rd, text:dt });
  });
  return links;
}
function reviewMapSvg(rows, links, sel){
  var colW = 132, x0 = 16, W = x0 + ACTS.length*colW + 12, H = 246;
  var yAct = 34, actH = 36, yDot = 138, dotGap = 62;
  var qcol = { good:"var(--ok)", weak:"var(--warn)", bad:"var(--bad)" };
  var maxI = actIdx(S.maxActId||"p");
  var grouped = {}; rows.forEach(function(r,k){ (grouped[r.act] = grouped[r.act]||[]).push(k); });
  var svg = "<defs><marker id='revarr' viewBox='0 0 8 8' refX='7' refY='4' markerWidth='7' markerHeight='7' orient='auto'>"+
    "<path d='M0 0 L8 4 L0 8 z' fill='var(--faint)'/></marker></defs>";
  svg += "<text x='"+x0+"' y='18' font-size='10.5' fill='var(--dim)' font-family='Segoe UI'>АРХИТЕКТУРА ИГРЫ · сверху - акты и переходы, ниже - развилки решений (нажимайте на кружки): "+
    "зеленый - сильное, желтый - спорное, красный - ошибка, серый - не пройдено; ⚠ - активное последствие, можно исправить</text>";
  ACTS.forEach(function(a, ai){
    var cx = x0 + ai*colW + colW/2, rx = cx-58, rw = 116;
    var reached = ai<=maxI;
    var parts = a.t.split("·"), l1 = parts[0].trim(), l2 = (parts[1]||"").trim();
    if(ai>0) svg += "<line x1='"+(rx-14)+"' y1='"+(yAct+actH/2)+"' x2='"+(rx-3)+"' y2='"+(yAct+actH/2)+"' stroke='"+(reached?"var(--acc)":"var(--line)")+"' stroke-width='2' marker-end='url(#revarr)'/>";
    svg += "<rect x='"+rx+"' y='"+yAct+"' width='"+rw+"' height='"+actH+"' rx='8' fill='"+(reached?"var(--panel2)":"#0e1626")+"' stroke='"+(reached?"var(--acc)":"var(--line)")+"' stroke-width='1.2'/>"+
      "<text x='"+cx+"' y='"+(yAct+15)+"' font-size='9.5' font-weight='700' fill='"+(reached?"var(--txt)":"var(--faint)")+"' text-anchor='middle' font-family='Segoe UI'>"+esc(l1)+"</text>"+
      (l2?"<text x='"+cx+"' y='"+(yAct+28)+"' font-size='8.5' fill='var(--dim)' text-anchor='middle' font-family='Segoe UI'>"+esc(l2)+"</text>":"");
    var ks = grouped[a.id]||[];
    if(ks.length) svg += "<line x1='"+cx+"' y1='"+(yAct+actH)+"' x2='"+cx+"' y2='"+(yDot+(ks.length-1)*dotGap)+"' stroke='var(--line)' stroke-dasharray='2 4' opacity='.6'/>";
    ks.forEach(function(k, j){
      var r = rows[k], cy = yDot + j*dotGap;
      var col = r.ev ? (qcol[r.ev.q]||"var(--acc2)") : "var(--faint)";
      svg += "<g class='revdot"+(sel===k?" sel":"")+"' id='revdot"+k+"' onclick='G.reviewNode("+k+")' style='cursor:pointer'>";
      if(links[k]) svg += "<circle cx='"+cx+"' cy='"+cy+"' r='15' fill='none' stroke='var(--warn)' stroke-width='1.6' stroke-dasharray='3 3'/>"+
        "<text x='"+(cx+12)+"' y='"+(cy-12)+"' font-size='12'>⚠</text>";
      svg += "<circle class='dotmain' cx='"+cx+"' cy='"+cy+"' r='9' fill='"+col+"' stroke='#0a111d' stroke-width='2'>"+
        "<title>"+esc(r.d.t+": "+(r.ev ? stripEmoji(r.ev.opt) : "не пройдено"))+"</title></circle>"+
        "<text x='"+cx+"' y='"+(cy+24)+"' font-size='9' fill='var(--dim)' text-anchor='middle' font-family='Segoe UI'>"+esc(r.d.short)+"</text></g>";
    });
  });
  return "<div style='overflow-x:auto'><svg viewBox='0 0 "+W+" "+H+"' style='min-width:"+W+"px;height:"+H+"px;background:#0c1626;border:1px solid var(--line);border-radius:12px'>"+svg+"</svg></div>";
}
function actName(id){ var t = ""; ACTS.forEach(function(a){ if(a.id===id) t = a.t; }); return t; }
function reviewPanelHtml(rows, links, sel){
  if(sel==null || !rows[sel])
    return "<div class='counter' style='margin-top:0'>Нажмите на развилку (кружок) на карте: откроется ваше решение, разбор Гарина и - если последствие еще активно - кнопка точечного исправления.</div>";
  var r = rows[sel], lk = links[sel]||[];
  var actI = actIdx(r.act), open = actI>=0 && actI<=actIdx(S.maxActId||"p");
  var qname = { good:"сильное решение", weak:"спорное решение", bad:"ошибка" };
  var qcolC = { good:"var(--ok)", weak:"var(--warn)", bad:"var(--bad)" };
  var h = "<div class='revhead'><b>"+esc(r.d.t)+"</b> <span style='color:var(--faint)'>· "+esc(actName(r.act))+"</span></div>";
  if(r.ev){
    var col = qcolC[r.ev.q]||"var(--acc2)";
    h += "<div class='revrow'>Ваше решение: <b style='color:"+col+"'>"+esc(stripEmoji(r.ev.opt))+"</b> "+
      "<span class='tag' style='border:1px solid "+col+";color:"+col+"'>"+(qname[r.ev.q]||"")+"</span></div>";
    var refl = r.d.refl[r.ev.q];
    if(refl) h += "<div class='revrow' style='color:var(--dim)'><b>Гарин:</b> "+esc(refl)+"</div>";
  } else {
    h += "<div class='revrow' style='color:var(--faint)'>Эта развилка в вашем прохождении не сыграна: путь прошел другой веткой либо акт еще впереди.</div>";
  }
  lk.forEach(function(f){
    h += "<div class='revrow' style='color:var(--warn)'>⚠ Активное последствие: "+esc(f.text)+"</div>";
    if(f.redo){
      var price = [(f.redo.cost.budget?(-f.redo.cost.budget)+" млн":""),(f.redo.cost.weeks?f.redo.cost.weeks+" нед":"")].filter(Boolean).join(" + ")||"бесплатно";
      h += "<div class='revrow'><span class='tag have' style='cursor:pointer' onclick='G.redoFix("+f.i+")'>исправить · "+esc(price)+"</span> "+
        "<span style='font-size:11px;color:var(--dim)'>"+esc(f.redo.t)+"</span></div>";
    }
  });
  if(r.ev && !lk.length && r.ev.q!=="good")
    h += "<div class='revrow' style='font-size:11.5px;color:var(--faint)'>Активных последствий по этой развилке не осталось: либо уже исправлено, либо расплата случилась и учтена.</div>";
  if(open) h += "<div class='revrow'><span class='tag rent' style='cursor:pointer' onclick=\"G.gotoAct('"+r.act+"')\">открыть этот акт заново</span> "+
    "<span style='font-size:11px;color:var(--faint)'>ресурсы сохранятся как есть</span></div>";
  return h;
}
function reviewRows(){
  return DECISIONS.map(function(d){ return { d:d, ev:decisionOf(d.scene), act:sceneActId(d.scene) }; });
}
/* карточки разбора по этапам: что сделал / что важно понять / что не получилось */
function reviewActCards(rows, links){
  var qcol = { good:"var(--ok)", weak:"var(--warn)", bad:"var(--bad)" };
  /* исходы натурных испытаний (акт a8) - из лога протокола */
  var ntFired = [], ntClean = null;
  S.log.forEach(function(e){
    if(e.type==="ntest" && e.fired) ntFired.push(e.step);
    if(e.type==="ntestDone") ntClean = e.clean;
  });
  var html = "";
  ACTS.forEach(function(a){
    if(a.id==="end" || a.id==="p") return;
    var ds = []; rows.forEach(function(r,k){ if(r.act===a.id && r.ev) ds.push({ r:r, k:k }); });
    var isNt = (a.id==="a8" && ntClean!=null);
    if(!ds.length && !isNt) return;  // этап не сыгран - не показываем
    /* что сделал */
    var doneHtml = ds.map(function(d){
      var col = qcol[d.r.ev.q]||"var(--acc2)";
      return "<li><span class='revdotmini' style='background:"+col+"'></span>"+esc(d.r.d.t)+": <b>"+esc(stripEmoji(d.r.ev.opt))+"</b></li>";
    }).join("");
    if(isNt) doneHtml += "<li><span class='revdotmini' style='background:"+(ntClean?"var(--ok)":"var(--warn)")+"'></span>Протокол натурных испытаний: <b>"+(ntClean?"попадание с первого раза":"пройден с доработками")+"</b></li>";
    /* что не получилось */
    var fails = [];
    ds.forEach(function(d){
      if(d.r.ev.q==="weak" || d.r.ev.q==="bad"){
        var refl = d.r.d.refl[d.r.ev.q];
        fails.push(refl || (d.r.d.t+" - спорное решение"));
      }
      (links[d.k]||[]).forEach(function(f){ fails.push("Не исправлено: "+f.text); });
    });
    if(isNt && !ntClean) ntFired.forEach(function(si){
      var st = NTEST.steps[si];
      if(st) fails.push("На натурных выстрелило: "+st.t.toLowerCase()+".");
    });
    html += "<div class='revact'>"+
      "<div class='revact-t'>"+esc(a.t)+"</div>"+
      "<div class='revact-row'><span class='revact-lbl'>Сделано</span><ul>"+doneHtml+"</ul></div>"+
      "<div class='revact-row'><span class='revact-lbl'>Главное на этапе</span><div class='revact-lesson'>"+esc(REVIEW_LESSONS[a.id]||"")+"</div></div>"+
      "<div class='revact-row'><span class='revact-lbl'>"+(fails.length?"Что не получилось":"Итог")+"</span>"+
        (fails.length
          ? "<ul class='revact-fails'>"+fails.map(function(f){ return "<li>"+esc(f)+"</li>"; }).join("")+"</ul>"
          : "<div class='revact-clean'>Этап пройден чисто - провалов нет.</div>")+
      "</div></div>";
  });
  return html;
}
function renderReview(sc){
  var rows = reviewRows(), links = deferLinks();
  var sel = (S.ui.rsel!=null) ? S.ui.rsel : null;
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div style='padding:0 18px'>"+reviewMapSvg(rows, links, sel)+"</div>";
  html += "<div class='revpanel' id='revpanel'>"+reviewPanelHtml(rows, links, sel)+"</div>";
  html += "<div class='need'>Принцип платформы с ядром SPDM: к любой развилке можно вернуться ТОЧЕЧНО - изменились условия, меняется одно решение и его связи, а не весь проект. Нажмите узел на карте: исправление - кнопкой прямо в панели разбора (дублируется на вкладке «Акты»). Ниже - краткий разбор по этапам.</div>";
  html += "<div class='revacts'>"+reviewActCards(rows, links)+"</div>";
  shell(sc, html, nextBtnHtml("К эпилогу", true));
}

/* ---------- fdash: итоговый дашборд проекта (финал) ---------- */
function projRank(){
  var r = S.res;
  /* адекватность - главное; доверие - второе; уложился в срок с запасом - бонус */
  var timing = r.weeks<=45 ? 20 : (r.weeks<=52 ? 10 : 0);
  var score = Math.round(r.adeq*0.5 + r.trust*0.3 + timing);
  if(score>100) score = 100;
  var rank = score>=85 ? "Главный конструктор" : score>=70 ? "Ведущий инженер" : score>=55 ? "Инженер проекта" : "Менеджер презентаций";
  return { score:score, rank:rank };
}
function renderFdash(sc){
  var r = S.res;
  var tests = 0; S.log.forEach(function(e){ if(e.type==="camp" && e.tests) tests = e.tests; });
  var lost = !!S.flags.sampleLost;
  var incGood = S.log.some(function(e){ return e.type==="choice" && e.scene==="a10inc" && e.q==="good"; });
  var pr = projRank();
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='sumrow'>"+
    "<div class='sumcell'>Срок проекта<b>"+r.weeks+" из 52 недель</b></div>"+
    "<div class='sumcell'>Остаток бюджета<b>"+r.budget+" млн руб</b></div>"+
    "<div class='sumcell'>Адекватность двойника<b>"+r.adeq+"%</b></div>"+
    "<div class='sumcell'>Доверие заказчика<b>"+r.trust+"</b></div></div>";
  html += "<div class='sumrow'>"+
    "<div class='sumcell'>Виртуальных испытаний<b>"+(tests?tests.toLocaleString("ru-RU"):"тысячи")+"</b></div>"+
    "<div class='sumcell'>Опытных образцов<b>"+(lost?"2 из 2 (один потерян)":"1 из 2")+"</b></div>"+
    "<div class='sumcell'>Раньше уходило<b>до 10 образцов</b></div>"+
    "<div class='sumcell'>Инцидент в небе<b>"+(incGood?"предотвращен":"стоил денег")+"</b></div></div>";
  html += "<div class='award'><div class='ic'>📊</div><div><div class='t'>Готовность к защите: "+pr.score+" из 100</div>"+
    "<div class='d'>Сводный итог решений за весь проект: адекватность двойника, доверие заказчика, срок и бюджет. "+
    (lost?"Потеря образца №1 и авральные доработки - в этих цифрах тоже.":"Натурные испытания подтвердили расчет - в этих цифрах виден чистый путь.")+"</div></div></div>";
  shell(sc, html, nextBtnHtml("К защите", true));
}

/* ---------- essay: защита проекта с термин-метром (финал) ---------- */
function essayEval(t){
  var hits = ESSAY.need.filter(function(g){ return g.re.test(t); });
  var words = (t.match(/[а-яёa-z0-9]+/gi)||[]).length;
  /* связность: рассказ, а не перечень терминов */
  var sents = t.split(/[.!?…]+/).map(function(s){ return (s.match(/[а-яёa-z0-9]+/gi)||[]).length; }).filter(function(n){ return n>=3; });
  var avg = sents.length ? sents.reduce(function(a,b){return a+b;},0)/sents.length : 0;
  var vm = t.match(ESSAY.verbRe)||[];
  var vroots = {}; vm.forEach(function(v){ vroots[v.slice(0,5).toLowerCase()]=1; });
  var verbs = Object.keys(vroots).length;
  var coherent = sents.length>=ESSAY.minSent && verbs>=ESSAY.minVerbs && avg>=6 && avg<=40;
  return { hits:hits, words:words, sents:sents.length, verbs:verbs, avg:avg, coherent:coherent };
}
function renderEssay(sc){
  var st = S.ui.es || (S.ui.es = { text:"", done:false, score:0 });
  var ev = essayEval(st.text);
  var html = "<div class='task'>"+sub(sc.task)+"</div>";
  html += "<div class='need'>"+esc(ESSAY.prompt)+"</div>";
  html += "<div class='essaywrap'>";
  html += "<div><textarea id='esstext' class='essaybox' rows='9' "+(st.done?"disabled":"")+" oninput='G.essayInput(this.value)' placeholder='Ваше выступление...'>"+esc(st.text)+"</textarea>"+
    "<div class='mxstatus' id='essstat'>"+essStatHtml(ev)+"</div></div>";
  html += "<div class='essameter' id='essmeter'>"+essMeterHtml(ev)+"</div>";
  html += "</div>";
  html += "<div class='verdict' id='verdict'></div>";
  if(st.done){
    var pct = Math.round(ev.hits.length/ESSAY.need.length*100);
    html += "<div class='verdict show "+(pct>=80?"good":(pct>=50?"weak":"bad"))+"'><b>Совет корпорации:</b> "+
      (pct>=80 ? "аплодисменты. Заказчик шепнул директору: «Вот за это я и платил». Владение терминами - "+pct+"%: инженер двойника состоялся."
       : pct>=50 ? "сдержанные кивки. Путь рассказан, но часть инструментов осталась за кадром (термин-метр подскажет, какие). Владение - "+pct+"%."
       : "вежливая тишина. Рассказ получился общим - термины курса почти не прозвучали ("+pct+"%). Гарин записал тему для разговора.")+
      " Текст выступления сохранен в отчете для преподавателя.</div>";
  }
  html += "<div class='hint' id='hintbox'><b>Гарин:</b> "+esc(sc.hint||"")+"</div>";
  var canSubmit = !st.done && ev.words>=ESSAY.minWords && ev.hits.length>=ESSAY.minHits;
  var foot = st.done
    ? nextBtnHtml("Продолжить", true)
    : hintBtnHtml() + "<button class='nextbtn"+(canSubmit?" ready":"")+"' id='nextbtn' onclick='G.essaySubmit()'>🎤 Выступить</button>";
  shell(sc, html, foot);
}
function essStatHtml(ev){
  return "Слов: <b>"+ev.words+"</b> (от "+ESSAY.minWords+") · терминов: <b>"+ev.hits.length+"</b> из "+ESSAY.need.length+" (от "+ESSAY.minHits+")"+
    " · предложений: <b>"+ev.sents+"</b> (от "+ESSAY.minSent+") · глаголов действия: <b>"+ev.verbs+"</b> (от "+ESSAY.minVerbs+")";
}
function essMeterHtml(ev){
  var keys = ev.hits.map(function(g){ return g.k; });
  return "<h5 style='font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px'>Термин-метр</h5>" +
    ESSAY.need.map(function(g){
      var on = keys.indexOf(g.k)>=0;
      return "<div class='essitem"+(on?" on":"")+"'>"+(on?"✅":"⬜")+" "+esc(g.label)+"</div>";
    }).join("");
}
function essayInput(v){
  var st = S.ui.es;
  if(st.done) return;
  st.text = v;
  var ev = essayEval(v);
  el("essmeter").innerHTML = essMeterHtml(ev);
  el("essstat").innerHTML = essStatHtml(ev);
  var btn = el("nextbtn");
  if(btn){
    if(ev.words>=ESSAY.minWords && ev.hits.length>=ESSAY.minHits) btn.classList.add("ready");
    else btn.classList.remove("ready");
  }
  save();
}
function essaySubmit(){
  var sc = STORY.scenes[S.scene], st = S.ui.es;
  var ev = essayEval(st.text);
  if(st.done || ev.words<ESSAY.minWords || ev.hits.length<ESSAY.minHits) return;
  if(!ev.coherent){
    /* термины есть, рассказа нет - совет не принимает перечень терминов */
    var v = el("verdict");
    v.className = "verdict show bad";
    v.innerHTML = "<b>Совет корпорации:</b> простите, но это прозвучало как словарь, а не как защита. Нужен связный РАССКАЗ: "+
      (ev.sents<ESSAY.minSent ? "полных предложений - "+ev.sents+" (нужно от "+ESSAY.minSent+"); " : "")+
      (ev.verbs<ESSAY.minVerbs ? "глаголов действия - "+ev.verbs+" (нужно от "+ESSAY.minVerbs+": что вы ДЕЛАЛИ - построили, проверили, испытали...); " : "")+
      (ev.avg>40 ? "предложения слишком длинные - расставьте точки; " : "")+
      "перепишите и выступите снова.";
    logEv("essayReject", { words:ev.words, sents:ev.sents, verbs:ev.verbs });
    return;
  }
  st.done = true;
  var pct = Math.round(ev.hits.length/ESSAY.need.length*100);
  st.score = pct;
  applyFx(pct>=80 ? {trust:6, adeq:5} : (pct>=50 ? {trust:3, adeq:3} : {trust:0}));
  logEv("essay", { text:st.text, words:ev.words, hits:ev.hits.length, pct:pct, hint:!!S.ui.hintUsed });
  save(); renderEssay(sc); renderTop(sc);
}

/* ---------- result: итог акта ---------- */
function renderResult(sc){
  var a = null; ARTS.forEach(function(x){ if(x.id===sc.award.art) a=x; });
  var html = "<div class='award'><div class='ic'>"+a.ic+"</div><div><div class='t'>"+esc(a.t)+"</div>"+
    "<div class='d'>"+esc(sc.award.d)+"</div></div></div>";
  html += "<div class='dialog'>" + sc.lines.map(function(l){ return say(l.who,l.t); }).join("") + "</div>";
  shell(sc, html, nextBtnHtml("Дальше", true));
}

/* ---------- end: эпилог / конец доступного контента ---------- */
function renderEnd(sc){
  var r = S.res;
  var qs = { good:0, weak:0, bad:0 };
  S.log.forEach(function(e){ if(e.type==="choice" && qs[e.q]!=null) qs[e.q]++; });
  var html;
  if(sc.final){
    var pr = projRank();
    html = "<div class='task'><b>"+esc(sc.title)+".</b> Это полная версия сюжета - спасибо за прохождение! Все решения и текст защиты сохранены в логе для преподавателя.</div>";
    html += "<div class='award'><div class='ic'>🏆</div><div><div class='t'>Звание: "+esc(pr.rank)+"</div>"+
      "<div class='d'>Итоговый балл проекта: "+pr.score+" из 100 - сводный итог адекватности двойника, доверия заказчика, срока и бюджета.</div></div></div>";
  } else {
    html = "<div class='task'><b>"+esc(sc.title)+".</b> Спасибо! Главы из списка «Что дальше по сюжету» еще НЕ разработаны - они появятся с обновлениями игры, а ваш прогресс сохранится и продолжится с нового места.</div>";
  }
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
  if(sc.coming && sc.coming.length){
    html += "<div class='sumlist'><b style='color:var(--txt)'>Что дальше по сюжету:</b><ul>"+
      sc.coming.map(function(c){ return "<li>"+esc(c)+"</li>"; }).join("")+"</ul></div>";
  }
  var endFoot = "<button class='btn ghost' onclick='G.restartConfirm()'>Пройти заново</button>" +
    "<button class='btn ghost' onclick='G.report()'>📥 Отчет для преподавателя</button>" +
    (sc.final ? "<button class='btn ghost' onclick=\"G.gotoScene('finReview')\">🌳 Разбор решений</button>" : "");
  shell(sc, html, endFoot);
}

/* ---------- одноразовая вводная: что значат ресурсы и от чего зависит итог ---------- */
function showResIntro(){
  if(document.querySelector(".introlayer")) return;
  var ov = document.createElement("div");
  ov.className = "introlayer";
  ov.innerHTML = "<div class='introcard'>"+
    "<h2>Как устроена игра</h2>"+
    "<p>Вы - руководитель проекта. Шаг за шагом вы строите цифровой двойник двигателя и принимаете решения. У решений есть последствия: они меняют пять показателей проекта (вверху экрана). Решения необратимы - думайте, прежде чем принять.</p>"+
    "<div class='introres'>"+
      "<div><b>Недели</b><span>Время: всего 52 до сдачи. Переделки съедают недели.</span></div>"+
      "<div><b>Бюджет</b><span>Деньги, млн руб: лицензии, мощности, испытания.</span></div>"+
      "<div><b>Ядро-часы</b><span>Ресурс на расчёты и виртуальные испытания.</span></div>"+
      "<div><b>Доверие</b><span>Доверие директора и заказчика. Растёт от обоснованных решений.</span></div>"+
      "<div><b>Адекватность</b><span>Насколько двойник соответствует реальности - главный показатель качества.</span></div>"+
    "</div>"+
    "<p class='introsum'>Итог проекта и ваше звание = <b>адекватность двойника</b> + <b>доверие заказчика</b> + уложились ли в <b>срок</b>. Подсказку по любому показателю можно увидеть, наведя на него курсор.</p>"+
    "<button class='nextbtn ready' id='introgo'>Начать проект →</button>"+
  "</div>";
  document.body.appendChild(ov);
  var go = document.getElementById("introgo");
  if(go) go.onclick = function(){ ov.remove(); };
}

/* ---------- роутер ---------- */
function render(){
  var sc = STORY.scenes[S.scene];
  touchAct();
  renderTop(sc); renderSide();
  if(sc.type==="dialog") renderDialog(sc);
  else if(sc.type==="choice") renderChoice(sc);
  else if(sc.type==="talks") renderTalks(sc);
  else if(sc.type==="matrix") renderMatrix(sc);
  else if(sc.type==="reqfill") renderReqfill(sc);
  else if(sc.type==="cases") renderCases(sc);
  else if(sc.type==="tree") renderTree(sc);
  else if(sc.type==="camp") renderCamp(sc);
  else if(sc.type==="ntest") renderNtest(sc);
  else if(sc.type==="sens") renderSens(sc);
  else if(sc.type==="fdash") renderFdash(sc);
  else if(sc.type==="essay") renderEssay(sc);
  else if(sc.type==="review") renderReview(sc);
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
  if(nsc.clearDefer){ removeDefers(nsc.clearDefer); }
  if(nsc.type==="result" && nsc.award){ applyFx({art:nsc.award.art}); }
  logEv("enter",{});
  /* финал пройден - отчет уходит преподавателю сам, без действий игрока */
  if(nsc.type==="end" && nsc.final && !S.reportSent){
    S.reportSent = !!sendReport("финал");
  }
  save(); render();
}
/* страховка: при закрытии/сворачивании страницы отчет уходит маяком
   (sendBeacon) с текущим прогрессом - даже если игрок не дошел до финала */
var _exitSent = false;
function sendOnExit(){
  if(_exitSent) return;
  if(S && S.log && S.log.length && analyticsOn()){ _exitSent = true; sendReport("выход", true); }
}
window.addEventListener("pagehide", sendOnExit);
window.addEventListener("beforeunload", sendOnExit);

/* ---------- публичный интерфейс ---------- */
return {
  init: function(){
    /* сохраненная игра может быть по другому изделию - привязываем
       его ДО load(), который уже читает STORY выбранного продукта */
    var pre=null; try{ var raw=localStorage.getItem(SAVE_KEY); if(raw) pre=JSON.parse(raw); }catch(e){}
    bindProduct(pre && pre.izd ? pre.izd : "gtd");
    var saved = load();
    if(saved){
      S = saved;
      el("login-new").classList.add("hidden");
      el("login-cont").classList.remove("hidden");
      el("contbtn").textContent = "Продолжить · "+S.name+" · "+izdLabel();
    } else {
      bindProduct("gtd");   // для нового проекта - изделие по умолчанию
    }
    el("login").classList.remove("hidden");
  },
  pickIzd: function(elOpt){
    document.querySelectorAll(".izdopt").forEach(function(o){ o.classList.remove("on"); });
    elOpt.classList.add("on");
    bindProduct(elOpt.getAttribute("data-izd") || "gtd");
    var lab = el("login-izd"); if(lab) lab.innerHTML = "Изделие: <b>"+esc(izdLabel())+"</b> · полный сюжет: пролог + 11 актов + финал";
  },
  start: function(){
    var name = el("pname").value.trim() || "Инженер";
    var pick = document.querySelector(".izdopt.on");
    bindProduct(pick ? (pick.getAttribute("data-izd")||"gtd") : IZD);
    S = freshState(name);
    logEv("start",{name:name, izd:IZD});
    save();
    el("login").classList.add("hidden");
    el("game").classList.remove("hidden");
    render();
    showResIntro();   // одноразовая вводная только для новой игры
  },
  cont: function(){
    bindProduct(S && S.izd ? S.izd : "gtd");
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
    else if(sc.type==="choice"){
      if(!pickState) return;
      if(!pickState.committed){
        if(pickState.opt==null) return;
        if(!sc.noJust && pickState.just==null) return;
        commitChoice(sc);          // первый клик кнопки - принять решение, показать последствие
      } else { goNext(sc); }       // второй клик - дальше
    }
    else if(sc.type==="talks"){ if((S.ui.visited||[]).length>=sc.min){ logEv("talksDone",{n:S.ui.visited.length}); goNext(sc); } }
    else if(sc.type==="matrix") confirmMatrix(sc);
    else if(sc.type==="reqfill") confirmReqfill(sc);
    else if(sc.type==="cases"){ if(S.ui.cs && S.ui.cs.checked) confirmCases(sc); }
    else if(sc.type==="tree") confirmTree(sc);
    else if(sc.type==="camp"){ if(S.ui.cp && S.ui.cp.done) goNext(sc); }
    else if(sc.type==="ntest") ntestStep(sc);
    else if(sc.type==="sens"){ if(S.ui.sn && S.ui.sn.done) goNext(sc); }
    else if(sc.type==="fdash") goNext(sc);
    else if(sc.type==="essay"){ if(S.ui.es && S.ui.es.done) goNext(sc); }
    else if(sc.type==="review") goNext(sc);
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
  reviewNode: function(k){
    S.ui.rsel = k; save();
    /* панель и подсветка обновляются точечно - прокрутка карты не сбрасывается */
    var p = el("revpanel");
    if(p) p.innerHTML = reviewPanelHtml(reviewRows(), deferLinks(), k);
    document.querySelectorAll(".revdot").forEach(function(g){ g.classList.remove("sel"); });
    var g = el("revdot"+k); if(g) g.classList.add("sel");
  },
  pick: pick, just: just, talk: talk, slide: slide, reqOpen: reqOpen,
  caseRead: caseRead, casePick: casePick, casesCheck: casesCheck,
  treeNode: treeNode, diagAct: diagAct, diagConclude: diagConclude, validPick: validPick,
  campSel: campSel, campLaunch: campLaunch,
  sensPick: sensPick, sensLaunch: sensLaunch,
  essayInput: essayInput, essaySubmit: essaySubmit,
  redoFix: function(i){
    var d = S.defers[i]; if(d==null) return;
    var fix = null;
    REDO.forEach(function(rd){ if(!fix && d.indexOf(rd.match)>=0) fix = rd; });
    if(!fix) return;
    if(!confirm("Пересмотреть решение: "+fix.t+"?\nЦена: "+([(fix.cost.budget?(-fix.cost.budget)+" млн":""),(fix.cost.weeks?fix.cost.weeks+" нед":"")].filter(Boolean).join(" + ")||"бесплатно"))) return;
    applyFx(fix.cost); applyFx(fix.fx);
    S.defers.splice(i,1);
    logEv("redo",{ defer:d, fix:fix.t });
    save();
    var sc = STORY.scenes[S.scene];
    renderTop(sc); renderSide();
    /* если исправляли с карты разбора - перерисовать карту (узел ⚠ гаснет) */
    if(sc.type==="review") renderReview(sc);
  },
  report: function(){
    sendReport("кнопка");  // дублируем в форму преподавателя, если отправка настроена
    var rep = makeReport("кнопка");
    var blob = new Blob([JSON.stringify(rep, null, 2)], {type:"application/json"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "put-dvoinika-otchet-"+(S.name||"player").replace(/[^a-zа-яё0-9]/gi,"_")+".json";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  gotoScene: function(id){ if(STORY.scenes[id]){ S.ui={}; S.scene=id; save(); render(); } },
  gotoAct: function(id){
    var i = actIdx(id);
    if(i<0 || i>actIdx(S.maxActId||"p")) return;
    S.ui = {}; S.scene = ACTS[i].entry;
    logEv("gotoAct",{act:id});
    save(); render();
  },
  _state: function(){ return S; }  // для отладки
};
})();

G.init();
