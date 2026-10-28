// Vercel 서버리스 함수: POST /api/chat  { messages: [{role, content}] }
// Claude가 find_spots · get_weather 를 스스로 골라 호출하며 제주 여행을 추천합니다.
// 환경변수 ANTHROPIC_API_KEY 가 필요합니다.
const { toolDefinitions, toolHandlers, spotCoords } = require("./tools");

const MODEL = "claude-sonnet-5-5";
const MAX_STEPS = 6;

const SYSTEM = `너는 제주 여행 추천 도우미다.
- 추천하기 전에 도구로 확인한다: 날씨는 get_weather, 장소는 find_spots.
- 비나 눈이 오면(outdoorOk가 false) 실내 장소를, 맑으면 야외 장소를 우선 고려한다.
- 장소는 find_spots 결과에 있는 것만 추천한다. 목록 밖 장소는 없다.
- 사용자가 지역을 말하지 않으면 한 번 되묻는다.
- 날짜를 말하지 않으면 오늘 기준으로 답한다.
- 답은 한국어로 짧고 친근하게, 추천 이유(날씨)를 한 줄 넣는다.`;

async function callClaude(messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: toolDefinitions,
      messages,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Claude API 오류 (${r.status})`);
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST로 요청해 주세요." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았어요." });
  }

  const input = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = input
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "질문을 입력해 주세요." });
  }

  const steps = []; // 화면에 보여줄 도구 호출 기록
  const spots = []; // 지도에 찍을 장소 (이름 · 설명 · 좌표)

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const data = await callClaude(messages);
      messages.push({ role: "assistant", content: data.content });

      if (data.stop_reason !== "tool_use") {
        const reply = data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return res.status(200).json({ reply, steps, spots });
      }

      const results = [];
      for (const block of data.content.filter((b) => b.type === "tool_use")) {
        const handler = toolHandlers[block.name];
        const output = handler
          ? await handler(block.input)
          : { error: `알 수 없는 도구: ${block.name}` };

        steps.push({ tool: block.name, input: block.input });
        if (block.name === "find_spots" && output.spots) {
          for (const s of output.spots) {
            if (!spots.some((x) => x.name === s.name)) {
              spots.push({ ...s, ...spotCoords[s.name] });
            }
          }
        }
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }
      messages.push({ role: "user", content: results });
    }
    return res.status(200).json({
      reply: "답을 정리하지 못했어요. 질문을 조금 더 구체적으로 해 주세요.",
      steps,
      spots,
    });
  } catch (e) {
    return res.status(502).json({ error: "추천을 만들지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
};
