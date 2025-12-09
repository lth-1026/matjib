export default async function handler(req, res) {
  // CORS Response helper
  const setCors = (res) => {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )
  }

  if (req.method === 'OPTIONS') {
    setCors(res)
    res.status(200).end()
    return
  }

  if (req.method === 'POST') {
    setCors(res)
    try {
      const { userReq, topCandidates, regionProfiles = {} } = req.body;

      if (!userReq || !topCandidates) {
        return res.status(400).send("Missing data");
      }

      const prompt = `
          Role: Real estate recommendation expert.
          Task: Analyze the Candidate Houses and recommend TOP 2-3 NEIGHBORHOODS (e.g. specific Dong or Gu name present in addresses) for the user.
          
          User Requirements:
          ${JSON.stringify(userReq)}
          
          Candidate Houses (Pre-calculated avgCommuteDist included, plus region_profile describing the neighborhood's strengths for walk/running/pet/gym/performance/cafe/movie/sports):
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
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });

      const data = await openAiRes.json();
      return res.status(200).json(data);

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  setCors(res)
  return res.status(405).send("Method Not Allowed");
}
