const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_API = "https://notion-agent-nu.vercel.app/api/notion";

const DATABASES = {
  "Treinos": "56d73acd-0c97-4316-aad5-c28b4c52a54e",
  "Tarefas": "1fe2f4b1-9dc6-810c-8b83-d63961b5d0f0",
  "Ideias": "1fe2f4b1-9dc6-81a8-a6fb-fb4852661c6b",
  "Rastreador de habitos": "2002f4b1-9dc6-8109-95c2-dc280605f9fd",
  "Diario de Trade": "9f58ba70-4d9a-40e7-8508-3a6c39495ab4",
  "Notas": "1fe2f4b1-9dc6-81a3-bde3-e4df1000173d"
};

async function sendTelegram(chat_id, text) {
  await fetch("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
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

  try {
    const today = new Date().toISOString().split("T")[0];

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: "Voce e o assistente pessoal do Sebastian, integrado ao Notion dele. Hoje e " + today + ". Databases: Treinos:56d73acd-0c97-4316-aad5-c28b4c52a54e, Tarefas:1fe2f4b1-9dc6-810c-8b83-d63961b5d0f0, Ideias:1fe2f4b1-9dc6-81a8-a6fb-fb4852661c6b, Diario de Trade:9f58ba70-4d9a-40e7-8508-3a6c39495ab4, Notas:1fe2f4b1-9dc6-81a3-bde3-e4df1000173d. Treinos tem: Treino(titulo), Rotina(select: A: Ombros e Abdomen, B: Pernas Completa, C: Peitoral e Triceps, D: Costas e Biceps), Status(select: Nao Feito, Concluido, A Fazer), Data(date YYYY-MM-DD), Observacoes(text). Responda APENAS JSON puro: para conversa: {action:chat,response:texto}. Para salvar treino: {action:save,database_id:56d73acd-0c97-4316-aad5-c28b4c52a54e,database_name:Treinos,fields:{titulo:nome,rotina:opcao ou null,status:Concluido,data:" + today + ",observacoes:obs ou null},confirmation:msg}. Para outros: {action:save_simple,database_id:ID,database_name:NOME,title:titulo,confirmation:msg}. Regras: treino->save, tarefa->save_simple Tarefas, ideia->save_simple Ideias, trade->save_simple Diario de Trade, saudacao/pergunta->chat.",
        messages: [{ role: "user", content: text }]
      })
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) {
      await sendTelegram(chat_id, "Erro: " + claudeData.error.message);
      return res.status(200).end();
    }

    const rawText = claudeData.content?.[0]?.text || "";
    const jsonMatch = rawText.match(/{[sS]*}/);
    if (!jsonMatch) {
      await sendTelegram(chat_id, rawText || "Nao entendi, tente novamente.");
      return res.status(200).end();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.action === "chat") {
      await sendTelegram(chat_id, parsed.response);
      return res.status(200).end();
    }

    await sendTelegram(chat_id, "Salvando no Notion...");

    if (parsed.action === "save") {
      const f = parsed.fields;
      const properties = { "Treino": { title: [{ text: { content: f.titulo } }] } };
      if (f.rotina) properties["Rotina"] = { select: { name: f.rotina } };
      if (f.status) properties["Status"] = { select: { name: f.status } };
      if (f.data) properties["Data"] = { date: { start: f.data } };
      if (f.observacoes) properties["Observacoes"] = { rich_text: [{ text: { content: f.observacoes } }] };

      const r = await fetch(NOTION_API + "?action=create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_id: parsed.database_id, properties })
      });

      if (r.ok) {
        await sendTelegram(chat_id, "Treinos
" + parsed.confirmation);
      } else {
        const err = await r.json();
        await sendTelegram(chat_id, "Erro: " + JSON.stringify(err).slice(0, 150));
      }
      return res.status(200).end();
    }

    if (parsed.action === "save_simple") {
      const propsRes = await fetch(NOTION_API + "?action=db-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_id: parsed.database_id })
      });
      const propsData = await propsRes.json();
      const titleField = Object.entries(propsData.properties || {}).find(([, v]) => v.type === "title")?.[0] || "Name";

      const r = await fetch(NOTION_API + "?action=create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          database_id: parsed.database_id,
          properties: { [titleField]: { title: [{ text: { content: parsed.title } }] } }
        })
      });

      if (r.ok) {
        await sendTelegram(chat_id, parsed.database_name + "
" + parsed.confirmation);
      } else {
        await sendTelegram(chat_id, "Erro ao salvar.");
      }
    }

  } catch (e) {
    await sendTelegram(chat_id, "Erro: " + e.message);
  }

  res.status(200).end();
}
