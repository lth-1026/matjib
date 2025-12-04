export default {
  async fetch(request, env, ctx) {
    // CORS handling
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const { userReq, topCandidates } = await request.json();

      if (!userReq || !topCandidates) {
        return new Response("Missing data", { status: 400 });
      }

      const prompt = `
        Role: Real estate recommendation expert.
        Task: Analyze the Candidate Houses and recommend TOP 2-3 NEIGHBORHOODS (e.g. specific Dong or Gu name present in addresses) for the user.
        
        User Requirements:
        ${JSON.stringify(userReq)}
        
        Candidate Houses (Pre-calculated avgCommuteDist included):
        ${JSON.stringify(topCandidates)}
        
        Rules:
        1. Group houses by neighborhood (based on address).
        2. Evaluate each neighborhood based on commute distance and lifestyle match.
        3. Output Format: JSON only. No markdown.
        {
            "recommendations": [
                {
                    "keyword": "String (e.g. '자양동')",
                    "reason": "String (Korean explanation)"
                },
                {
                    "keyword": "String (e.g. '화양동')",
                    "reason": "String (Korean explanation)"
                }
            ]
        }
      `;

      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });

      const data = await openAiRes.json();

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
