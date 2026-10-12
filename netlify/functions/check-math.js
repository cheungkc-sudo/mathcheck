// netlify/functions/check-math.js

exports.handler = async (event) => {
  // 1. Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { imageBase64, targetGrade = "F.2 - F.4" } = JSON.parse(event.body || "{}");

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image payload received." }),
      };
    }

    // Strip data URL header if present (e.g., 'data:image/jpeg;base64,')
    const cleanedBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    // Choose Gemini 1.5 Flash (fast & generous free tier) or Gemini 1.5 Pro
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "API key not configured in Netlify environment variables.",
        }),
      };
    }

    const systemPrompt = `
You are a senior Hong Kong Secondary School Mathematics Teacher for an EMI (English as the Medium of Instruction) school, aligned with the HK DSE curriculum.

INSPECT THE STUDENT'S HANDWRITTEN MATH PHOTO AND RETURN ONLY A STRICT JSON OBJECT:
{
  "problem_transcription": "Brief statement of the question and given parameters",
  "overall_status": "CORRECT" | "INCORRECT" | "AMBIGUOUS",
  "topic": "e.g. Mensuration: Total Surface Area | Quadratic Equations | Deductive Geometry",
  "misconception_type": "e.g. Omitted base area | Sign transposition | None",
  "awarded_xp": 25,
  "steps": [
    {
      "step_number": 1,
      "latex": "TSA = 2\\pi rh + 2\\pi r^2",
      "status": "correct" | "incorrect" | "uncertain",
      "teacher_comment": "Clean formula definition."
    }
  ],
  "socratic_hint": {
    "target_step_number": 2,
    "hint_level_1": "Targeted question prompting student to check that specific step",
    "hint_level_2": "Slightly more explicit prompt regarding the rule or formula",
    "growth_mindset_message": "Warm, encouraging message praising their effort"
  },
  "ambiguity_notice": null or "Describe any unclear handwriting (e.g. z vs 2) if detected"
}

PEDAGOGICAL RULES (CRITICAL):
1. NEVER reveal the final numerical answer or write out the corrected formula in the hint.
2. Pinpoint the exact step number where the error occurred.
3. For Mensuration (TSA/Volumes): Check if base circular areas ($2\\pi r^2$) were forgotten in closed solids, or if perpendicular height ($h$) was accidentally swapped for slant height ($l$).
4. For Algebra: Watch for sign flips across '=' and incorrect binomial expansion.
5. If handwriting is illegible or ambiguous, set overall_status to "AMBIGUOUS" and explain what needs clarification.
6. Tone: Supportive, polite, professional Hong Kong secondary EMI teacher tone.
`;

    // 2. Call Google Gemini 1.5 API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: cleanedBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Vision API error: ${errText}` }),
      };
    }

    const data = await response.json();
    const rawAiReply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawAiReply) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Empty response received from Vision AI." }),
      };
    }

    const parsedJson = JSON.parse(rawAiReply);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(parsedJson),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Internal server error." }),
    };
  }
};
