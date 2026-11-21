// Illustration helpers (original vector art) used by the landing page hero.
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const ico=(t,px=24)=>R.typeIcon(t,px);
const SC={verified:"#34d399",requires_confirmation:"#fbbf24",missing:"#a1a1aa"}, SS={verified:"✔",requires_confirmation:"?",missing:"–"};
const pin=(t,s,st="")=>`<div class="pin" style="border-color:${SC[s]};${st}">${ico(t,26)}<i style="background:${SC[s]}">${SS[s]}</i></div>`;
/* ---------- illustration helpers ---------- */
const lantern=(x,y,s,c,glow=true)=>`<g transform="translate(${x} ${y}) scale(${s})">${glow?`<circle cy="38" r="52" fill="${c}" opacity=".18"/>`:""}<line y1="-60" y2="0" stroke="#ffffff55" stroke-width="2"/><rect x="-6" y="-4" width="12" height="8" rx="2" fill="#7a3b12"/><rect x="-22" y="4" width="44" height="58" rx="22" fill="${c}"/><path d="M-22 33H22M-9 6Q-16 33-9 60M9 6Q16 33 9 60" stroke="#00000030" stroke-width="2" fill="none"/><rect x="-6" y="62" width="12" height="7" rx="2" fill="#7a3b12"/><line y1="69" y2="88" stroke="#ffc93c" stroke-width="3"/></g>`;
const skyline=(y,h,c,n,o=1,w0=40)=>{let x=-20,out="";while(x<1460){const w=w0+rnd()*60,hh=h*(.45+rnd()*.7);out+=`<rect x="${x.toFixed(0)}" y="${(y-hh).toFixed(0)}" width="${w.toFixed(0)}" height="${(hh+400).toFixed(0)}" fill="${c}" opacity="${o}"/>`;if(rnd()>.7)out+=`<rect x="${(x+w/2-2).toFixed(0)}" y="${(y-hh-28).toFixed(0)}" width="4" height="28" fill="${c}" opacity="${o}"/>`;x+=w+(rnd()*8);}return out};
const windows=(y,h,n)=>{let o="";for(let i=0;i<n;i++){o+=`<rect x="${(rnd()*1400).toFixed(0)}" y="${(y-rnd()*h).toFixed(0)}" width="5" height="8" rx="1" fill="#ffd98a" opacity="${(.4+rnd()*.5).toFixed(2)}"/>`}return o};
const star=(x,y,r,c)=>`<path d="M${x} ${y-r}L${x+r*.28} ${y-r*.28}L${x+r} ${y}L${x+r*.28} ${y+r*.28}L${x} ${y+r}L${x-r*.28} ${y+r*.28}L${x-r} ${y}L${x-r*.28} ${y-r*.28}Z" fill="${c}"/>`;
const burst=(x,y,r,c)=>{let o="";for(let a=0;a<16;a++){const t=a/16*Math.PI*2,x1=x+Math.cos(t)*r*.35,y1=y+Math.sin(t)*r*.35,x2=x+Math.cos(t)*r,y2=y+Math.sin(t)*r;o+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="3" stroke-linecap="round"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="3.5" fill="${c}"/>`}return o};
seed=11;
const heroScene=`<svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMax slice" class="scene"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#021e36"/><stop offset=".45" stop-color="#034f84"/><stop offset=".8" stop-color="#c9577a"/><stop offset="1" stop-color="#ffb35c"/></linearGradient><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c5f94"/><stop offset="1" stop-color="#02385f"/></linearGradient><radialGradient id="sun"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#ffc93c" stop-opacity=".9"/><stop offset="1" stop-color="#ffc93c" stop-opacity="0"/></radialGradient></defs>
<rect width="1440" height="760" fill="url(#sky)"/>${Array.from({length:60},()=>`<circle cx="${(rnd()*1440).toFixed(0)}" cy="${(rnd()*300).toFixed(0)}" r="${(rnd()*1.6+.4).toFixed(1)}" fill="#fff" opacity="${(rnd()*.7+.2).toFixed(2)}"/>`).join("")}
<circle cx="980" cy="520" r="210" fill="url(#sun)"/><circle cx="980" cy="520" r="70" fill="#ffe29a"/>
${burst(1180,170,70,"#ffc93c")}${burst(1290,250,48,"#8fe3c2")}${burst(820,130,44,"#cfc2f7")}
<g>${skyline(560,200,"#1d4f7c",0,.85,36)}</g><g>${skyline(600,170,"#0d3a63",0,1,48)}${windows(600,170,90)}</g><g>${skyline(640,120,"#02263f",0,1,60)}${windows(640,110,70)}</g>
<rect y="640" width="1440" height="120" fill="url(#water)"/>
${Array.from({length:22},(_,i)=>`<rect x="${(rnd()*1400).toFixed(0)}" y="${(655+rnd()*90).toFixed(0)}" width="${(30+rnd()*90).toFixed(0)}" height="3" rx="1.5" fill="${["#ffc93c","#ffb35c","#8fe3c2","#fff"][i%4]}" opacity="${(.25+rnd()*.4).toFixed(2)}"/>`).join("")}
<path d="M0 90Q180 150 360 90T720 90T1080 90T1440 90" fill="none" stroke="#ffffff55" stroke-width="2"/>${[0,1,2,3,4,5,6,7].map(i=>`<circle cx="${i*180+90}" cy="${[134,134,134,134,134,134,134,134][i]}" r="9" fill="${["#ffc93c","#8fe3c2","#cfc2f7","#f6c5c5"][i%4]}"/>`).join("")}
${lantern(640,150,1,"#e8503a")}${lantern(740,100,.75,"#ffc93c")}${lantern(900,170,.85,"#cfc2f7")}</svg>`;

export { heroScene, lantern, star };
