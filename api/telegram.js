const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_API = "https://notion-agent-nu.vercel.app/api/notion";
const GCAL_API = "https://notion-agent-nu.vercel.app/api/gcal";

const DATABASES = {
  "Treinos": "56d73acd-0c97-4316-aad5-c28b4c52a54e",
  "Tarefas": "1fe2f4b1-9dc6-810c-8b83-d63961b5d0f0",
  "Ideias": "1fe2f4b1-9dc6-81a8-a6fb-fb4852661c6b",
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
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const timezone = "America/Sao_Paulo";

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: "Voce e o assistente pessoal do Sebastian. Hoje e " + today + ". Timezone: America/Sao_Paulo. Databases Notion: Treinos:56d73acd-0c97-4316-aad5-c28b4c52a54e (campos: Treino titulo, Rotina select A: Ombros e Abdomen/B: Pernas Completa/C: Peitoral e Triceps/D: Costas e Biceps, Status select Nao Feito/Concluido/A Fazer, Data date YYYY-MM-DD, Observacoes text), Tarefas:1fe2f4b1-9dc6-810c-8b83-d63961b5d0f0, Ideias:1fe2f4b1-9dc6-81a8-a6fb-fb4852661c6b, Diario de Trade:9f58ba70-4d9a-40e7-8508-3a6c39495ab4, Notas:1fe2f4b1-9dc6-81a3-bde3-e4df1000173d. Responda APENAS JSON puro sem markdown. Acoes possiveis: 1) Conversa: {action:chat,response:texto em portugues} 2) Salvar treino no Notion: {action:save_treino,database_id:56d73acd-0c97-4316-aad5-c28b4c52a54e,fields:{titulo:nome,rotina:opcao ou null,status:Concluido,data:YYYY-MM-DD,observacoes:texto ou null},confirmation:msg} 3) Salvar outro no Notion: {action:save_simple,database_id:ID,database_name:NOME,title:titulo,confirmation:msg} 4) Criar evento Google Agenda: {action:create_event,summary:titulo,date:YYYY-MM-DD,startTime:HH:MM,endTime:HH:MM,description:descricao ou null,confirmation:msg} 5) Ver agenda do dia: {action:list_events,date:YYYY-MM-DD,confirmation:msg}. Regras: treino/exercicio/musculacao->save_treino, tarefa/lembrete->save_simple Tarefas, ideia->save_simple Ideias, trade->save_simple Diario de Trade, evento/reuniao/compromisso/agendar->create_event, ver agenda/o que tenho hoje/amanha->list_events, saudacao/pergunta->chat.",
        messages: [{ role: "user", content: text }]
      })
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) {
      await sendTelegram(chat_id, "Erro Claude: " + claudeData.error.message);
      return res.status(200).end();
    }

    const rawText = claudeData.content?.[0]?.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await sendTelegram(chat_id, rawText || "Nao entendi, tente novamente.");
      return res.status(200).end();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Conversa normal
    if (parsed.action === "chat") {
      await sendTelegram(chat_id, parsed.response);
      return res.status(200).end();
    }

    // Criar evento no Google Agenda
    if (parsed.action === "create_event") {
      await sendTelegram(chat_id, "Criando evento na agenda...");
      const startDateTime = parsed.date + "T" + (parsed.startTime || "09:00") + ":00";
      const endDateTime = parsed.date + "T" + (parsed.endTime || "10:00") + ":00";

      const r = await fetch(GCAL_API + "?action=create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: parsed.summary,
          startDateTime,
          endDateTime,
          description: parsed.description || "",
          timezone
        })
      });

      if (r.ok) {
        await sendTelegram(chat_id, "Evento criado! " + parsed.confirmation);
      } else {
        const err = await r.text();
        await sendTelegram(chat_id, "Erro ao criar evento: " + err.slice(0, 150));
      }
      return res.status(200).end();
    }

    // Listar eventos do Google Agenda
    if (parsed.action === "list_events") {
      await sendTelegram(chat_id, "Buscando sua agenda...");
      const r = await fetch(GCAL_API + "?action=list&date=" + (parsed.date || today));

      if (r.ok) {
        const data = await r.json();
        if (!data.events || data.events.length === 0) {
          await sendTelegram(chat_id, "Nenhum evento encontrado para " + (parsed.date || today) + ".");
        } else {
          let msg = "Sua agenda para " + (parsed.date || today) + ":\n\n";
          data.events.forEach(ev => {
            const time = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) : "Dia todo";
            msg += "- " + time + " - " + ev.summary + "\n";
          });
          await sendTelegram(chat_id, msg);
        }
      } else {
        await sendTelegram(chat_id, "Erro ao buscar agenda.");
      }
      return res.status(200).end();
    }

    await sendTelegram(chat_id, "Salvando no Notion...");

    // Salvar treino
    if (parsed.action === "save_treino") {
      const f = parsed.fields;
      const properties = {
        "Treino": { title: [{ text: { content: f.titulo } }] }
      };
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
        await sendTelegram(chat_id, "Treino salvo! " + parsed.confirmation);
      } else {
        const err = await r.json();
        await sendTelegram(chat_id, "Erro: " + JSON.stringify(err).slice(0, 150));
      }
      return res.status(200).end();
    }

    // Salvar outros databases
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
        await sendTelegram(chat_id, parsed.database_name + " salvo! " + parsed.confirmation);
      } else {
        await sendTelegram(chat_id, "Erro ao salvar.");
      }
    }

  } catch (e) {
    await sendTelegram(chat_id, "Erro: " + e.message);
  }

  res.status(200).end();
}
