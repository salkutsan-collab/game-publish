/* ============================================================
   Сборка актов SE-трека (нефтегаз) в набор se_oilgas. Универсально и
   идемпотентно: вмерживает window.__SE.scenes в STORY, регистрирует все
   деревья, связывает присутствующие акты по цепочке пролог->a1->a2->a3->a4->fin,
   обновляет карту актов и эпилог. Запускается ПОСЛЕ всех _se_parts/*.js.
   ============================================================ */
(function(){
  var d = window.GAMEDATA && window.GAMEDATA.se_oilgas; if(!d) return;
  var SE = window.__SE || { scenes:{}, data:{} };
  var sc = d.STORY.scenes;

  /* 1) сцены актов -> в сюжет */
  for(var k in SE.scenes){ sc[k] = SE.scenes[k]; }

  /* 2) деревья: у сцены type=tree конфиг лежит в treeData -> TREES[scene.tree];
        у Добычи данные могли уйти в __SE.data.A2TREE */
  d.TREES = d.TREES || {};
  Object.keys(sc).forEach(function(id){
    var s = sc[id];
    if(s && s.type==="tree" && s.tree){
      if(s.treeData) d.TREES[s.tree] = s.treeData;                 /* конфиг на сцене (a1se, fin) */
      else { var key = s.tree.toUpperCase()+"TREE";                /* конфиг в __SE.data (A2TREE, A3TREE) */
        if(SE.data && SE.data[key]) d.TREES[s.tree] = SE.data[key]; }
    }
  });

  /* 3) связать присутствующие акты в сквозную цепочку (перезаписываем «хвостовые» next) */
  function link(from, to){ if(sc[from] && sc[to]) sc[from].next = to; }
  link("p3","a1brief");
  link("a1result","a2brief");
  link("a2result","a3brief");
  link("a3result","a4brief");
  link("a4result","finBrief");
  link("finResult","sliceEnd");
  /* если следующего акта еще нет - последний из имеющихся ведет на итог среза */
  [["a2result","a3brief"],["a3result","a4brief"],["a4result","finBrief"]].forEach(function(p){
    if(sc[p[0]] && !sc[p[1]]) sc[p[0]].next = "sliceEnd";
  });

  /* 4) карта актов: вставить присутствующие акты перед «Итогом среза» */
  var meta = [
    { id:"a1",  t:"Акт 1 · Разведка",      entry:"a1brief" },
    { id:"a2",  t:"Акт 2 · Добыча",        entry:"a2brief" },
    { id:"a3",  t:"Акт 3 · Транспорт",     entry:"a3brief" },
    { id:"a4",  t:"Акт 4 · Переработка",   entry:"a4brief" },
    { id:"fin", t:"Финал · Сдача системы", entry:"finBrief" }
  ];
  var have = {}; d.ACTS.forEach(function(a){ have[a.id]=true; });
  var acts = [];
  d.ACTS.forEach(function(a){
    if(a.id==="end"){
      meta.forEach(function(m){ if(!have[m.id] && sc[m.entry]) acts.push(m); });
    }
    acts.push(a);
  });
  d.ACTS = acts;

  /* 5) эпилог: если финал собран - делаем sliceEnd настоящим финалом */
  if(sc.finResult && sc.sliceEnd){
    sc.sliceEnd.final = true;
    sc.sliceEnd.title = "Система сдана: цифровой двойник цепочки разведка-переработка";
    sc.sliceEnd.coming = [];
  }
})();
