/* ============================================================
   «Путь двойника» - живые сцены локаций (анимированный SVG).
   Вместо плашки-заглушки баннер каждой локации показывает
   стилизованный «кадр жизни»: силуэты людей, экраны с данными,
   мигающие индикаторы. Рисуется кодом, картинки не нужны.
   Анимации - в app.css (классы art-*), уважают prefers-reduced-motion.
   ============================================================ */

var ART = (function(){

/* ---------- общие детали ---------- */

/* силуэт сидящего человека (голова + корпус), цвет тёмный */
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
    "<g transform='translate(58,52)'>"+
      "<g class='art-rotate'>"+
        (function(){ var b=""; for(var k=0;k<8;k++){ b+="<rect x='-1.8' y='-30' width='3.6' height='26' rx='1.8' fill='var(--acc2)' opacity='.8' transform='rotate("+(k*45)+")'/>"; } return b; })() +
      "<circle cx='0' cy='0' r='6' fill='var(--acc)'/></g>"+
      "<circle cx='0' cy='0' r='33' fill='none' stroke='var(--acc2)' stroke-width='1.4' opacity='.6'/>"+
    "</g>"+
    "<path d='M 100 30 H 196 M 100 52 H 196 M 100 74 H 196' stroke='var(--acc2)' stroke-width='1.6' opacity='.55' stroke-dasharray='7 9' class='art-flow'/>"+
    "<text x='104' y='22' font-size='10' fill='var(--dim)' font-family='Segoe UI'>поток · режим взлет</text>"+
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
      "<g transform='translate(75,46)'>"+
        "<g class='art-rotate-slow'>"+
          (function(){ var b=""; for(var k=0;k<6;k++){ b+="<path d='M 0 -8 Q 10 -18 4 -30 L -2 -28 Q -4 -16 0 -8 Z' fill='var(--acc2)' opacity='.75' transform='rotate("+(k*60)+")'/>"; } return b; })() +
        "<circle cx='0' cy='0' r='5' fill='var(--acc)'/></g>"+
        "<circle cx='0' cy='0' r='34' fill='none' stroke='var(--acc2)' stroke-width='1.2' opacity='.5'/>"+
      "</g>"+
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
    /* двигатель: гондола + вентилятор */
    "<g transform='translate(334,100)' class='art-pulse'>"+
      "<ellipse cx='0' cy='0' rx='66' ry='34' fill='#101d31' stroke='var(--acc2)' stroke-opacity='.5'/>"+
      "<g transform='translate(-38,0)'><g class='art-rotate'>"+
        (function(){ var b=""; for(var k=0;k<8;k++){ b+="<rect x='-1.4' y='-24' width='2.8' height='21' rx='1.4' fill='var(--acc2)' opacity='.85' transform='rotate("+(k*45)+")'/>"; } return b; })() +
      "<circle cx='0' cy='0' r='5' fill='var(--acc)'/></g>"+
      "<circle cx='0' cy='0' r='26' fill='none' stroke='var(--acc2)' stroke-width='1.4' opacity='.7'/></g>"+
      "<path d='M 30 -12 H 60 M 30 0 H 64 M 30 12 H 60' stroke='var(--acc)' stroke-width='2' stroke-dasharray='6 8' class='art-flow' opacity='.7'/>"+
    "</g>"+
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

/* ---------- карта «локация -> сцена» ---------- */
var BYLOC = {
  "Кабинет директора": director,
  "Коридор заводоуправления": corridor,
  "Инженерный зал": hall,
  "Планерка": meeting,
  "Переговорная": meeting,
  "Кабинет руководителя проекта": office,
  "Рабочий стол инженера": desk,
  "Фабрика цифровых двойников": fab
};

return {
  forLoc: function(loc){ var f = BYLOC[loc]; return f ? f() : null; }
};
})();
