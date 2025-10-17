// emergency-board-light.js (완전 통합·폭주 대비·AJAX 관리자 패널·5분 제한)
const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const LOGFILE = './messages.log';
const PORT = process.env.PORT || 3000;
const MAX_TEXT = 256;
const MAX_RECENT = 200;
const PAGE_SIZE = 50;
const BATCH_INTERVAL = 500; // 0.5초마다 배치 기록
const ADMIN_PASS = 'admin123';
const SCROLL_FONT_SIZE = 28;
const POST_INTERVAL = 5 * 60 * 1000; // 5분 제한

let recent = [];
let announcements = [
  "⚠️ 서버 점검 예정: 오늘 밤 11시~12시 🔥 긴급 공지: 지진 발생 시 안전지대로 이동하세요"
];
let writeQueue = [];
let channelIndex = {};
let userLastPost = {}; // IP 기준 게시 제한

// ---------------- 배치 쓰기 ----------------
setInterval(()=>{
  if(writeQueue.length){
    const data = writeQueue.map(m=>JSON.stringify(m)).join('\n')+'\n';
    fs.appendFile(LOGFILE, data, err=>{if(err) console.error(err);});
    writeQueue=[];
  }
}, BATCH_INTERVAL);

// ---------------- 채널 인덱스 ----------------
function buildChannelIndex(){
  channelIndex={};
  recent.forEach(m=>{
    if(!channelIndex[m.channel]) channelIndex[m.channel]=[];
    channelIndex[m.channel].push(m);
  });
}

// ---------------- 최근 메시지 로드 ----------------
function loadRecent(){
  try{
    const lines=fs.readFileSync(LOGFILE,'utf8').trim().split('\n');
    const allMsgs=lines.map(l=>JSON.parse(l));
    recent = allMsgs.slice(-MAX_RECENT).reverse();
    buildChannelIndex();
  }catch(e){ recent=[]; channelIndex={}; }
}
loadRecent();

// ---------------- body parser ----------------
app.use(bodyParser.urlencoded({extended:false}));

// ---------------- 채널 옵션 ----------------
const provinces = ["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"];
function buildChannelOptions(userChannel='') {
  let html=`<option value="대한민국"${userChannel==='대한민국'?' selected':''}>대한민국(통합)</option>`;
  html+=`<optgroup label="서울 1~9">`; for(let i=1;i<=9;i++) html+=`<option value="서울${i}"${userChannel==='서울'+i?' selected':''}>서울${i}</option>`; html+=`</optgroup>`;
  provinces.forEach(p=>{
    html+=`<optgroup label="${p} 1~9">`;
    for(let i=1;i<=9;i++) html+=`<option value="${p}${i}"${userChannel===p+i?' selected':''}>${p}${i}</option>`;
    html+=`</optgroup>`;
  });
  return html;
}

// ---------------- 일반 화면 ----------------
app.get('/', (req,res)=>{
  const channelFilter=(req.query.channel||'').toString().slice(0,50);
  let display=recent;
  if(channelFilter && channelIndex[channelFilter]) display=channelIndex[channelFilter].slice(0,PAGE_SIZE);

  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>비상 게시판</title>
<style>
body{font-family:monospace;font-size:14px;margin:5px;}
h1{margin:2px 0;}
table{border-collapse:collapse;width:100%;}
td,th{border:1px solid #000;padding:2px;}
#messages table tr:nth-child(even){background:#f0f0f0;}
#messages table tr:nth-child(odd){background:#ffffff;}
textarea{width:100%;height:60px;}
input[type=submit],select,input[type=text]{margin:2px 2px 2px 0;vertical-align:middle;}
.announcement{background:#fffae6;height:50px;overflow:hidden;white-space:nowrap;font-size:${SCROLL_FONT_SIZE}px;font-weight:bold;
animation:scrollAnn 20s linear infinite;}
@keyframes scrollAnn{0%{transform:translateX(100%);}100%{transform:translateX(-100%);}}
.instructions{font-weight:bold;}
.form-inline{display:flex;flex-wrap:wrap;align-items:center;gap:2px;}
.form-inline select,.form-inline input[type=text]{flex:1;}
#messages{max-height:400px;overflow:auto;}
.footer{margin-top:10px;font-size:12px;color:#555;}
@media(max-width:600px){textarea{height:80px;font-size:14px;}body{font-size:12px;}}
</style>
</head>
<body>
<h1>📢 비상 게시판</h1>
<p>목적: 긴급 재난/재해 상황에서 정보를 신속히 수집·배포</p>
<div class="announcement">${announcements.join(' ⚡ ')}</div>
<p class="instructions">게시판 사용법: 채널 선택 또는 사설 채널 입력 후 메시지 작성 → 전송 클릭 → 필요 시 필터 선택 후 '필터' 클릭</p>

<h3>최근 메시지 ${channelFilter? `(${channelFilter})` : ''}</h3>
<div id="messages">
<table>
<tr><th>시간</th><th>채널</th><th>내용</th></tr>
${display.map(m=>`<tr><td>${m.ts}</td><td>${m.channel}</td><td>${m.text}</td></tr>`).join('')}
</table>
</div>

<hr>
<form id="postForm" action="/write" method="post" class="form-inline">
<select name="channel">${buildChannelOptions()}</select>
<input type="text" name="privateChannel" placeholder="사설 채널 입력">
<textarea name="text" placeholder="메시지 입력" style="flex:2;"></textarea>
<input type="submit" value="전송">
</form>

<form id="filterForm" method="get" class="form-inline">
<select name="channel">
<option value="">전체보기</option>
${buildChannelOptions(channelFilter)}
</select>
<input type="submit" value="필터">
<button type="button" id="loadMore">더보기</button>
</form>

<div class="footer">제작자: luckyyyj77@gmail.com | <a href="/admin">관리자 모드</a></div>

<script>
let offset=${PAGE_SIZE};
const channelFilter='${channelFilter}';
document.getElementById('loadMore').addEventListener('click',()=>{
  fetch('/more?offset='+offset+'&channel='+channelFilter)
    .then(r=>r.json())
    .then(data=>{
      const table=document.querySelector('#messages table');
      data.forEach(m=>{
        const tr=document.createElement('tr');
        tr.innerHTML='<td>'+m.ts+'</td><td>'+m.channel+'</td><td>'+m.text+'</td>';
        table.appendChild(tr);
      });
      offset+=data.length;
    });
});

document.getElementById('postForm').addEventListener('submit', async function(e){
  e.preventDefault();
  const formData = new FormData(this);
  const res = await fetch('/write',{method:'POST',body:formData});
  if(res.status===429){
    alert(await res.text()); // 5분 제한 팝업
    return;
  }
  this.submit();
});
</script>
</body></html>`);
});

// ---------------- 관리자 모드 ----------------
app.get('/admin', (req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>관리자 모드</title></head><body>
<h1>관리자 모드</h1>
<form method="post" action="/admin/login">
<input type="password" name="pass" placeholder="관리자 비밀번호">
<input type="submit" value="접속">
</form>
<p><a href="/">일반 화면으로 돌아가기</a></p>
</body></html>`);
});

app.post('/admin/login',(req,res)=>{
  if(req.body.pass===ADMIN_PASS) res.redirect('/admin/panel');
  else res.send('비밀번호 틀림 <a href="/admin">뒤로</a>');
});

// ---------------- 관리자 패널 AJAX ----------------
app.get('/admin/panel',(req,res)=>{
  const display=recent.slice(0,MAX_RECENT);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>관리자 패널</title>
<style>
table{border-collapse:collapse;width:100%;}
td,th{border:1px solid #000;padding:2px;}
button{margin:1px;}
</style>
</head><body>
<h1>관리자 패널 (AJAX)</h1>

<h2>공지 관리</h2>
<textarea id="announcementText" placeholder="공지 내용" style="width:80%;"></textarea>
<button onclick="addAnnouncement()">공지 추가</button>
<ul id="announcementList">
${announcements.map((a,i)=>`<li data-id="${i}">${a} <button onclick="deleteAnnouncement(${i})">삭제</button></li>`).join('')}
</ul>

<h2>메시지 관리</h2>
<table id="msgTable">
<tr><th>시간</th><th>채널</th><th>내용</th><th>삭제</th></tr>
${display.map((m,i)=>`<tr data-id="${i}"><td>${m.ts}</td><td>${m.channel}</td><td>${m.text}</td><td><button onclick="deleteMsg(${i})">삭제</button></td></tr>`).join('')}
</table>

<p><a href="/">일반 화면으로 돌아가기</a></p>

<script>
function addAnnouncement(){
  const text=document.getElementById('announcementText').value.trim().slice(0,200);
  if(!text) return alert('내용 없음');
  fetch('/admin/announcement',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'text='+encodeURIComponent(text)})
    .then(()=>{
      const ul=document.getElementById('announcementList');
      const li=document.createElement('li');
      li.textContent=text;
      ul.appendChild(li);
    });
}
function deleteAnnouncement(i){
  fetch('/admin/announcement/delete',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'index='+i})
    .then(()=>document.querySelector('#announcementList li[data-id="'+i+'"]').remove());
}
function deleteMsg(i){
  fetch('/admin/msg/delete',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'index='+i})
    .then(()=>document.querySelector('#msgTable tr[data-id="'+i+'"]').remove());
}
</script>
</body></html>`);
});

// ---------------- 관리자 POST ----------------
app.post('/admin/announcement',(req,res)=>{
  const text=(req.body.text||'').slice(0,200);
  if(text) announcements.push(text);
  res.end();
});
app.post('/admin/announcement/delete',(req,res)=>{
  const i=parseInt(req.body.index); if(!isNaN(i)) announcements.splice(i,1);
  res.end();
});
app.post('/admin/msg/delete',(req,res)=>{
  const i=parseInt(req.body.index); if(!isNaN(i)) recent.splice(i,1);
  buildChannelIndex();
  res.end();
});

// ---------------- 메시지 쓰기 ----------------
app.post('/write',(req,res)=>{
  const ip=req.ip;
  const now=Date.now();
  if(userLastPost[ip] && now-userLastPost[ip]<POST_INTERVAL){
    return res.status(429).send('5분 내에는 한 번만 게시 가능합니다.');
  }

  let text=(req.body.text||'').slice(0,MAX_TEXT);
  let privateChannel=(req.body.privateChannel||'').slice(0,50).trim();
  let channel=privateChannel || (req.body.channel||'대한민국').slice(0,50);
  if(!text.trim()) return res.status(400).send('empty');

  const msg={ ts:new Date().toISOString(), channel, text };
  recent.unshift(msg);
  if(recent.length>MAX_RECENT) recent.pop();
  buildChannelIndex();
  writeQueue.push(msg);

  userLastPost[ip]=now;
  res.redirect('/');
});

// ---------------- 더보기 ----------------
app.get('/more',(req,res)=>{
  let offset=parseInt(req.query.offset)||0;
  const channelFilter=(req.query.channel||'').toString().slice(0,50);
  let display=recent;
  if(channelFilter && channelIndex[channelFilter]) display=channelIndex[channelFilter].slice(offset,offset+PAGE_SIZE);
  else display=recent.slice(offset,offset+PAGE_SIZE);
  res.json(display);
});

// ---------------- 서버 시작 ----------------
app.listen(PORT,()=>console.log(`Emergency board running on port ${PORT}`));
