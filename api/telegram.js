const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_API = "https://notion-agent-nu.vercel.app/api/notion";

const DATABASES = {
  "Treinos": "56d73acd-0c97-4316-aad5-c28b4c52a54e",
  "Tarefas": "1fe2f4b1-9dc6-810c-8b83-d63961b5d0f0",
  "Ideias": "1fe2f4b1-9dc6-81a8-a6fb-fb4852661c6b",
  "Rastreador de hábitos": "2002f4b1-9dc6-8109-95c2-dc280605f9fd",
  "Diário de Trade": "9f58ba70-4d9a-40e7-8508-3a6c39495ab4",
  "Notas": "1fe2f4b1-9dc6-81a3-bde3-e4df1000173d",
  "Menu": "1fe2f4b1-9dc6-813a-9401-f05b6d96d059",
  "Backtesting Bots": "851a615f-dc7d-4b27-bffe-8d6351c119e1",
  "Backtesting Manual": "089464f9-bdb0-4c4c-b05f-7ccaba799ab1",
  "Ficha": "1fe2f4b1-9dc6-81c1-b126-c30da17fbfc5"
};

async function sendTelegram(chat_id, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "Markdown" })
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).end();
  const { message } = req.body;
  if (!message?.text) return res.status(200).end();

  const chat_id = message.chat.id;
  const text = message.text;

  await sendTelegram(chat_id, "⏳ Processando...");

  try {
    const dbList = Object.entries(DATABASES).map(([name, id]) => `${name}: ${id}`).join("\n");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: `Você é um assistente que salva dados no Notion do usuário Sebastian.

Databases disponíveis:
${dbList}

IMPORTANTE: Responda SEMPRE com JSON válido neste formato exato:
{"database_id":"ID_AQUI","database_name":"NOME_AQUI","title":"TITULO_AQUI","confirmation":"mensagem curta em português confirmando o que foi salvo"}

Escolha o database mais adequado para a mensagem do usuário.
Se for treino → Treinos
Se for tarefa/lembrete → Tarefas  
Se for ideia → Ideias
Se for trade → Diário de Trade
Se não souber → Tarefas`,
        messages: [{ role: "user", content: text }]
      })
    });

    const claudeData = await claudeRes.json();
    
    if (claudeData.error) {
      await sendTelegram(chat_id, `❌ Erro API: ${claudeData.error.message}`);
      return res.status(200).end();
    }

    const rawText = claudeData.content?.[0]?.text || "";
    
    const jsonMatch = rawText.match(/\{[^{}]*\}/);
    if (!jsonMatch) {
      await sendTelegram(chat_id, `❌ Resposta inválida: ${rawText.slice(0, 200)}`);
      return res.status(200).end();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const propsRes = await fetch(`${NOTION_API}?action=db-properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ database_id: parsed.database_id })
    });
    const propsData = await propsRes.json();
    const titleField = Object.entries(propsData.properties || {}).find(([, v]) => v.type === "title")?.[0] || "Name";

    const createRes = await fetch(`${NOTION_API}?action=create-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        database_id: parsed.database_id,
        properties: {
          [titleField]: { title: [{ text: { content: parsed.title } }] }
        }
      })
    });

    if (createRes.ok) {
      await sendTelegram(chat_id, `✅ *${parsed.database_name}*\n${parsed.confirmation}`);
    } else {
      const err = await createRes.json();
      await sendTelegram(chat_id, `❌ Notion: ${JSON.stringify(err).slice(0, 150)}`);
    }

  } catch (e) {
    await sendTelegram(chat_id, `❌ Erro: ${e.message}`);
  }

  res.status(200).end();
}
