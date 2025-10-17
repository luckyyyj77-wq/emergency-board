// emergency-board-light.js
const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;
const LOGFILE = "./messages.json";

let messages = [];
let announcements = [
  "⚠️ 오늘 밤 11시~12시 🔥 긴급 공지: 지진 발생 시 안전지대로 이동하세요"
];

// --- 파일에서 메시지 불러오기 (서버 재시작 후 유지됨) ---
if (fs.existsSync(LOGFILE)) {
  try {
    messages = JSON.parse(fs.readFileSync(LOGFILE, "utf8"));
  } catch {
    messages = [];
  }
}

// --- 본문 파서 ---
app.use(bodyParser.json());
app.use(express.static(__dirname)); // index.html 서빙

// --- API: 메시지 목록 가져오기 ---
app.get("/api/messages", (req, res) => {
  res.json(messages.slice(-200)); // 최근 200개만 반환
});

// --- API: 메시지 작성 ---
app.post("/api/messages", (req, res) => {
  const msg = req.body;
  if (!msg.text || !msg.channel) return res.status(400).send("Invalid data");

  messages.push(msg);
  if (messages.length > 200) messages.shift();

  fs.writeFileSync(LOGFILE, JSON.stringify(messages, null, 2)); // 영구 저장
  res.json({ success: true });
});

// --- 서버 실행 ---
app.listen(PORT, () =>
  console.log(`✅ Emergency board running on http://localhost:${PORT}`)
);
