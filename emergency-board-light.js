const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;
const LOGFILE = "./messages.json";

let messages = [];
if (fs.existsSync(LOGFILE)) {
  try { messages = JSON.parse(fs.readFileSync(LOGFILE, "utf8")); }
  catch { messages = []; }
}

app.use(bodyParser.json());
app.use(express.static(__dirname));

// ✅ 메시지 목록 (페이지네이션)
app.get("/api/messages", (req, res) => {
  const page = parseInt(req.query.page || "1");
  const limit = 20;
  const start = (page - 1) * limit;
  const end = start + limit;
  const data = messages.slice().reverse().slice(start, end);
  res.json({
    total: messages.length,
    pages: Math.ceil(messages.length / limit),
    page,
    data
  });
});

// ✅ 메시지 전송
app.post("/api/messages", (req, res) => {
  const { time, channel, nickname, text } = req.body;
  if (!text || !channel) return res.status(400).send("Invalid data");
  const msg = { id: Date.now(), time, channel, nickname: nickname || "익명", text };
  messages.push(msg);
  if (messages.length > 10000) messages.shift();
  fs.writeFileSync(LOGFILE, JSON.stringify(messages, null, 2));
  res.json({ success: true });
});

app.listen(PORT, () =>
  console.log(`✅ Emergency board v3 running: http://localhost:${PORT}`)
);
