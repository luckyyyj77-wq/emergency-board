// emergency-board-light.js (완전 통합·폭주 대비·AJAX 관리자 패널)
// 변경: process.env.PORT 사용, trust proxy 설정, 한글 기준 200자 제한 검사(거부), IP별 1분당 1회 제한 추가
const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();

// ----- 설정 -----
const LOGFILE = './messages.log';
const PORT = process.env.PORT || 3000;
const MAX_TEXT = 200;        // 한글 기준 문자 수 제한 (검사 후 거부)
const MAX_RECENT = 200;
const PAGE_SIZE = 50;
const BATCH_INTERVAL = 500;  // 0.5초마다 배치 기록
const ADMIN_PASS = 'admin123';
const SCROLL_FONT_SIZE = 28;

// ----- 내부 상태 -----
let recent = [];
let announcements = [
  "⚠️ 서버 점검 예정: 오늘 밤 11시~12시 🔥 긴급 공지: 지진 발생 시 안전지대로 이동하세요"
];
let writeQueue = [];
let channelIndex = {};

// ----- 신뢰할 프록시 (Render 등에서 클라이언트 IP를 req.ip로 얻기 위함) -----
app.set('trust proxy', true);

// ----- 쓰기 배치 (디스크 I/O 절감) -----
setInterval(()=>{
  if(writeQueue.length){
    const data = writeQueue.map(m=>JSON.stringify(m)).join('\n') + '\n';
    fs.appendFile(LOGFILE, data, err=>{ if(err) console.error('append err', err); });
    writeQueue = [];
  }
}, BATCH_INTERVAL);

// ----- 채널 인덱스 빌드 -----
function buildChannelIndex(){
  channelIndex = {};
  recent.forEach(m=>{
    if(!channelIndex[m.channel]) channelIndex[m.channel] = [];
    channelIndex[m.channel].push(m);
  });
}

// ----- 최근 메시지 로드 (프로세스 시작 시) -----
function loadRecent(){
  try{
    const content = fs.readFileSync(LOGFILE, 'utf8').trim();
    if(content === '') { recent = []; channelIndex = {}; return; }
    const lines = content.split('\n').slice(-MAX_RECENT);
    recent = lines.map(l => JSON.parse(l)).reverse();
    buildChannelIndex();
  }catch(e){
    recent = [];
    channelIndex = {};
  }
}
loadRecent();

// ----- body parser -----
app.use(bodyParser.urlencoded({ extended: false }));

// ----- 채널 옵션 생성 -----
const provinces = ["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"];
function buildChannelOptions(userChannel='') {
  let html = `<option value="대한민국"${userChannel==='대한민국'?' selected':''}>대한민국(통합)</option>`;
  html += `<optgroup label="서울 1~9">`;
  for(let i=1;i<=9;i++) html += `<option value="서울${i}"${userChannel==='서울'+i?' selected':''}>서울${i}</option>`;
  html += `</optgroup>`;
  provinces.forEach(p=>{
    html += `<optgroup label="${p} 1~9">`;
    for(let i=1;i<=9;i++) html += `<option value="${p}${i}"${userChannel===p+i?' selected':''}>${p}${i}</option>`;
    html += `</optgroup>`;
  });
  return html;
}

// ----- IP 기반 게시 제한(map of ip -> lastPostTs) -----
const lastPostByIP = {}; // { ip: timestamp_ms }
const POST_INTERVAL_MS = 60 * 1000; // 1분

// ----- 헬퍼: 문자열 길이(문자 단위) -----
function charLength(str){
  // JS 문자열 .length는 코드 유닛 수지만 한글은 한 문자 1로 센다. 충분.
  // If surrogate pairs matter, more complex logic could be used; for Korean this is fine.
  return str.length;
}

// ---------------- 일반 화면 ----------------
app.get('/', (req,res)=>{
  const channelFilter = (req.query.channel || '').toString().slice(0,50);
  let display = recent;
  if(channelFilter && channelIndex[channelFilter]) display = channelIndex[channelFilter].slice(0, PAGE_SIZE);

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
</style>
</head>
<body>
<h1>📢 비상 게시판</h1>
<p>목적: 긴급 재난/재해 상황에서 정보를 신속히 수집·배포</p>

<!-- 공지 스크롤 -->
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
<form action="/write" method="post" class="form-inline">
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
      offset += data.length;
    });
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
  if(req.body.pass === ADMIN_PASS) res.redirect('/admin/panel');
  else res.send('비밀번호 틀림 <a href="/admin">뒤로</a>');
});

// ---------------- 관리자 패널 (AJAX) ----------------
app.get('/admin/panel',(req,res)=>{
  const display = recent.slice(0, MAX_RECENT);
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
  const text = document.getElementById('announcementText').value.trim().slice(0,200);
  if(!text) return alert('내용 없음');
  fetch('/admin/announcement', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'text='+encodeURIComponent(text) })
    .then(()=> {
      const ul = document.getElementById('announcementList');
      const li = document.createElement('li'); li.textContent = text;
      const btn = document.createElement('button'); btn.textContent = '삭제';
      btn.onclick = ()=>{ deleteAnnouncement(ul.children.length-1); };
      li.appendChild(document.createTextNode(' ')); li.appendChild(btn);
      ul.appendChild(li);
      document.getElementById('announcementText').value = '';
    });
}

function deleteAnnouncement(id){
  fetch('/admin/announcement/delete/'+id).then(()=> {
    const ul = document.getElementById('announcementList');
    if(ul.children[id]) ul.children[id].remove();
  });
}

function deleteMsg(id){
  fetch('/admin/delete/'+id).then(()=>{
    const tr = document.querySelector('#msgTable tr[data-id="'+id+'"]');
    if(tr) tr.remove();
  });
}
</script>
</body></html>`);
});

// ---------------- 공지/메시지 삭제 ----------------
app.post('/admin/announcement',(req,res)=>{ let t=(req.body.text||'').slice(0,200); if(t.trim()) announcements.push(t); res.sendStatus(200); });
app.get('/admin/announcement/delete/:id',(req,res)=>{ let i=parseInt(req.params.id); if(!isNaN(i) && i>=0 && i<announcements.length) announcements.splice(i,1); res.sendStatus(200); });
app.get('/admin/delete/:id',(req,res)=>{ let i=parseInt(req.params.id); if(!isNaN(i) && i>=0 && i<recent.length){ recent.splice(i,1); buildChannelIndex(); fs.writeFileSync(LOGFILE, recent.slice().reverse().map(m=>JSON.stringify(m)).join('\n') + '\n'); } res.sendStatus(200); });

// ---------------- 메시지 더보기 / 리스트 API ----------------
app.get('/more',(req,res)=>{
  const offset = parseInt(req.query.offset) || 0;
  const channelFilter = (req.query.channel || '').toString().slice(0,50);
  let filtered = channelFilter && channelIndex[channelFilter] ? channelIndex[channelFilter] : recent;
  res.json(filtered.slice(offset, offset + PAGE_SIZE));
});

// ---------------- 메시지 쓰기 (제한: 한글 200자, IP당 1분 1회) ----------------
app.post('/write',(req,res)=>{
  // 클라이언트 IP 얻기 (trust proxy true로 설정됨)
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  // rate limit check
  const lastTs = lastPostByIP[ip];
  if(lastTs && (now - lastTs) < POST_INTERVAL_MS){
    const wait = Math.ceil((POST_INTERVAL_MS - (now - lastTs)) / 1000);
    return res.status(429).send(`너무 잦은 게시: ${wait}초 후에 다시 시도하세요`);
  }

  let text = (req.body.text || '').toString().trim();
  let privateChannel = (req.body.privateChannel || '').toString().slice(0,50).trim();
  let channel = privateChannel || (req.body.channel || '대한민국').toString().slice(0,50);

  // length check (문자 단위)
  if(charLength(text) > MAX_TEXT){
    return res.status(400).send(`메시지 길이 제한: 최대 ${MAX_TEXT}자 까지 가능합니다`);
  }
  if(!text){
    return res.status(400).send('내용 없음');
  }

  const msg = { ts: new Date().toISOString(), channel, text };

  // in-memory update
  recent.unshift(msg);
  if(recent.length > MAX_RECENT) recent.pop();
  buildChannelIndex();

  // 배치 큐에 넣기 (flush는 setInterval로 처리)
  writeQueue.push(msg);

  // 기록 시점 저장 (rate-limit)
  lastPostByIP[ip] = now;

  // 성공하면 메인으로 리다이렉트
  res.redirect('/');
});

// ---------------- 서버 시작 ----------------
app.listen(PORT, ()=>console.log(`게시판 서버 시작: http://localhost:${PORT}`));
