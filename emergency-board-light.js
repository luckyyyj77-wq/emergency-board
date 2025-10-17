// v3.1 최종 — 데스크탑 확장, 지역/사설 채널, 닉네임(4자), 페이지네이션, 검색/필터,
// 공지 네온(스크롤X), 파일 영구저장, 10초 제한(클/서버), 공지 관리자 편집(비번)
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// ── 저장 파일 경로 ─────────────────────────────────────────────────────────────
const DATA_DIR = __dirname;
const MSG_FILE = path.join(DATA_DIR, "messages.json");   // 메시지 저장
const NOTICE_FILE = path.join(DATA_DIR, "notice.txt");   // 공지 저장 (단일 문자열)

// ── 관리자 비번 (환경변수 우선, 없으면 기본값) ────────────────────────────────
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// ── 전역 상태 ────────────────────────────────────────────────────────────────
let messages = [];   // [{id,time,channel,nickname,text}]
let noticeText = "🌐 대한민국(통합) 긴급 커뮤니티 채널 — 유의사항을 확인하세요.";
const ipLastPost = {};  // 서버측 10초 게시 제한

// ── 초기 로드: 메시지 & 공지 ─────────────────────────────────────────────────
if (fs.existsSync(MSG_FILE)) {
  try { messages = JSON.parse(fs.readFileSync(MSG_FILE, "utf8")); }
  catch { messages = []; }
}
if (fs.existsSync(NOTICE_FILE)) {
  try { noticeText = fs.readFileSync(NOTICE_FILE, "utf8") || noticeText; }
  catch { /* ignore */ }
}

// ── 미들웨어 ────────────────────────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname));  // index.html, 정적자원

// ── 유틸: 안전 저장 ───────────────────────────────────────────────────────────
function saveMessages() {
  fs.writeFileSync(MSG_FILE, JSON.stringify(messages, null, 2));
}
function saveNotice() {
  fs.writeFileSync(NOTICE_FILE, noticeText, "utf8");
}

// ── 시간 포맷(KST) 서버변환(클라가 못보내면 서버가 보완) ────────────────────
function nowKST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 60 * 60000);
  return kst.toLocaleTimeString("ko-KR", { hour12: false });
}

// ── 메시지 조회(페이지네이션 + 검색 + 채널 필터) ─────────────────────────────
app.get("/api/messages", (req, res) => {
  // 쿼리: page=1, limit=20, q=키워드, channel=필터채널
  const page = Math.max(parseInt(req.query.page || "1"), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20"), 5), 100);
  const q = (req.query.q || "").toString().trim();
  const channel = (req.query.channel || "").toString().trim();

  // 필터링
  let arr = messages;
  if (channel) {
    arr = arr.filter(m => m.channel === channel);
  }
  if (q) {
    const k = q.toLowerCase();
    arr = arr.filter(m =>
      (m.text && m.text.toLowerCase().includes(k)) ||
      (m.nickname && m.nickname.toLowerCase().includes(k)) ||
      (m.channel && m.channel.toLowerCase().includes(k))
    );
  }

  // 최신글 우선 (저장은 오래→최근, 표시는 최근→오래)
  const sorted = arr.slice().reverse();
  const total = sorted.length;
  const pages = Math.max(Math.ceil(total / limit), 1);
  const start = (page - 1) * limit;
  const data = sorted.slice(start, start + limit);

  res.json({ total, pages, page, data });
});

// ── 메시지 작성(서버측 10초 제한 + 사이즈 제한 + KST 보완) ───────────────────
app.post("/api/messages", (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString();
  const now = Date.now();
  const LIMIT_MS = 10 * 1000; // 10초

  if (ipLastPost[ip] && now - ipLastPost[ip] < LIMIT_MS) {
    return res.status(429).send("10초 후 다시 시도하세요.");
  }

  let { time, channel, nickname, text } = req.body;
  text = (text || "").toString().trim();
  channel = (channel || "").toString().trim();
  nickname = (nickname || "").toString().trim().slice(0, 4);

  if (!text || !channel) return res.status(400).send("Invalid data");
  if (!time) time = nowKST(); // 클라가 시간 안 보냈으면 서버가 보완

  const msg = {
    id: Date.now(),
    time,
    channel,
    nickname: nickname || "익명",
    text: text.slice(0, 500) // 안전상 하드컷
  };

  messages.push(msg);
  if (messages.length > 10000) messages.shift(); // 오래된 것 정리
  saveMessages();

  ipLastPost[ip] = now;
  res.json({ success: true });
});

// ── 공지 조회/수정(관리자) ───────────────────────────────────────────────────
app.get("/api/notice", (req, res) => {
  res.json({ text: noticeText });
});
app.post("/api/notice", (req, res) => {
  const { text, pass } = req.body;
  if (pass !== ADMIN_PASS) return res.status(403).send("Forbidden");
  noticeText = (text || "").toString().trim() || noticeText;
  saveNotice();
  res.json({ success: true });
});

// ── 서버 시작 ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Emergency board v3.1 running: http://localhost:${PORT}`);
});
