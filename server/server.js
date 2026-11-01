const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

// ======================================
// CONFIGURATION
// ======================================

const WEBSITE_URL =
  process.env.WEBSITE_URL ||
  "https://caahdh8-code.github.io";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// ======================================
// HOTEL DIRECTORY
// ======================================

const FACILITIES = {
  1: [
    "Main Entrance",
    "Reception",
    "Front Desk",
    "Waiting Lounge",
    "Restaurant",
    "Cafe",
    "Meeting Room",
    "Hotel Office",
    "Public Toilet"
  ],
  2: [
    "Standard Room",
    "Deluxe Room",
    "Twin Room",
    "Family Room",
    "Housekeeping Room",
    "Laundry Room",
    "Guest Lounge"
  ],
  3: [
    "Swimming Pool",
    "Gymnasium",
    "Spa and Massage",
    "Sauna",
    "Rooftop Restaurant",
    "Sky Lounge",
    "Kids Playroom"
  ]
};

// ======================================
// MIDDLEWARE
// ======================================

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === WEBSITE_URL ||
      origin === "https://caahdh8-code.github.io"
    ) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({limit:"1mb"}));

// ======================================
// HELPERS
// ======================================

function validFloor(floor) {
  return (
    Number.isInteger(Number(floor)) &&
    Number(floor) >= 1 &&
    Number(floor) <= 3
  );
}

function parseAIJson(content) {
  if (!content || typeof content !== "string") {
    throw new Error("Empty AI response");
  }

  let cleaned = content.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI did not return a valid JSON object");
  }

  return JSON.parse(
    cleaned.substring(firstBrace, lastBrace + 1)
  );
}

// ======================================
// GROQ AI
// ======================================

async function callGroq(messages) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing in Render Environment");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.1,
        response_format: {type:"json_object"}
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("Groq error:", result);

    throw new Error(
      result.error?.message || "AI service request failed"
    );
  }

  const content = result.choices?.[0]?.message?.content;

  return parseAIJson(content);
}

// ======================================
// SYSTEM PROMPT
// ======================================

const SYSTEM_PROMPT = `
You are the Hotel AI Assistant for an Intelligent Elevator System.

You must understand natural language in:
- English
- Bahasa Melayu
- Informal Malay
- Common spelling variations
- Voice-transcribed messages

Your tasks:
1. Answer hotel questions.
2. Identify hotel facilities and their floors.
3. Understand elevator destination requests.
4. Ask for confirmation before a lift request is submitted.

HOTEL DIRECTORY

FLOOR 1:
${FACILITIES[1].join(", ")}

FLOOR 2:
${FACILITIES[2].join(", ")}

FLOOR 3:
${FACILITIES[3].join(", ")}

FACILITY LOCATION RULES

- Cafe, restaurant and reception are on Floor 1.
- Guest rooms are on Floor 2.
- Swimming pool, gymnasium, spa and sauna are on Floor 3.
- Gym means Gymnasium.
- Pool means Swimming Pool.
- Do not invent facilities.

CURRENT FLOOR RULES

- The website may provide the current floor.
- If currentFloor is provided, use it.
- Never ask for the current floor again if it has already been provided.
- If currentFloor is null, ask the guest for their current floor.
- If the guest says "floor 2", "tingkat 2", "dua", or "I'm on floor 2", understand that as their current floor when answering a question about their location.
- Never guess the current floor.

ELEVATOR REQUEST RULES

Understand requests such as:
- Saya dari tingkat 2 dan nak ke gym.
- Saya sekarang di tingkat 1, nak pergi swimming pool.
- Bawa saya ke cafe.
- Saya nak ke bilik Deluxe.
- Take me to the swimming pool.
- Please send the lift to Floor 3.
- I am on Floor 2 and want to go to the gym.
- Can you bring me to the restaurant?

When the guest asks to go to a facility:
1. Identify its floor using the directory.
2. Check the current floor.
3. If current floor is missing, ask for it.
4. If current floor equals destination floor, say "You are already here!"
5. Otherwise, ask the guest to confirm.

When a destination is identified and current floor is known, return:

{
  "action": "confirm_lift",
  "reply": "You are currently on Floor 2. Your destination is the Gymnasium on Floor 3. Would you like me to send the lift?",
  "destinationFloor": 3
}

CONFIRMATION RULES

- Never submit a lift request yourself.
- The website handles the YES or NO response.
- Never return action "submit".
- Only return "confirm_lift" when destination is clear and current floor is known.
- Never claim the lift has physically moved or arrived.

NORMAL QUESTIONS

If the guest asks where a facility is, answer its floor.
If the guest asks general hotel questions, answer politely.
If the message is unclear, ask a simple clarification question.

LANGUAGE

- Reply in the same language used by the guest.
- Use natural and simple Malay or English.
- Do not combine Malay and English unnecessarily.

OUTPUT FORMAT

Always return one valid JSON object.
Do not include Markdown.
Do not include text outside JSON.

For normal chat:
{
  "action": "chat",
  "reply": "Your answer"
}

For elevator confirmation:
{
  "action": "confirm_lift",
  "reply": "Your confirmation question",
  "destinationFloor": 3
}
`;

// ======================================
// HOME
// ======================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Intelligent Elevator AI Backend is running"
  });
});

// ======================================
// HEALTH CHECK
// ======================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    aiConfigured: Boolean(GROQ_API_KEY),
    model: GROQ_MODEL
  });
});

// ======================================
// AI ASSISTANT API
// ======================================

app.post("/api/assistant", async (req, res) => {
  try {
    const {
      message,
      currentFloor,
      history = []
    } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    if (
      currentFloor !== null &&
      currentFloor !== undefined &&
      !validFloor(currentFloor)
    ) {
      return res.status(400).json({
        error: "Invalid current floor"
      });
    }

    if (!Array.isArray(history)) {
      return res.status(400).json({
        error: "History must be an array"
      });
    }

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-10);

    const systemMessage = {
      role: "system",
      content:
        SYSTEM_PROMPT +
        "\n\nCURRENT FLOOR PROVIDED BY WEBSITE: " +
        (
          currentFloor === null || currentFloor === undefined
            ? "Not provided"
            : String(currentFloor)
        )
    };

    const messages = [
      systemMessage,
      ...safeHistory,
      {
        role: "user",
        content: message
      }
    ];

    const data = await callGroq(messages);

    if (
      !data ||
      typeof data.reply !== "string"
    ) {
      throw new Error("Invalid AI response format");
    }

    // ======================================
    // VALIDATE DESTINATION
    // ======================================

    if (data.action === "confirm_lift") {

      if (
        !validFloor(data.destinationFloor) ||
        !validFloor(currentFloor)
      ) {
        return res.json({
          action: "chat",
          reply: !validFloor(currentFloor)
            ? "May I know which floor you are currently on?"
            : "Please tell me your destination floor again."
        });
      }

      const current = Number(currentFloor);
      const destination = Number(data.destinationFloor);

      if (current === destination) {
        return res.json({
          action: "chat",
          reply: "You are already here!"
        });
      }

      return res.json({
        action: "confirm_lift",
        reply: data.reply,
        currentFloor: current,
        destinationFloor: destination
      });
    }

    // Do not allow AI to submit directly.
    return res.json({
      action: "chat",
      reply: data.reply
    });

  } catch(error) {
    console.error("Assistant error:", error);

    return res.status(500).json({
      error: "AI assistant is temporarily unavailable",
      details: error.message
    });
  }
});

// ======================================
// ERROR HANDLER
// ======================================

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    error: "Internal server error"
  });
});

// ======================================
// START SERVER
// ======================================

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
  console.log("Chat model: " + GROQ_MODEL);
});
