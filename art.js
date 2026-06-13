/* ============================================================
   «Путь двойника» - живые сцены локаций (анимированный SVG).
   Вместо плашки-заглушки баннер каждой локации показывает
   стилизованный «кадр жизни»: силуэты людей, экраны с данными,
   мигающие индикаторы. Рисуется кодом, картинки не нужны.
   Анимации - в app.css (классы art-*), уважают prefers-reduced-motion.
   ============================================================ */

var ART = (function(){

/* ---------- общие детали ---------- */

/* силуэт сидящего человека (голова + корпус), цвет темный */
function sit(x, y, scale, sway){
  return "<g transform='translate("+x+","+y+") scale("+(scale||1)+")' class='"+(sway?"art-sway":"")+"'>"+
    "<circle cx='0' cy='-26' r='7.5' fill='#0a111d'/>"+
    "<path d='M -11 6 Q -11 -16 0 -16 Q 11 -16 11 6 Z' fill='#0a111d'/>"+
  "</g>";
}
/* силуэт стоящего человека */
function stand(x, y, scale, sway){
  return "<g transform='translate("+x+","+y+") scale("+(scale||1)+")' class='"+(sway?"art-sway":"")+"'>"+
    "<circle cx='0' cy='-46' r='7.5' fill='#0a111d'/>"+
    "<path d='M -9 0 L -7 -36 Q 0 -40 7 -36 L 9 0 Z' fill='#0a111d'/>"+
  "</g>";
}
/* жестикулирующая рука у стоящего (отдельной группой, качается) */
function arm(x, y){
  return "<g transform='translate("+x+","+y+")' class='art-gesture'>"+
    "<rect x='0' y='-2.6' width='22' height='5.2' rx='2.6' fill='#0a111d'/></g>";
}
/* монитор с бегущим графиком */
function monitor(x, y, w, h, delay){
  var gw = w-10, gh = h-12;
  return "<g transform='translate("+x+","+y+")'>"+
    "<rect x='0' y='0' width='"+w+"' height='"+h+"' rx='3' fill='#0c1626' stroke='var(--line)'/>"+
    "<rect x='3' y='3' width='"+(w-6)+"' height='"+(h-6)+"' rx='2' fill='#0e1f33' class='art-glow' style='animation-delay:"+(delay||0)+"s'/>"+
    "<g clip-path='inset(0)'>"+
      "<polyline points='5,"+(h-8)+" "+(5+gw*0.2)+","+(h-8-gh*0.5)+" "+(5+gw*0.4)+","+(h-8-gh*0.25)+" "+(5+gw*0.6)+","+(h-8-gh*0.8)+" "+(5+gw*0.8)+","+(h-8-gh*0.45)+" "+(5+gw)+","+(h-8-gh*0.7)+"' fill='none' stroke='var(--acc2)' stroke-width='1.6' opacity='.85' class='art-draw' style='animation-delay:"+(delay||0)+"s'/>"+
    "</g>"+
    "<rect x='"+(w/2-6)+"' y='"+h+"' width='12' height='6' fill='#0c1626'/>"+
    "<rect x='"+(w/2-14)+"' y='"+(h+6)+"' width='28' height='3' rx='1.5' fill='#0c1626'/>"+
  "</g>";
}
/* окно с ночным городом: дома + мигающие окна */
function city(x, y, w, h){
  var html = "<g transform='translate("+x+","+y+")'>"+
    "<rect x='0' y='0' width='"+w+"' height='"+h+"' rx='4' fill='#0a1322' stroke='var(--line)'/>";
  var bx = 8;
  var i = 0;
  while(bx < w-20){
    var bw = 14 + (i%3)*6, bh = 24 + ((i*7)%34);
    html += "<rect x='"+bx+"' y='"+(h-bh-4)+"' width='"+bw+"' height='"+bh+"' fill='#101d31'/>";
    for(var r=0; r<3; r++){
      var wx = bx+3+(r%2)*6, wy = h-bh-4+5+r*8;
      if(wy < h-9) html += "<rect x='"+wx+"' y='"+wy+"' width='3.4' height='3.4' fill='var(--warn)' opacity='.5' class='art-flicker' style='animation-delay:"+((i*1.7+r*2.3)%6).toFixed(1)+"s'/>";
    }
    bx += bw + 7; i++;
  }
  return html + "<rect x='0' y='0' width='"+w+"' height='"+h+"' rx='4' fill='none' stroke='var(--line)'/></g>";
}
/* потолочный светильник с конусом света */
function lamp(x, w, flicker){
  return "<g"+(flicker?" class='art-lampflicker'":"")+">"+
    "<rect x='"+(x-w/2)+"' y='6' width='"+w+"' height='4' rx='2' fill='var(--acc2)' opacity='.5'/>"+
    "<path d='M "+(x-w/2)+" 10 L "+(x-w*1.4)+" 170 L "+(x+w*1.4)+" 170 L "+(x+w/2)+" 10 Z' fill='var(--acc2)' opacity='.045'/>"+
  "</g>";
}
function floor(){ return "<rect x='0' y='150' width='800' height='20' fill='#0a111d' opacity='.55'/>"; }
function wrap(inner){
  return "<svg class='artsvg' viewBox='0 0 800 170' preserveAspectRatio='xMidYMid slice' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>"+inner+"</svg>";
}

/* ---------- мотив изделия (продукто-зависимый) ----------
   gtd рисуется прежним кодом в каждой локации; для uav подставляется
   «Снегирь»: летающее крыло с 4 моторами (2 носовых убираемых, 2 хвостовых
   поворотных). Флаг изделия выставляет engine.bindProduct -> window.GAME_IZD. */
function IZ(){ return window.GAME_IZD || 'gtd'; }
function isUav(){ return IZ()==='uav'; }
/* воздушный винт - вращающийся */
function prop(x,y,delay,wire){
  var col = wire ? "none" : "var(--acc2)";
  var st  = wire ? " stroke='var(--acc2)' stroke-width='1' stroke-dasharray='3 3'" : "";
  return "<g transform='translate("+x+","+y+")'><g class='art-rotate' style='animation-delay:"+(delay||0)+"s'>"+
    "<rect x='-1' y='-7' width='2' height='14' rx='1' fill='"+col+"'"+st+" opacity='.85'/>"+
    "<rect x='-7' y='-1' width='14' height='2' rx='1' fill='"+col+"'"+st+" opacity='.85'/></g>"+
    "<circle r='2.1' fill='"+(wire?"none":"var(--acc)")+"'"+(wire?" stroke='var(--acc)'":"")+"/></g>";
}
/* летающее крыло «Снегирь» (вид сверху), нос вверх, 4 мотора. cx,cy - центр; sc - масштаб */
function craft(cx,cy,sc,wire){
  sc = sc||1;
  var fill = wire ? "none" : "#101d31";
  var dash = wire ? " stroke-dasharray='5 4'" : "";
  return "<g transform='translate("+cx+","+cy+") scale("+sc+")'>"+
    "<path d='M 0 -26 Q 34 -17 80 8 Q 58 12 40 11 Q 14 10 0 14 Q -14 10 -40 11 Q -58 12 -80 8 Q -34 -17 0 -26 Z' fill='"+fill+"' stroke='var(--acc2)' stroke-opacity='.6'"+dash+"/>"+
    "<ellipse cx='0' cy='-4' rx='9' ry='12' fill='"+(wire?"none":"#16263e")+"' stroke='var(--acc2)' stroke-opacity='.5'"+dash+"/>"+
    prop(-21,-7,0,wire) + prop(21,-7,.5,wire) +        /* носовые (убираемые в корпус) */
    prop(-58,7,.8,wire) + prop(58,7,1.1,wire) +        /* хвостовые поворотные */
  "</g>";
}
/* секция крыла (профиль) для испытаний на флаттер/аэроупругость */
function wingSec(){
  return "<path d='M -34 0 Q -10 -10 20 -6 Q 34 -4.5 34 -1.5 Q 34 1.5 20 3 Q -10 5 -34 0 Z' fill='var(--acc2)' opacity='.82'/>";
}

/* ---------- локации ---------- */

/* Кабинет директора: стол переговоров, экран со слайдами, окно-город */
function director(){
  var slideA = "<g class='art-slideA'>"+
      "<text x='30' y='26' font-size='13' fill='var(--acc)' font-family='Segoe UI' font-weight='700'>ЦД?</text>"+
      "<rect x='14' y='34' width='34' height='5' rx='2' fill='var(--acc2)' opacity='.6'/>"+
      "<rect x='14' y='44' width='52' height='5' rx='2' fill='var(--acc2)' opacity='.35'/>"+
      "<rect x='14' y='54' width='44' height='5' rx='2' fill='var(--acc2)' opacity='.35'/></g>";
  var slideB = "<g class='art-slideB'>"+
      "<rect x='14' y='16' width='14' height='44' rx='2' fill='var(--acc2)' opacity='.4'/>"+
      "<rect x='32' y='28' width='14' height='32' rx='2' fill='var(--acc)' opacity='.55'/>"+
      "<rect x='50' y='22' width='14' height='38' rx='2' fill='var(--acc2)' opacity='.5'/></g>";
  return wrap(
    lamp(190, 60, false) +
    city(520, 26, 240, 104) +
    /* настенный экран со сменой слайдов */
    "<g transform='translate(60,38)'><rect x='0' y='0' width='86' height='70' rx='4' fill='#0c1626' stroke='var(--line)'/>"+ slideA + slideB +"</g>"+
    /* стол */
    "<rect x='180' y='118' width='260' height='9' rx='4' fill='#152238'/>"+
    "<rect x='196' y='127' width='10' height='28' fill='#101b2d'/><rect x='414' y='127' width='10' height='28' fill='#101b2d'/>"+
    /* люди: директор и заказчик сидят, игрок стоит */
    sit(232, 118, 1.05, true) + sit(305, 118, 1.0, false) + stand(452, 152, 1.05, true) +
    "<ellipse cx='310' cy='112' rx='9' ry='2.6' fill='var(--acc2)' opacity='.25'/>"+ /* папка контракта на столе */
    floor()
  );
}

/* Коридор заводоуправления: перспектива, лампы (одна мигает), идущий силуэт */
function corridor(){
  var doors = "";
  var xs = [70, 190, 310, 430];
  for(var i=0;i<xs.length;i++){
    doors += "<rect x='"+xs[i]+"' y='52' width='44' height='98' rx='2' fill='#0e1a2c' stroke='var(--line)'/>"+
      "<circle cx='"+(xs[i]+36)+"' cy='104' r='2' fill='var(--acc2)' opacity='.6'/>";
  }
  return wrap(
    "<line x1='0' y1='150' x2='800' y2='150' stroke='var(--line)'/>"+
    doors +
    "<rect x='560' y='60' width='120' height='52' rx='3' fill='#0c1626' stroke='var(--line)'/>"+
    "<text x='575' y='82' font-size='11' fill='var(--dim)' font-family='Segoe UI'>ФАБРИКА</text>"+
    "<text x='575' y='98' font-size='11' fill='var(--acc)' font-family='Segoe UI'>ЦИФРОВЫХ ДВОЙНИКОВ</text>"+
    lamp(140, 48, false) + lamp(390, 48, true) + lamp(640, 48, false) +
    "<g class='art-walk'>"+ stand(0, 152, 1.1, false) +"</g>"+
    floor()
  );
}

/* Инженерный зал: ряд мониторов с графиками, большой экран с турбиной, стойка с огоньками */
function hall(){
  /* большой экран: контур двигателя + вращающийся вентилятор + бегущий поток */
  var big = "<g transform='translate(540,30)'>"+
    "<rect x='0' y='0' width='220' height='104' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
    (isUav()
      ? craft(58,60,1.02,false)
      : "<g transform='translate(58,52)'>"+
        "<g class='art-rotate'>"+
          (function(){ var b=""; for(var k=0;k<8;k++){ b+="<rect x='-1.8' y='-30' width='3.6' height='26' rx='1.8' fill='var(--acc2)' opacity='.8' transform='rotate("+(k*45)+")'/>"; } return b; })() +
        "<circle cx='0' cy='0' r='6' fill='var(--acc)'/></g>"+
        "<circle cx='0' cy='0' r='33' fill='none' stroke='var(--acc2)' stroke-width='1.4' opacity='.6'/>"+
      "</g>") +
    "<path d='M 100 30 H 196 M 100 52 H 196 M 100 74 H 196' stroke='var(--acc2)' stroke-width='1.6' opacity='.55' stroke-dasharray='7 9' class='art-flow'/>"+
    "<text x='104' y='22' font-size='10' fill='var(--dim)' font-family='Segoe UI'>"+(isUav()?"обдув крыла · крейсер":"поток · режим взлет")+"</text>"+
  "</g>";
  /* серверная стойка */
  var rack = "<g transform='translate(20,58)'><rect x='0' y='0' width='34' height='92' rx='3' fill='#0e1a2c' stroke='var(--line)'/>"+
    (function(){ var s=""; for(var k=0;k<6;k++){ s+="<rect x='5' y='"+(7+k*14)+"' width='24' height='8' rx='2' fill='#101d31'/>"+
      "<circle cx='25' cy='"+(11+k*14)+"' r='1.8' fill='var(--ok)' class='art-flicker' style='animation-delay:"+(k*0.9)+"s'/>"; } return s; })() +"</g>";
  return wrap(
    lamp(260, 56, false) + lamp(560, 56, false) +
    rack + big +
    monitor(120, 78, 70, 46, 0) + monitor(230, 78, 70, 46, 1.1) + monitor(340, 78, 70, 46, 2.2) +
    sit(155, 152, 1.0, true) + sit(265, 152, 1.0, false) + sit(375, 152, 1.0, true) +
    floor()
  );
}

/* Переговорная / планерка: стол, четверо, проектор с матрицей-таблицей */
function meeting(){
  /* экран с таблицей-матрицей: ячейки переключаются зеленый/красный */
  var cells = "";
  for(var r=0;r<3;r++) for(var c=0;c<4;c++){
    var d = ((r*4+c)*1.3)%7;
    cells += "<rect x='"+(12+c*26)+"' y='"+(16+r*20)+"' width='22' height='16' rx='2' class='art-cell' style='animation-delay:"+d.toFixed(1)+"s'/>";
  }
  return wrap(
    lamp(400, 70, false) +
    "<g transform='translate(330,26)'><rect x='0' y='0' width='120' height='80' rx='4' fill='#0c1626' stroke='var(--line)'/>"+
    "<text x='12' y='12' font-size='8.5' fill='var(--dim)' font-family='Segoe UI'>МАТРИЦА ТРЕБОВАНИЙ</text>"+ cells +"</g>"+
    /* луч проектора */
    "<path d='M 600 58 L 452 40 L 452 92 Z' fill='var(--acc2)' opacity='.05' class='art-beam'/>"+
    "<rect x='598' y='52' width='22' height='13' rx='3' fill='#0e1a2c' stroke='var(--line)'/>"+
    /* стол и люди */
    "<rect x='130' y='124' width='420' height='9' rx='4' fill='#152238'/>"+
    "<rect x='150' y='133' width='10' height='22' fill='#101b2d'/><rect x='520' y='133' width='10' height='22' fill='#101b2d'/>"+
    sit(180, 124, 1.0, true) + sit(255, 124, 1.0, false) + sit(420, 124, 1.0, true) + sit(495, 124, 1.0, false) +
    stand(620, 154, 1.05, false) + arm(628, 116) +
    floor()
  );
}

/* Кабинет руководителя проекта: стол, монитор с документом и курсором, кофе с паром, окно */
function office(){
  var doc = "<g transform='translate(300,52)'>"+
    "<rect x='0' y='0' width='96' height='64' rx='4' fill='#0c1626' stroke='var(--line)'/>"+
    "<rect x='8' y='9' width='56' height='4' rx='2' fill='var(--acc)' opacity='.7'/>"+
    "<rect x='8' y='19' width='78' height='3.4' rx='1.7' fill='var(--acc2)' opacity='.4'/>"+
    "<rect x='8' y='27' width='70' height='3.4' rx='1.7' fill='var(--acc2)' opacity='.4'/>"+
    "<rect x='8' y='35' width='80' height='3.4' rx='1.7' fill='var(--acc2)' opacity='.4'/>"+
    "<rect x='8' y='43' width='40' height='3.4' rx='1.7' fill='var(--acc2)' opacity='.4'/>"+
    "<rect x='50' y='41.6' width='1.8' height='7' fill='var(--acc)' class='art-cursor'/>"+
    "<rect x='42' y='64' width='12' height='7' fill='#0c1626'/><rect x='32' y='71' width='32' height='3' rx='1.5' fill='#0c1626'/>"+
  "</g>";
  var coffee = "<g transform='translate(430,108)'>"+
    "<path d='M 0 0 h 16 l -2 14 h -12 Z' fill='#152238' stroke='var(--line)' stroke-width='.8'/>"+
    "<path d='M 16 3 q 7 2 0 7' fill='none' stroke='var(--line)' stroke-width='1.6'/>"+
    "<path d='M 5 -4 q 3 -5 0 -9' class='art-steam' fill='none' stroke='var(--dim)' stroke-width='1.4'/>"+
    "<path d='M 10 -4 q -3 -6 0 -11' class='art-steam' style='animation-delay:1.2s' fill='none' stroke='var(--dim)' stroke-width='1.4'/>"+
  "</g>";
  return wrap(
    lamp(210, 54, false) +
    city(560, 30, 200, 100) +
    "<rect x='250' y='122' width='240' height='9' rx='4' fill='#152238'/>"+
    "<rect x='268' y='131' width='10' height='24' fill='#101b2d'/><rect x='462' y='131' width='10' height='24' fill='#101b2d'/>"+
    doc + coffee +
    sit(345, 122, 1.05, true) +
    /* доска с планом на стене слева */
    "<g transform='translate(60,40)'><rect x='0' y='0' width='110' height='74' rx='4' fill='#0e1a2c' stroke='var(--line)'/>"+
    "<path d='M 12 58 L 34 30 L 56 44 L 78 18 L 98 26' fill='none' stroke='var(--acc)' stroke-width='1.8' opacity='.7' class='art-draw'/>"+
    "<text x='12' y='14' font-size='9' fill='var(--dim)' font-family='Segoe UI'>план проекта</text></g>"+
    floor()
  );
}

/* Рабочий стол инженера: крупный экран с ползунками и графиком, экран с турбиной */
function desk(){
  var sliders = "";
  for(var k=0;k<4;k++){
    sliders += "<rect x='14' y='"+(26+k*16)+"' width='110' height='3.5' rx='1.75' fill='var(--line)'/>"+
      "<circle cx='"+(40+k*22)+"' cy='"+(27.7+k*16)+"' r='4.2' fill='var(--acc)' class='art-knob' style='animation-delay:"+(k*1.4)+"s'/>";
  }
  return wrap(
    lamp(400, 64, false) +
    /* левый экран: ползунки + кривая */
    "<g transform='translate(170,26)'>"+
      "<rect x='0' y='0' width='280' height='104' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
      "<text x='14' y='16' font-size='9.5' fill='var(--dim)' font-family='Segoe UI'>КОНСТРУКТИВНЫЕ РЕШЕНИЯ</text>"+
      sliders +
      "<rect x='146' y='22' width='120' height='70' rx='3' fill='#0e1f33'/>"+
      "<polyline points='154,84 176,56 198,68 220,38 242,52 260,32' fill='none' stroke='var(--ok)' stroke-width='2' class='art-draw'/>"+
      "<line x1='146' y1='46' x2='266' y2='46' stroke='var(--bad)' stroke-width='1' stroke-dasharray='4 4' opacity='.7'/>"+
    "</g>"+
    /* правый экран: турбина */
    "<g transform='translate(490,38)'>"+
      "<rect x='0' y='0' width='150' height='92' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
      (isUav()
        ? craft(75,52,0.62,false)
        : "<g transform='translate(75,46)'>"+
          "<g class='art-rotate-slow'>"+
            (function(){ var b=""; for(var k=0;k<6;k++){ b+="<path d='M 0 -8 Q 10 -18 4 -30 L -2 -28 Q -4 -16 0 -8 Z' fill='var(--acc2)' opacity='.75' transform='rotate("+(k*60)+")'/>"; } return b; })() +
          "<circle cx='0' cy='0' r='5' fill='var(--acc)'/></g>"+
          "<circle cx='0' cy='0' r='34' fill='none' stroke='var(--acc2)' stroke-width='1.2' opacity='.5'/>"+
        "</g>") +
    "</g>"+
    sit(330, 152, 1.05, true) +
    "<rect x='240' y='140' width='190' height='6' rx='3' fill='#152238'/>"+ /* столешница */
    floor()
  );
}

/* Фабрика (финальный экран): двигатель на стенде, кран-балка, пульсирующее свечение */
function fab(){
  return wrap(
    "<rect x='0' y='0' width='800' height='14' fill='#0e1a2c'/>"+
    "<rect x='330' y='14' width='8' height='30' fill='#0e1a2c'/><rect x='300' y='40' width='68' height='8' rx='3' fill='#152238'/>"+
    "<line x1='322' y1='48' x2='322' y2='66' stroke='var(--line)' stroke-width='2'/><line x1='346' y1='48' x2='346' y2='66' stroke='var(--line)' stroke-width='2'/>"+
    /* изделие на стенде */
    (isUav()
      ? "<g transform='translate(334,104)' class='art-pulse'>"+craft(0,0,0.98,false)+"</g>"
      : "<g transform='translate(334,100)' class='art-pulse'>"+
        "<ellipse cx='0' cy='0' rx='66' ry='34' fill='#101d31' stroke='var(--acc2)' stroke-opacity='.5'/>"+
        "<g transform='translate(-38,0)'><g class='art-rotate'>"+
          (function(){ var b=""; for(var k=0;k<8;k++){ b+="<rect x='-1.4' y='-24' width='2.8' height='21' rx='1.4' fill='var(--acc2)' opacity='.85' transform='rotate("+(k*45)+")'/>"; } return b; })() +
        "<circle cx='0' cy='0' r='5' fill='var(--acc)'/></g>"+
        "<circle cx='0' cy='0' r='26' fill='none' stroke='var(--acc2)' stroke-width='1.4' opacity='.7'/></g>"+
        "<path d='M 30 -12 H 60 M 30 0 H 64 M 30 12 H 60' stroke='var(--acc)' stroke-width='2' stroke-dasharray='6 8' class='art-flow' opacity='.7'/>"+
      "</g>") +
    /* стойки стенда */
    "<rect x='292' y='128' width='10' height='28' fill='#101b2d'/><rect x='366' y='128' width='10' height='28' fill='#101b2d'/>"+
    /* экран готовности */
    "<g transform='translate(560,44)'><rect x='0' y='0' width='130' height='80' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
      "<circle cx='38' cy='40' r='22' fill='none' stroke='var(--line)' stroke-width='5'/>"+
      "<circle cx='38' cy='40' r='22' fill='none' stroke='var(--ok)' stroke-width='5' stroke-dasharray='138' stroke-dashoffset='40' transform='rotate(-90 38 40)' class='art-ring'/>"+
      "<text x='72' y='36' font-size='10' fill='var(--dim)' font-family='Segoe UI'>двойник</text>"+
      "<text x='72' y='52' font-size='12' fill='var(--ok)' font-family='Segoe UI' font-weight='700'>живет</text></g>"+
    sit(180, 152, 1.0, true) + stand(470, 154, 1.05, true) +
    lamp(160, 52, false) + lamp(620, 52, false) +
    floor()
  );
}

/* Вычислительный центр: ряды стоек, экран загрузки кластера, админ */
function hpccenter(){
  var racks = "";
  for(var rrow=0; rrow<4; rrow++){
    var rx = 60 + rrow*68;
    racks += "<g transform='translate("+rx+",48)'><rect x='0' y='0' width='44' height='104' rx='3' fill='#0e1a2c' stroke='var(--line)'/>";
    for(var k=0;k<7;k++){
      racks += "<rect x='5' y='"+(6+k*14)+"' width='34' height='9' rx='2' fill='#101d31'/>"+
        "<circle cx='33' cy='"+(10.5+k*14)+"' r='1.9' fill='var(--ok)' class='art-flicker' style='animation-delay:"+((rrow*1.3+k*0.8)%5).toFixed(1)+"s'/>"+
        "<circle cx='27' cy='"+(10.5+k*14)+"' r='1.9' fill='var(--acc2)' class='art-flicker' style='animation-delay:"+((rrow*2.1+k*1.1)%6).toFixed(1)+"s'/>";
    }
    racks += "</g>";
  }
  /* экран загрузки кластера: прыгающие столбики */
  var bars = "";
  for(var b=0;b<8;b++){
    bars += "<rect x='"+(14+b*22)+"' y='22' width='14' height='58' rx='2' fill='var(--acc2)' opacity='.65' style='animation-delay:"+(b*0.35)+"s'/>";
  }
  return wrap(
    lamp(200, 56, false) + lamp(520, 56, false) +
    racks +
    "<g transform='translate(420,36)'><rect x='0' y='0' width='200' height='96' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
    "<text x='14' y='16' font-size='9.5' fill='var(--dim)' font-family='Segoe UI'>ЗАГРУЗКА КЛАСТЕРА · ядро-часы</text>"+
    "<g class='art-bars'>"+bars+"</g></g>"+
    stand(680, 152, 1.05, true) + sit(560, 152, 1.0, false) +
    floor()
  );
}

/* Испытательная лаборатория: вибростенд с лопаткой (трясется), осциллограф */
function lab(){
  return wrap(
    lamp(180, 54, false) + lamp(540, 54, false) +
    /* вибростенд: станина + вибростол + лопатка */
    "<g transform='translate(180,84)'>"+
      "<rect x='-10' y='44' width='150' height='14' rx='3' fill='#101b2d'/>"+ /* станина */
      "<rect x='8' y='30' width='114' height='14' rx='3' fill='#152238' stroke='var(--line)'/>"+ /* корпус вибратора */
      "<g class='art-shake'>"+
        "<rect x='28' y='18' width='74' height='12' rx='2' fill='#1b2a44' stroke='var(--acc2)' stroke-opacity='.5'/>"+ /* стол */
        (isUav()
          ? "<g transform='translate(65,6)'>"+wingSec()+"</g>"   /* секция крыла */
          : "<path d='M 60 18 L 56 -18 Q 65 -26 74 -18 L 70 18 Z' fill='var(--acc2)' opacity='.85'/>") + /* лопатка */
      "</g>"+
      "<circle cx='18' cy='37' r='3' fill='var(--ok)' class='art-flicker'/>"+
    "</g>"+
    /* осциллограф: бегущая волна */
    "<g transform='translate(420,40)'>"+
      "<rect x='0' y='0' width='190' height='92' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
      "<text x='12' y='15' font-size='9.5' fill='var(--dim)' font-family='Segoe UI'>"+(isUav()?"ОТКЛИК · АЧХ крыла":"ОТКЛИК · АЧХ лопатки")+"</text>"+
      "<path d='M 10 58 Q 22 30 34 58 Q 46 86 58 58 Q 70 26 82 58 Q 94 90 106 58 Q 118 34 130 58 Q 142 82 154 58 Q 166 38 178 58' fill='none' stroke='var(--ok)' stroke-width='1.8' stroke-dasharray='6 4' class='art-wave'/>"+
      "<line x1='10' y1='58' x2='180' y2='58' stroke='var(--line)' stroke-dasharray='2 4'/>"+
    "</g>"+
    /* испытатель у стенда + расчетчик с ноутбуком */
    stand(348, 152, 1.08, true) + sit(660, 152, 1.0, true) +
    "<rect x='630' y='138' width='80' height='5' rx='2' fill='#152238'/>"+
    floor()
  );
}

/* Центр виртуальных испытаний: стена экранов с РАЗНЫМИ испытаниями
   (вентилятор, лопатка под нагрузкой, поток через двигатель, полигонная
   траектория, вибростенд), счетчик выполненных испытаний */
function vtScreen(type, d){
  /* содержимое одного экрана 80x46, локальные координаты */
  if(type===0){ /* обдув: вентилятор (gtd) / летающее крыло (uav) */
    var head0 = isUav()
      ? craft(28,24,0.30,false)
      : "<g transform='translate(26,23)'><g class='art-rotate-slow' style='animation-delay:"+d+"s'>"+
        (function(){ var b=""; for(var k=0;k<6;k++){ b+="<rect x='-1.1' y='-13' width='2.2' height='11' rx='1.1' fill='var(--acc2)' opacity='.85' transform='rotate("+(k*60)+")'/>"; } return b; })()+
        "<circle cx='0' cy='0' r='3' fill='var(--acc)'/></g>"+
        "<circle cx='0' cy='0' r='15' fill='none' stroke='var(--acc2)' stroke-width='1' opacity='.5'/></g>";
    return head0 +
      "<path d='M 48 12 H 72 M 48 23 H 74 M 48 34 H 72' stroke='var(--acc2)' stroke-width='1.3' opacity='.6' stroke-dasharray='4 5' class='art-flow'/>";
  }
  if(type===1){ /* зоны нагрузки: лопатка (gtd) / секция крыла (uav) */
    return (isUav()
      ? "<g transform='translate(8,24)'>"+
        "<path d='M 0 0 Q 14 -7 40 -4 Q 50 -3 50 -1 Q 50 1 40 2 Q 14 4 0 0 Z' fill='#16263e' stroke='var(--acc2)' stroke-opacity='.5'/>"+
        "<ellipse cx='11' cy='-2' rx='4' ry='3.4' fill='var(--bad)' opacity='.55' class='art-glow' style='animation-delay:"+d+"s'/>"+
        "<ellipse cx='30' cy='-1' rx='4.5' ry='3.6' fill='var(--warn)' opacity='.45' class='art-glow' style='animation-delay:"+(d+1)+"s'/></g>"
      : "<g transform='translate(28,42)'>"+
        "<path d='M -6 0 L -4 -30 Q 2 -36 8 -30 L 6 0 Z' fill='#16263e' stroke='var(--acc2)' stroke-opacity='.5'/>"+
        "<ellipse cx='1' cy='-26' rx='4' ry='5' fill='var(--bad)' opacity='.55' class='art-glow' style='animation-delay:"+d+"s'/>"+
        "<ellipse cx='0' cy='-12' rx='4.5' ry='6' fill='var(--warn)' opacity='.45' class='art-glow' style='animation-delay:"+(d+1)+"s'/>"+
        "<rect x='-8' y='0' width='18' height='4' rx='1.5' fill='#101b2d'/></g>") +
      "<text x='46' y='16' font-size='7.5' fill='var(--dim)' font-family='Segoe UI'>зоны</text>"+
      "<text x='46' y='26' font-size='7.5' fill='var(--dim)' font-family='Segoe UI'>нагрузки</text>"+
      "<rect x='46' y='32' width='8' height='5' fill='var(--bad)' opacity='.6'/><rect x='56' y='32' width='8' height='5' fill='var(--warn)' opacity='.5'/><rect x='66' y='32' width='8' height='5' fill='var(--ok)' opacity='.5'/>";
  }
  if(type===2){ /* поток: разрез двигателя (gtd) / обтекание крыла (uav) */
    if(isUav()){
      return craft(40,24,0.34,false) +
        "<path d='M 4 10 H 16 M 4 20 H 14 M 4 30 H 16' stroke='var(--acc2)' stroke-width='1.2' opacity='.7' stroke-dasharray='3 4' class='art-flow'/>"+
        "<path d='M 64 10 H 76 M 66 20 H 76 M 64 30 H 76' stroke='var(--acc)' stroke-width='1.3' opacity='.8' stroke-dasharray='4 4' class='art-flow' style='animation-delay:"+(d*0.4)+"s'/>";
    }
    return "<g transform='translate(40,23)'>"+
      "<ellipse cx='0' cy='0' rx='26' ry='13' fill='#101d31' stroke='var(--acc2)' stroke-opacity='.5'/>"+
      "<ellipse cx='-16' cy='0' rx='4' ry='9' fill='none' stroke='var(--acc2)' stroke-width='1' opacity='.7'/>"+
      "<path d='M -34 -5 H -28 M -34 0 H -27 M -34 5 H -28' stroke='var(--acc2)' stroke-width='1.2' opacity='.7' stroke-dasharray='3 4' class='art-flow'/>"+
      "<path d='M 26 -4 H 36 M 26 0 H 38 M 26 4 H 36' stroke='var(--acc)' stroke-width='1.4' opacity='.8' stroke-dasharray='4 4' class='art-flow' style='animation-delay:"+(d*0.4)+"s'/></g>";
  }
  if(type===3){ /* цифровой полигон: траектория полета */
    return "<line x1='6' y1='38' x2='74' y2='38' stroke='var(--line)'/>"+
      "<path d='M 8 36 Q 26 12 44 16 Q 62 20 72 10' fill='none' stroke='var(--acc2)' stroke-width='1.3' opacity='.7' stroke-dasharray='4 4' class='art-flow'/>"+
      "<path d='M 66 13 l 8 -3 l -6 5 l -1 3 Z' fill='var(--acc)' opacity='.9'/>"+
      "<text x='8' y='12' font-size='7.5' fill='var(--dim)' font-family='Segoe UI'>полигон: цикл</text>"+
      "<rect x='30' y='36' width='6' height='2.5' fill='var(--acc2)' opacity='.5'/><rect x='52' y='36' width='6' height='2.5' fill='var(--acc2)' opacity='.5'/>";
  }
  /* вибростенд: деталь дрожит на столе */
  return "<g transform='translate(40,40)'>"+
    "<rect x='-22' y='0' width='44' height='4' rx='1.5' fill='#101b2d'/>"+
    "<g class='art-shake' style='animation-delay:"+d+"s'>"+
      "<rect x='-12' y='-7' width='24' height='5' rx='1.5' fill='#1b2a44' stroke='var(--acc2)' stroke-opacity='.5'/>"+
      "<path d='M -2 -7 L -1 -20 Q 2 -23 5 -20 L 4 -7 Z' fill='var(--acc2)' opacity='.85'/>"+
    "</g></g>"+
    "<path d='M 8 12 q 4 -7 8 0 q 4 7 8 0 q 4 -7 8 0' fill='none' stroke='var(--ok)' stroke-width='1.2' opacity='.7' stroke-dasharray='3 3' class='art-wave'/>"+
    "<text x='44' y='15' font-size='7.5' fill='var(--dim)' font-family='Segoe UI'>вибростенд</text>";
}
function testcenter(){
  var screens = "";
  for(var r=0;r<2;r++) for(var c=0;c<5;c++){
    var i = r*5+c, x = 56+c*92, y = 30+r*56, d = (i*0.7)%4;
    screens += "<g transform='translate("+x+","+y+")'>"+
      "<rect x='0' y='0' width='80' height='46' rx='3' fill='#0c1626' stroke='var(--line)'/>"+
      vtScreen(i%5, d)+
      "<circle cx='73' cy='7' r='2' fill='var(--ok)' class='art-flicker' style='animation-delay:"+(i%5)+"s'/>"+
    "</g>";
  }
  return wrap(
    lamp(220, 56, false) + lamp(560, 56, false) +
    screens +
    /* табло счетчика испытаний */
    "<g transform='translate(560,36)'><rect x='0' y='0' width='180' height='96' rx='5' fill='#0c1626' stroke='var(--acc2)' stroke-opacity='.45'/>"+
    "<text x='14' y='20' font-size='10' fill='var(--dim)' font-family='Segoe UI'>ИСПЫТАНИЙ ВЫПОЛНЕНО</text>"+
    "<text x='14' y='56' font-size='30' fill='var(--acc2)' font-family='Segoe UI' font-weight='700' class='art-glow'>4 184</text>"+
    "<text x='14' y='80' font-size='9.5' fill='var(--ok)' font-family='Segoe UI'>стенды и полигон · работа 24/7</text></g>"+
    sit(180, 152, 1.0, true) + sit(330, 152, 1.0, false) + stand(480, 154, 1.05, true) +
    floor()
  );
}

/* Сборочный / производственный цех: двигатель на тележке, кран-балка, стеллажи */
function assembly(){
  return wrap(
    "<rect x='0' y='0' width='800' height='12' fill='#0e1a2c'/>"+
    "<rect x='150' y='12' width='8' height='22' fill='#0e1a2c'/><rect x='118' y='30' width='72' height='8' rx='3' fill='#152238'/>"+
    "<line x1='138' y1='38' x2='138' y2='58' stroke='var(--line)' stroke-width='2'/><line x1='170' y1='38' x2='170' y2='58' stroke='var(--line)' stroke-width='2'/>"+
    /* изделие на сборочной тележке */
    (isUav()
      ? "<g transform='translate(154,104)'>"+craft(0,0,0.82,false)+"</g>"
      : "<g transform='translate(154,104)'>"+
        "<ellipse cx='0' cy='0' rx='58' ry='30' fill='#101d31' stroke='var(--acc2)' stroke-opacity='.45'/>"+
        "<g transform='translate(-34,0)'><g class='art-rotate-slow'>"+
          (function(){ var b=""; for(var k=0;k<8;k++){ b+="<rect x='-1.2' y='-20' width='2.4' height='17' rx='1.2' fill='var(--acc2)' opacity='.8' transform='rotate("+(k*45)+")'/>"; } return b; })() +
        "<circle cx='0' cy='0' r='4' fill='var(--acc)'/></g>"+
        "<circle cx='0' cy='0' r='22' fill='none' stroke='var(--acc2)' stroke-width='1.2' opacity='.6'/></g>"+
      "</g>") +
    "<rect x='104' y='132' width='100' height='6' rx='3' fill='#152238'/><circle cx='118' cy='146' r='6' fill='#101b2d'/><circle cx='190' cy='146' r='6' fill='#101b2d'/>"+
    /* стеллажи с деталями */
    "<g transform='translate(330,52)'><rect x='0' y='0' width='120' height='100' rx='3' fill='#0e1a2c' stroke='var(--line)'/>"+
    (function(){ var s=""; for(var r=0;r<3;r++){ s+="<line x1='4' y1='"+(28+r*30)+"' x2='116' y2='"+(28+r*30)+"' stroke='var(--line)'/>";
      for(var c=0;c<4;c++){ s+="<ellipse cx='"+(18+c*28)+"' cy='"+(20+r*30)+"' rx='10' ry='5' fill='#16263e' stroke='var(--acc2)' stroke-opacity='.3'/>"; } } return s; })() +"</g>"+
    /* стол ОТК с экраном */
    "<g transform='translate(540,70)'><rect x='0' y='0' width='130 ' height='70' rx='4' fill='#0c1626' stroke='var(--line)'/>"+
    "<text x='12' y='16' font-size='9' fill='var(--dim)' font-family='Segoe UI'>ПАСПОРТ ЭКЗЕМПЛЯРА</text>"+
    "<rect x='12' y='24' width='80' height='4' rx='2' fill='var(--acc2)' opacity='.5'/>"+
    "<rect x='12' y='33' width='100' height='4' rx='2' fill='var(--acc2)' opacity='.35'/>"+
    "<rect x='12' y='42' width='66' height='4' rx='2' fill='var(--acc)' opacity='.55'/>"+
    "<rect x='12' y='51' width='90' height='4' rx='2' fill='var(--acc2)' opacity='.35'/></g>"+
    stand(290, 152, 1.05, true) + sit(600, 152, 1.0, false) + stand(710, 152, 1.0, true) +
    lamp(250, 52, false) + lamp(600, 52, false) +
    floor()
  );
}

/* Натурный испытательный стенд: двигатель на станине, выхлоп, пульт за стеклом */
function testcell(){
  return wrap(
    "<rect x='0' y='0' width='800' height='10' fill='#0e1a2c'/>"+
    /* предупреждающие маяки */
    "<circle cx='40' cy='26' r='5' fill='var(--bad)' class='art-flicker'/><circle cx='760' cy='26' r='5' fill='var(--bad)' class='art-flicker' style='animation-delay:1.2s'/>"+
    /* изделие на станине, слегка дрожит */
    (isUav()
      ? "<g class='art-shake'>"+craft(330,98,1.08,false)+"</g>"
      : "<g class='art-shake'><g transform='translate(330,92)'>"+
        "<ellipse cx='0' cy='0' rx='80' ry='38' fill='#101d31' stroke='var(--acc2)' stroke-opacity='.5'/>"+
        "<g transform='translate(-46,0)'><g class='art-rotate'>"+
          (function(){ var b=""; for(var k=0;k<8;k++){ b+="<rect x='-1.6' y='-28' width='3.2' height='24' rx='1.6' fill='var(--acc2)' opacity='.85' transform='rotate("+(k*45)+")'/>"; } return b; })() +
        "<circle cx='0' cy='0' r='6' fill='var(--acc)'/></g>"+
        "<circle cx='0' cy='0' r='30' fill='none' stroke='var(--acc2)' stroke-width='1.4' opacity='.7'/></g>"+
        /* выхлоп */
        "<path d='M 82 -10 q 30 10 58 0 M 82 0 q 34 6 64 0 M 82 10 q 30 -8 58 0' stroke='var(--acc)' stroke-width='2.4' fill='none' opacity='.75' stroke-dasharray='8 6' class='art-flow'/>"+
      "</g></g>") +
    /* станина */
    "<rect x='258' y='128' width='12' height='28' fill='#101b2d'/><rect x='390' y='128' width='12' height='28' fill='#101b2d'/>"+
    "<rect x='240' y='124' width='180' height='8' rx='3' fill='#152238'/>"+
    /* пультовая за стеклом */
    "<g transform='translate(560,44)'>"+
      "<rect x='0' y='0' width='190' height='100' rx='5' fill='rgba(79,195,247,.05)' stroke='var(--line)'/>"+
      "<rect x='12' y='14' width='76' height='44' rx='3' fill='#0c1626' stroke='var(--line)'/>"+
      "<polyline points='18,46 30,28 42,40 54,22 66,36 80,26' fill='none' stroke='var(--ok)' stroke-width='1.6' class='art-draw'/>"+
      "<rect x='100' y='14' width='76' height='44' rx='3' fill='#0c1626' stroke='var(--line)'/>"+
      "<text x='110' y='32' font-size='9' fill='var(--dim)' font-family='Segoe UI'>"+(isUav()?"скорость, км/ч":"тяга, кН")+"</text>"+
      "<text x='110' y='50' font-size='15' fill='var(--acc2)' font-weight='700' font-family='Segoe UI' class='art-glow'>"+(isUav()?"172":"84.6")+"</text>"+
      (function(){ var s=""; var ppl=[[30,96],[90,96],[150,96]]; for(var k=0;k<3;k++){ s+="<g transform='translate("+ppl[k][0]+","+ppl[k][1]+") scale(0.78)'><circle cx='0' cy='-26' r='7.5' fill='#0a111d'/><path d='M -11 6 Q -11 -16 0 -16 Q 11 -16 11 6 Z' fill='#0a111d'/></g>"; } return s; })() +
    "</g>"+
    lamp(180, 54, false) +
    floor()
  );
}

/* Диспетчерская эксплуатации: карта полетов, дуги маршрутов, статусы бортов */
function ops(){
  /* дуги маршрутов с бегущими точками */
  var arcs = "<g transform='translate(60,30)'>"+
    "<rect x='0' y='0' width='420' height='110' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
    "<text x='14' y='18' font-size='9.5' fill='var(--dim)' font-family='Segoe UI'>ФЛОТ · борта с двойниками онлайн</text>"+
    "<path id='r1' d='M 30 88 Q 120 30 240 60' fill='none' stroke='var(--acc2)' stroke-width='1.2' opacity='.5' stroke-dasharray='4 5' class='art-flow'/>"+
    "<path d='M 60 96 Q 200 50 390 80' fill='none' stroke='var(--acc2)' stroke-width='1.2' opacity='.5' stroke-dasharray='4 5' class='art-flow' style='animation-delay:.5s'/>"+
    "<path d='M 140 100 Q 260 26 380 44' fill='none' stroke='var(--acc)' stroke-width='1.4' opacity='.6' stroke-dasharray='4 5' class='art-flow' style='animation-delay:1s'/>"+
    "<circle cx='30' cy='88' r='3' fill='var(--ok)'/><circle cx='240' cy='60' r='3' fill='var(--ok)'/>"+
    "<circle cx='60' cy='96' r='3' fill='var(--ok)'/><circle cx='390' cy='80' r='3' fill='var(--ok)'/>"+
    "<circle cx='140' cy='100' r='3' fill='var(--ok)'/><circle cx='380' cy='44' r='3' fill='var(--warn)' class='art-flicker'/>"+
  "</g>";
  var board = "<g transform='translate(520,30)'>"+
    "<rect x='0' y='0' width='220' height='110' rx='5' fill='#0c1626' stroke='var(--line)'/>"+
    "<text x='14' y='18' font-size='9.5' fill='var(--dim)' font-family='Segoe UI'>СТАТУС БОРТОВ</text>"+
    (function(){ var s=""; var rows=[["89501","var(--ok)","норма"],["89507","var(--ok)","норма"],["89512","var(--warn)","вибрация: тренд"],["89519","var(--ok)","норма"]];
      for(var k=0;k<4;k++){ s+="<circle cx='20' cy='"+(34+k*20)+"' r='3.5' fill='"+rows[k][1]+"'"+(k===2?" class='art-flicker'":"")+"/>"+
        "<text x='32' y='"+(38+k*20)+"' font-size='10' fill='var(--txt)' font-family='Segoe UI'>"+rows[k][0]+"</text>"+
        "<text x='84' y='"+(38+k*20)+"' font-size='10' fill='"+rows[k][1]+"' font-family='Segoe UI'>"+rows[k][2]+"</text>"; } return s; })() +
  "</g>";
  return wrap(
    lamp(400, 64, false) +
    arcs + board +
    sit(240, 152, 1.0, true) + sit(420, 152, 1.0, false) + stand(620, 154, 1.05, true) +
    floor()
  );
}

/* Эпилог: реальное изделие с людьми и его цифровой двойник, связи в обе стороны */
function twinmirror(){
  function engineShape(x, y, wire){
    var fill = wire ? "none" : "#101d31";
    var stroke = wire ? "var(--acc2)" : "var(--acc2)";
    var dash = wire ? " stroke-dasharray='5 4'" : "";
    var blades = "";
    for(var k=0;k<8;k++){ blades += "<rect x='-1.4' y='-22' width='2.8' height='19' rx='1.4' fill='"+(wire?"none":"var(--acc2)")+"' "+(wire?"stroke='var(--acc2)' stroke-width='1'"+dash:"opacity='.85'")+" transform='rotate("+(k*45)+")'/>"; }
    return "<g transform='translate("+x+","+y+")'>"+
      "<ellipse cx='0' cy='0' rx='62' ry='32' fill='"+fill+"' stroke='"+stroke+"' stroke-opacity='.6'"+dash+"/>"+
      "<g transform='translate(-36,0)'><g class='"+(wire?"art-rotate-slow":"art-rotate")+"'>"+blades+
      "<circle cx='0' cy='0' r='5' fill='"+(wire?"none":"var(--acc)")+"' "+(wire?"stroke='var(--acc)'":"")+"/></g>"+
      "<circle cx='0' cy='0' r='24' fill='none' stroke='var(--acc2)' stroke-width='1.2' opacity='.6'"+dash+"/></g>"+
    "</g>";
  }
  return wrap(
    lamp(180, 54, false) + lamp(600, 54, false) +
    /* реальное изделие + техники */
    (isUav() ? craft(170, 98, 1.0, false) : engineShape(170, 96, false)) +
    "<rect x='100' y='126' width='10' height='30' fill='#101b2d'/><rect x='230' y='126' width='10' height='30' fill='#101b2d'/>"+
    stand(70, 152, 1.0, true) + arm(78, 116) + stand(282, 152, 1.0, false) +
    "<rect x='292' y='112' width='14' height='18' rx='2' fill='#16263e' stroke='var(--acc2)' stroke-opacity='.5'/>"+ /* планшет техника */
    "<text x='170' y='150' font-size='11' fill='var(--dim)' text-anchor='middle' font-family='Segoe UI'>ИЗДЕЛИЕ · борт 89512</text>"+
    /* экран с двойником */
    "<g transform='translate(470,30)'><rect x='0' y='0' width='290' height='118' rx='6' fill='#0c1626' stroke='var(--acc2)' stroke-opacity='.45'/>"+
    "<text x='14' y='18' font-size='10' fill='var(--dim)' font-family='Segoe UI'>ЦИФРОВОЙ ДВОЙНИК · экземпляр 89512</text></g>"+
    (isUav() ? craft(615, 94, 1.0, true) : engineShape(615, 92, true)) +
    "<text x='615' y='138' font-size='10' fill='var(--acc2)' text-anchor='middle' font-family='Segoe UI'>модель следует за железом</text>"+
    /* двусторонние связи: данные вправо, рекомендации влево */
    "<path d='M 250 78 H 455' stroke='var(--acc2)' stroke-width='2' stroke-dasharray='7 7' class='art-flow'/>"+
    "<path d='M 459 78 l -8 -4 v 8 Z' fill='var(--acc2)'/>"+
    "<text x='352' y='70' font-size='9.5' fill='var(--acc2)' text-anchor='middle' font-family='Segoe UI'>данные</text>"+
    "<path d='M 455 112 H 250' stroke='var(--acc)' stroke-width='2' stroke-dasharray='7 7' class='art-flow' style='animation-direction:reverse'/>"+
    "<path d='M 246 112 l 8 -4 v 8 Z' fill='var(--acc)'/>"+
    "<text x='352' y='128' font-size='9.5' fill='var(--acc)' text-anchor='middle' font-family='Segoe UI'>прогнозы и рекомендации</text>"+
    floor()
  );
}

/* ---------- карта «локация -> сцена» ---------- */
var BYLOC = {
  "Кабинет директора": director,
  "Коридор заводоуправления": corridor,
  "Инженерный зал": hall,
  "Планерка": meeting,
  "Переговорная": meeting,
  "Кабинет руководителя проекта": office,
  "Рабочий стол инженера": desk,
  "Вычислительный центр": hpccenter,
  "Испытательная лаборатория": lab,
  "Центр виртуальных испытаний": testcenter,
  "Сборочный цех": assembly,
  "Производственный цех": assembly,
  "Натурный испытательный стенд": testcell,
  "Диспетчерская эксплуатации": ops,
  "Изделие и его двойник": twinmirror,
  "Фабрика цифровых двойников": fab
};

return {
  forLoc: function(loc){ var f = BYLOC[loc]; return f ? f() : null; }
};
})();
