export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS handling
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Unsplash Image Search (GET)
    if (request.method === "GET" && url.pathname === "/unsplash") {
      const id = parseInt(url.searchParams.get("id")) || 1;
      const accessKey = env.UNSPLASH_ACCESS_KEY;

      if (!accessKey) {
        return new Response(JSON.stringify({ error: "Unsplash API Key not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      const query = "apartment interior living room bedroom home";
      const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=50&page=1&orientation=landscape&content_filter=high&order_by=relevant&client_id=${accessKey}`;

      try {
        const res = await fetch(unsplashUrl);
        if (!res.ok) {
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const data = await res.json();
        const results = data.results || [];

        // Filtering logic
        const ngWords = ['3d', 'render', 'rendering', 'illustration', 'cartoon', 'isometric', 'minimalist illustration', 'abstract', 'graphic'];
        const ceilingNgWords = ['ceiling', 'corner', 'wall texture', 'close up', 'door frame'];
        const mustWords = ['interior', 'apartment', 'living room', 'bedroom', 'room', 'sofa', 'couch', 'home', 'apartment interior'];

        const good = results.filter(photo => {
          if (!photo.urls || !photo.urls.small) return false;

          const texts = [
            photo.description,
            photo.alt_description,
            ...(photo.tags || []).map(t => t.title)
          ].filter(Boolean).map(t => t.toLowerCase());

          if (texts.length === 0) return false;

          const hasNg = ngWords.some(ng => texts.some(t => t.includes(ng)));
          if (hasNg) return false;

          const hasCeilingNg = ceilingNgWords.some(ng => texts.some(t => t.includes(ng)));
          if (hasCeilingNg) return false;

          const hasMust = mustWords.some(mw => texts.some(t => t.includes(mw)));
          if (!hasMust) return false;

          return true;
        });

        const pool = good.length > 0 ? good : results;
        if (pool.length === 0) {
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        // Seeded random selection
        const chosen = [];
        const seed = id * 7919;
        const n = pool.length;

        for (let i = 0; i < 3; i++) {
          const idx = (seed + i) % n;
          chosen.push(pool[idx].urls.small);
        }

        return new Response(JSON.stringify(chosen), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // AI Recommendation (POST)
    if (request.method === "POST") {
      try {
        const { userReq, topCandidates, regionProfiles = {} } = await request.json();

        if (!userReq || !topCandidates) {
          return new Response("Missing data", { status: 400 });
        }

        const prompt = `
          Role: Real estate recommendation expert.
          Task: Analyze the Candidate Houses and recommend TOP 2-3 NEIGHBORHOODS (e.g. specific Dong or Gu name present in addresses) for the user.
          
          User Requirements:
          ${JSON.stringify(userReq)}
          
          Candidate Houses (Pre-calculated avgCommuteDist included, plus region_profile describing the neighborhood's strengths for walk/running/pet/gym/concert/cafe/hiking/baseball):
          ${JSON.stringify(topCandidates)}

          Region Profiles (unique per neighborhood):
          ${JSON.stringify(regionProfiles)}

          Active Lifestyle Filters (must be referenced in explanations; each object contains key+label):
          ${JSON.stringify(userReq.activeLifestyle || [])}

          Rules:
          1. Group houses by neighborhood (based on address).
          2. PRIORITIZE COMMUTE DISTANCE ABOVE ALL ELSE. The neighborhood with the shortest average commute distance must be strongly considered. Lifestyle match is secondary.
          3. Leverage region_profile notes alongside each house's lifestyle data to judge how well the area's character fits the user's needs.
          4. For every recommendation reason, explicitly mention which selected lifestyle labels (e.g. '산책', '카페') are satisfied and cite concrete evidence (region_profile or house lifestyle metrics). If no lifestyle filter is active, explain the neighborhood's general strengths.
          5. Output Format: JSON only. No markdown.
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
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
};
