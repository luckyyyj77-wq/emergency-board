// emergency-board-light.js (완전 통합·폭주 대비·AJAX 관리자 패널 + 1분 제한)
const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const LOGFILE = './messages.log';
const PORT = 3000;
const MAX_TEXT = 256;
const MAX_RECENT = 200;
const PAGE_SIZE = 50;
const BATCH_INTERVAL = 500; // 0.5초마다 배치 기록
const ADMIN_PASS = 'admin123';
const SCROLL_FONT_SIZE = 28;
const USER_LIMIT_INTERVAL = 60*1000; // 1분 제한
let recent = [];
let announcements = [
  "⚠️ 서버 점검 예정: 오늘 밤 11시~12시 🔥 긴급 공지: 지진 발생 시 안전지대로 이동하세요"
];
let writeQueue = [];
let channelIndex = {};
let lastPostTime = {}; // 사용자별 마지막 작성 시간 (ip 기준)

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
    const lines=fs.readFileSync(LOGFILE,'utf8').trim().split('\n').slice(-MAX_RECENT);
    recent = lines.map(l=>JSON.parse(l)).reverse();
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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:monospace;font-size:14px;margin:5px;}
h1{margin:2px 0;font-size:18px;}
table{border-collapse:collapse;width:100%;}
td,th{border:1px solid #000;padding:2px;}
#messages table tr:nth-child(even){background:#f0f0f0;}
#messages table tr:nth-child(odd){background:#ffffff;}
textarea{width:100%;height:60px;}
input[type=submit],select,input[type=text]{margin:2px 2px 2px 0;vertical-align:middle;}
.announcement{background:#fffae6;height:50px;overflow:hidden;white-space:nowrap;font-size:${SCROLL_FONT_SIZE}px;font-weight:bold;
animation:scrollAnn 40s linear infinite;}
@keyframes scrollAnn{0%{transform:translateX(100%);}100%{transform:translateX(-100%);}}
.instructions{font-weight:bold;}
.form-inline{display:flex;flex-wrap:wrap;align-items:center;gap:2px;}
.form-inline select,.form-inline input[type=text]{flex:1;}
#messages{max-height:400px;overflow:auto;}
.footer{margin-top:10px;font-size:12px;color:#555;}
.warn{color:red;font-weight:bold;margin:5px 0;}
@media(max-width:600px){
textarea{height:50px;}
.form-inline{flex-direction:column;align-items:stretch;}
input[type=submit]{width:100%;}
}
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
<div id="warnMsg" class="warn"></div>
<form id="postForm" class="form-inline">
<select name="channel">${buildChannelOptions()}</select>
<input type="text" name="privateChannel" placeholder="사설 채널 입력">
<textarea name="text" placeholder="메시지 입력"></textarea>
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
const postForm=document.getElementById('postForm');
const warnDiv=document.getElementById('warnMsg');

postForm.addEventListener('submit', function(e){
  e.preventDefault();
  const formData=new FormData(postForm);
  fetch('/write',{method:'POST',body:formData})
    .then(res=>{
      if(res.status===429) warnDiv.textContent='⚠️ 1분에 한 번만 작성 가능합니다.';
      else if(res.status===400) warnDiv.textContent='내용이 없습니다.';
      else{ warnDiv.textContent=''; window.location.reload(); }
    });
});

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
</script>
</body></html>`);
});

// ---------------- 메시지 쓰기 ----------------
app.post('/write',(req,res)=>{
  let ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;
  let now=Date.now();
  if(lastPostTime[ip] && now - lastPostTime[ip] < USER_LIMIT_INTERVAL) return res.sendStatus(429);

  let text=(req.body.text||'').slice(0,MAX_TEXT);
  let privateChannel=(req.body.privateChannel||'').slice(0,50).trim();
  let channel=privateChannel || (req.body.channel||'대한민국').slice(0,50);
  if(!text.trim()) return res.status(400).send('empty');

  const msg={ts:new Date().toISOString(),channel,text};
  recent.unshift(msg);
  if(recent.length>MAX_RECENT) recent.pop();
  buildChannelIndex();
  writeQueue.push(msg);
  lastPostTime[ip]=now;

  res.sendStatus(200);
});

// ---------------- 나머지 관리자 기능, 공지, 삭제 등은 기존 그대로 ----------------
// (필요하면 이전 코드에서 /admin 패널 그대로 붙이면 됨)

// ---------------- 서버 시작 ----------------
app.listen(PORT,()=>console.log(`게시판 서버 시작: http://localhost:${PORT}`));
