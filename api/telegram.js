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

async function getDbProperties(database_id) {
  const r = await fetch(`${NOTION_API}?action=db-properties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ database_id })
  });
  const d = await r.json();
  return d.properties || {};
}

async function createNotionEntry(database_id, properties) {
  const r = await fetch(`${NOTION_API}?action=create-task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ database_id, properties })
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).end();

  const { message } = req.body;
  if (!message?.text) return res.status(200).end();

  const chat_id = message.chat.id;
  const text = message.text;

  try {
    await sendTelegram(chat_id, "⏳ Processando...");

    // Ask Claude what to do
    const dbList = Object.entries(DATABASES).map(([name, id]) => `- ${name} (id: ${id})`).join("\n");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `Você é um agente que salva informações no Notion do usuário.
Databases disponíveis:
${dbList}

Com base na mensagem do usuário, decida qual database usar e quais propriedades preencher.
Responda APENAS com JSON válido neste formato:
{
  "database_id": "id do database escolhido",
  "database_name": "nome do database",
  "properties": {
    "Name": { "title": [{ "text": { "content": "título aqui" } }] }
  },
  "confirmation": "mensagem curta confirmando o que foi salvo"
}

Regras:
- Sempre inclua a propriedade title/Name
- Para datas use formato YYYY-MM-DD
- Se não souber qual database usar, use Tarefas
- A confirmation deve ser em português, amigável e curta`,
        messages: [{ role: "user", content: text }]
      })
    });

    const claudeData = await claudeRes.json();
    const claudeText = claudeData.content?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(claudeText.replace(/```json|```/g, "").trim());
    } catch {
      await sendTelegram(chat_id, "❌ Não entendi. Tente ser mais específico, ex: *'Treino de peito hoje'* ou *'Tarefa: ligar pro cliente'*");
      return res.status(200).end();
    }

    // Get db properties to build correct structure
    const dbProps = await getDbProperties(parsed.database_id);
    
    // Merge Claude's properties with correct title field name
    const titleField = Object.entries(dbProps).find(([, v]) => v.type === "title")?.[0] || "Name";
    if (titleField !== "Name" && parsed.properties["Name"]) {
      parsed.properties[titleField] = parsed.properties["Name"];
      delete parsed.properties["Name"];
    }

    const ok = await createNotionEntry(parsed.database_id, parsed.properties);

    if (ok) {
      await sendTelegram(chat_id, `✅ *${parsed.database_name}*\n${parsed.confirmation}`);
    } else {
      await sendTelegram(chat_id, "❌ Erro ao salvar no Notion. Tente novamente.");
    }

  } catch (e) {
    await sendTelegram(chat_id, "❌ Erro interno. Tente novamente.");
  }

  res.status(200).end();
}
