<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>대한민국 통합 게시판</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <style>
    /* ===== 기본 배경 및 폰트 ===== */
    body {
      background-color: #111;
      color: white;
      font-family: 'Pretendard', sans-serif;
      text-align: center;
      margin: 0;
      padding: 20px;
    }

    /* ===== 공지 네온 효과 ===== */
    .notice {
      font-size: 20px;
      margin-bottom: 15px;
      animation: neonGlow 1.5s infinite alternate;
    }

    @keyframes neonGlow {
      0% { color: #00ffff; text-shadow: 0 0 5px #00ffff; }
      50% { color: #ff00ff; text-shadow: 0 0 10px #ff00ff; }
      100% { color: #ffff00; text-shadow: 0 0 5px #ffff00; }
    }

    /* ===== 메시지 박스 ===== */
    #messages {
      width: 95%;
      max-width: 700px;
      margin: 0 auto;
      border: 1px solid #444;
      border-radius: 10px;
      background-color: #1a1a1a;
      padding: 10px;
      height: 350px;
      overflow-y: auto;
      text-align: left;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      color: white;
    }

    th, td {
      padding: 8px;
      border-bottom: 1px solid #333;
    }

    th {
      background-color: #222;
    }

    /* ===== 각 칸 비율 ===== */
    td.time {
      width: 15%;
      font-size: 13px;
      color: #aaa;
    }

    td.channel {
      width: 15%;
      font-size: 13px;
      color: #66ccff;
      text-align: center;
    }

    td.content {
      width: 70%;
      word-break: break-word;
    }

    /* ===== 입력 UI ===== */
    input, select {
      padding: 8px;
      border-radius: 5px;
      border: none;
      margin: 5px;
    }

    input {
      width: 50%;
    }

    button {
      padding: 8px 14px;
      border: none;
      border-radius: 5px;
      background-color: #00bfff;
      color: white;
      cursor: pointer;
    }

    button:hover {
      background-color: #0080ff;
    }

    /* ===== 모바일 대응 ===== */
    @media (max-width: 600px) {
      td.time { display: none; } /* 모바일에서는 시간 칸 숨김 */
      td.channel { width: 25%; }
      td.content { width: 75%; font-size: 15px; }
      input { width: 70%; }
    }
  </style>
</head>
<body>
  <div class="notice">🌐 대한민국(통합) 긴급 커뮤니티 채널</div>

  <div id="messages">
    <table id="messageTable">
      <thead>
        <tr><th>시간</th><th>채널</th><th>내용</th></tr>
      </thead>
      <tbody id="messageBody"></tbody>
    </table>
  </div>

  <div style="margin-top:15px;">
    <select id="channelSelect">
      <option>일반</option>
      <option>긴급</option>
      <option>정보</option>
      <option>공지</option>
    </select>
    <input id="messageInput" type="text" placeholder="메시지를 입력하세요">
    <button onclick="sendMessage()">전송</button>
  </div>

  <script>
    const messageBody = document.getElementById("messageBody");
    const input = document.getElementById("messageInput");
    const channelSelect = document.getElementById("channelSelect");
    const SERVER_URL = "https://one19-board.onrender.com/api/messages";

    /* ===== 1️⃣ 대한민국 표준시(KST) ===== */
    function getKSTTime() {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const kst = new Date(utc + 9 * 60 * 60000);
      return kst.toLocaleTimeString('ko-KR', { hour12: false });
    }

    /* ===== 2️⃣ 메시지 불러오기 ===== */
    async function loadMessages() {
      try {
        const res = await fetch(SERVER_URL);
        const data = await res.json();
        messageBody.innerHTML = "";
        data.forEach(m => addMessageToDOM(m.time, m.channel, m.text));
      } catch {
        console.log("메시지 불러오기 실패");
      }
    }

    /* ===== 3️⃣ 메시지 DOM 표시 ===== */
    function addMessageToDOM(time, channel, text) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="time">${time}</td>
        <td class="channel">${channel}</td>
        <td class="content">${text}</td>
      `;
      messageBody.appendChild(row);
    }

    /* ===== 4️⃣ 10초 제한 ===== */
    let lastPostTime = 0; 
    const POST_LIMIT_MS = 10000; // ⚙️ 수정 가능: 10초 제한 (10000ms = 10초)

    /* ===== 5️⃣ 메시지 전송 ===== */
    async function sendMessage() {
      const now = Date.now();
      if (now - lastPostTime < POST_LIMIT_MS) {
        alert("⚠️ 너무 빠릅니다. 10초 후 다시 시도하세요.");
        return;
      }
      const text = input.value.trim();
      const channel = channelSelect.value;
      if (!text) return;

      const msg = { time: getKSTTime(), channel, text };

      try {
        await fetch(SERVER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg)
        });
        addMessageToDOM(msg.time, msg.channel, msg.text);
        input.value = "";
        lastPostTime = now; // 마지막 전송 시각 기록
      } catch {
        alert("전송 실패. 네트워크를 확인하세요.");
      }
    }

    /* ===== 6️⃣ 자동 갱신 (5초마다 새로 불러오기) ===== */
    loadMessages();
    setInterval(loadMessages, 5000);
  </script>
</body>
</html>
