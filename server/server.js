// ==========================================
// INTELLIGENT ELEVATOR - AI BACKEND
// ==========================================

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================
// SERVER CONFIGURATION
// ==========================================

app.use(express.json({ limit: "20kb" }));

const allowedOrigins = (process.env.WEBSITE_URL || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {

    // Allow requests without browser Origin, e.g. health checks.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed"));
  }
}));


// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {

  res.json({
    status: "online",
    service: "Intelligent Elevator AI Backend"
  });

});

app.get("/api/health", (req, res) => {

  res.json({
    status: "healthy",
    aiConfigured: Boolean(process.env.GROQ_API_KEY)
  });

});


// ==========================================
// AI ASSISTANT
// ==========================================

app.post("/api/assistant", async (req, res) => {

  try {

    // Check API key
    if (!process.env.GROQ_API_KEY) {

      return res.status(500).json({
        error: "Groq API key is not configured."
      });

    }

    const message = req.body.message;

    const currentFloor = Number(req.body.currentFloor);

    const history = Array.isArray(req.body.history)
      ? req.body.history.slice(-10)
      : [];

    // Validate user message
    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 1000
    ) {

      return res.status(400).json({
        error: "Please provide a valid message."
      });

    }

    // Validate current floor
    const validCurrentFloor =
      Number.isInteger(currentFloor) &&
      currentFloor >= 1 &&
      currentFloor <= 3
        ? currentFloor
        : null;


    // ======================================
    // FACILITY INFORMATION
    // ======================================

    // Add the actual building facilities and
    // their floors in Render Environment Variables.
    // Do not let AI invent facility locations.

    const facilityMap =
      process.env.FACILITY_MAP ||
      "No facility directory has been provided yet. Do not guess or invent facility names or floor locations.";


    // ======================================
    // AI SYSTEM INSTRUCTIONS
    // ======================================

    const systemPrompt = `
You are the AI Assistant for an Intelligent Elevator Control System.

Your job is to help visitors use a three-floor elevator prototype.

LANGUAGE:
1. Understand Bahasa Melayu and English.
2. Reply in the same language used by the visitor.
3. Use simple, polite and clear sentences.

ELEVATOR INFORMATION:
- The elevator has Floor 1, Floor 2 and Floor 3.
- The visitor's selected current floor is: ${validCurrentFloor ?? "Not selected"}.
- The elevator facility directory is:

${facilityMap}

FACILITY QUESTIONS:
1. Answer questions about facilities only using the facility directory.
2. If the directory does not contain the requested information, explain that the location is not available in the directory.
3. Never invent a facility or its floor.
4. If a visitor asks where a facility is, tell them its floor if known.
5. Merely asking where a facility is DOES NOT mean the visitor wants to travel there.
6. Do not create a destination request unless the visitor clearly asks to go to a floor or asks to be taken to a known facility.
7. If the visitor says "take me there" or similar, use the previous conversation to identify the facility and its known floor.

DESTINATION REQUEST:
1. If the visitor clearly asks to go to Floor 1, Floor 2 or Floor 3, identify the destination.
2. If the visitor asks to go to a facility, use its floor from the facility directory.
3. If the destination is unclear, ask a follow-up question.
4. If the visitor has not selected their current floor, explain that they must select their current floor on the website first.
5. If the destination is the same as the current floor, explain that they are already on that floor.
6. If the destination is clear and the current floor is selected, tell the visitor which floor they requested.
7. The website will show a confirmation button. The visitor must confirm before the request is submitted.

IMPORTANT SAFETY:
- You are only a visitor assistance chatbot.
- You do not control the motor, PLC, ESP32 or elevator movement.
- Never claim that the elevator has moved or that a request has been completed.
- Never claim a request has been sent to Firebase.
- The website handles submission after visitor confirmation.

OUTPUT FORMAT:
Return ONLY a valid JSON object in this format:

{
  "reply": "Your response to the visitor",
  "destinationFloor": null
}

The destinationFloor must be:
- 1, 2 or 3 ONLY when the visitor clearly requests to travel to that destination.
- null for general questions, facility questions without travel intent, greetings, unclear requests, or when current floor is not selected.
- null when destination equals current floor.

Do not include Markdown or any text outside the JSON object.
`;


    // ======================================
    // PREPARE CONVERSATION HISTORY
    // ======================================

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .map(item => ({
        role: item.role,
        content: item.content.slice(0, 1000)
      }));


    // ======================================
    // CONNECT TO GROQ AI
    // ======================================

    const model =
      process.env.GROQ_MODEL ||
      "llama-3.3-70b-versatile";

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },

        body: JSON.stringify({

          model: model,

          messages: [
            {
              role: "system",
              content: systemPrompt
            },

            ...safeHistory,

            {
              role: "user",
              content: message.trim()
            }
          ],

          response_format: {
            type: "json_object"
          },

          temperature: 0.2,

          max_tokens: 500

        })

      }
    );


    // ======================================
    // HANDLE GROQ RESPONSE
    // ======================================

    const result = await groqResponse.json();

    if (!groqResponse.ok) {

      console.error("Groq API error:", result);

      return res.status(502).json({
        error: "Unable to get a response from the AI service."
      });

    }

    const aiContent =
      result.choices?.[0]?.message?.content;

    if (!aiContent) {

      throw new Error("Empty AI response.");

    }

    const aiData = JSON.parse(aiContent);

    const reply =
      typeof aiData.reply === "string"
        ? aiData.reply
        : "Sorry, I could not understand your request.";


    // ======================================
    // VALIDATE DESTINATION FLOOR
    // ======================================

    let destinationFloor = null;

    if (
      Number.isInteger(aiData.destinationFloor) &&
      [1, 2, 3].includes(aiData.destinationFloor) &&
      validCurrentFloor !== null &&
      aiData.destinationFloor !== validCurrentFloor
    ) {

      destinationFloor = aiData.destinationFloor;

    }


    // ======================================
    // SEND RESPONSE TO WEBSITE
    // ======================================

    return res.json({

      reply: reply,

      destinationFloor: destinationFloor

    });


  } catch (error) {

    console.error("AI Backend Error:", error);

    return res.status(500).json({

      error: "Something went wrong in the AI backend."

    });

  }

});


// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {

  console.log(
    `Intelligent Elevator AI Backend running on port ${PORT}`
  );

});
