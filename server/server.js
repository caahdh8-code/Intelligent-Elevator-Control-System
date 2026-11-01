const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

const WEBSITE_URL =
  process.env.WEBSITE_URL || "https://caahdh8-code.github.io";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === WEBSITE_URL) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({ limit: "1mb" }));

// ======================================
// HOTEL DIRECTORY
// ======================================

const FACILITIES = [
  { floor: 1, name: "Main Entrance", aliases: ["main entrance", "entrance", "pintu masuk"] },
  { floor: 1, name: "Reception", aliases: ["reception", "front desk", "kaunter", "kaunter reception"] },
  { floor: 1, name: "Waiting Lounge", aliases: ["waiting lounge", "ruang menunggu"] },
  { floor: 1, name: "Restaurant", aliases: ["restaurant", "restoran", "tempat makan"] },
  { floor: 1, name: "Cafe", aliases: ["cafe", "café", "kafe", "coffee shop", "kedai kopi"] },
  { floor: 1, name: "Meeting Room", aliases: ["meeting room", "bilik meeting", "bilik mesyuarat"] },
  { floor: 1, name: "Hotel Office", aliases: ["hotel office", "office", "pejabat"] },
  { floor: 1, name: "Public Toilet", aliases: ["public toilet", "toilet", "tandas", "bilik air"] },

  { floor: 2, name: "Standard Room", aliases: ["standard room", "standard", "bilik standard"] },
  { floor: 2, name: "Deluxe Room", aliases: ["deluxe room", "deluxe", "bilik deluxe"] },
  { floor: 2, name: "Twin Room", aliases: ["twin room", "twin", "bilik twin"] },
  { floor: 2, name: "Family Room", aliases: ["family room", "family", "bilik family", "bilik keluarga"] },
  { floor: 2, name: "Housekeeping Room", aliases: ["housekeeping room", "housekeeping"] },
  { floor: 2, name: "Laundry Room", aliases: ["laundry room", "laundry", "dobi"] },
  { floor: 2, name: "Guest Lounge", aliases: ["guest lounge", "ruang tetamu"] },

  { floor: 3, name: "Swimming Pool", aliases: ["swimming pool", "pool", "swimming", "kolam renang", "kolam"] },
  { floor: 3, name: "Gymnasium", aliases: ["gymnasium", "gym", "gim", "fitness", "fitness room"] },
  { floor: 3, name: "Spa and Massage", aliases: ["spa and massage", "spa", "massage", "urut"] },
  { floor: 3, name: "Sauna", aliases: ["sauna"] },
  { floor: 3, name: "Rooftop Restaurant", aliases: ["rooftop restaurant", "rooftop", "restoran rooftop"] },
  { floor: 3, name: "Sky Lounge", aliases: ["sky lounge"] },
  { floor: 3, name: "Kids Playroom", aliases: ["kids playroom", "playroom", "kids room", "bilik permainan kanak kanak"] }
];

// ======================================
// TEXT NORMALISATION
// ======================================

function normaliseText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandShortforms(value) {
  let text = " " + normaliseText(value) + " ";

  const replacements = [
    [/\bsy\b/g, " saya "],
    [/\bsye\b/g, " saya "],
    [/\baku\b/g, " saya "],
    [/\bkau\b/g, " awak "],
    [/\bko\b/g, " awak "],
    [/\bdri\b/g, " dari "],
    [/\bdr\b/g, " dari "],
    [/\bkt\b/g, " dekat "],
    [/\bdkt\b/g, " dekat "],
    [/\bkat\b/g, " dekat "],
    [/\bnk\b/g, " nak "],
    [/\bngk\b/g, " nak "],
    [/\bnek\b/g, " nak "],
    [/\bgi\b/g, " pergi "],
    [/\bg\b/g, " pergi "],
    [/\bpegi\b/g, " pergi "],
    [/\bpi\b/g, " pergi "],
    [/\bbrp\b/g, " berapa "],
    [/\bmn\b/g, " mana "],
    [/\btkt\b/g, " tingkat "],
    [/\bskrg\b/g, " sekarang "],
    [/\bskang\b/g, " sekarang "],
    [/\bdh\b/g, " sudah "],
    [/\bdah\b/g, " sudah "],
    [/\bx\b/g, " tidak "],
    [/\btak\b/g, " tidak "],
    [/\btk\b/g, " tidak "],
    [/\bblm\b/g, " belum "],
    [/\bape\b/g, " apa "],
    [/\bcmne\b/g, " bagaimana "],
    [/\bcamne\b/g, " bagaimana "],
    [/\bmcm\b/g, " macam "],
    [/\bpls\b/g, " please "],
    [/\bplz\b/g, " please "]
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, " ").trim();
}

// ======================================
// FLOOR DETECTION
// Only detect the guest's CURRENT floor.
// Never use a destination floor as current floor.
// ======================================

function detectCurrentFloor(message) {
  const text = expandShortforms(message);

  const number = "(1|2|3)";
  const word = "(satu|pertama|one|dua|kedua|two|tiga|ketiga|three)";

  const patterns = [
    new RegExp("\\b(?:saya|awak|i am|im|i)\\s+(?:sekarang\\s+)?(?:berada\\s+)?(?:di|dekat|dari|on|at)\\s+(?:floor|tingkat|level)?\\s*" + number + "\\b"),
    new RegExp("\\b(?:saya|awak)\\s+(?:sekarang\\s+)?(?:berada\\s+)?(?:di|dekat|dari)\\s+(?:floor|tingkat|level)?\\s*" + word + "\\b"),
    new RegExp("\\b(?:i am|im|currently)\\s+(?:on|at|in)\\s+(?:floor|level)?\\s*" + number + "\\b"),
    new RegExp("\\b(?:from|dari)\\s+(?:floor|tingkat|level)\\s*" + number + "\\b"),
    new RegExp("\\b(?:current floor|my floor|tingkat saya|floor saya)\\s*(?:is|ialah|adalah)?\\s*" + number + "\\b")
  ];

  const words = {
    satu: 1, pertama: 1, one: 1,
    dua: 2, kedua: 2, two: 2,
    tiga: 3, ketiga: 3, three: 3
  };

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1];
      return words[value] || Number(value);
    }
  }

  return null;
}

function validFloor(value) {
  const floor = Number(value);
  return Number.isInteger(floor) && floor >= 1 && floor <= 3;
}

// ======================================
// FACILITY DETECTION
// ======================================

function findFacility(message) {
  const text = " " + expandShortforms(message) + " ";
  const matches = [];

  for (const facility of FACILITIES) {
    for (const alias of facility.aliases) {
      const name = normaliseText(alias);

      if (text.includes(" " + name + " ")) {
        matches.push({
          ...facility,
          matchedAlias: alias,
          length: name.length
        });
      }
    }
  }

  matches.sort((a, b) => b.length - a.length);
  return matches[0] || null;
}

// ======================================
// DESTINATION FLOOR DETECTION
// ======================================

function detectDestinationFloor(message) {
  const text = expandShortforms(message);

  const match = text.match(
    /\b(?:nak ke|pergi ke|bawa saya ke|hantar saya ke|go to|take me to|bring me to|destination|destinasi)\s+(?:floor|tingkat|level)?\s*(1|2|3)\b/
  );

  if (match) return Number(match[1]);

  const words = {
    satu: 1, pertama: 1, one: 1,
    dua: 2, kedua: 2, two: 2,
    tiga: 3, ketiga: 3, three: 3
  };

  const wordMatch = text.match(
    /\b(?:nak ke|pergi ke|go to|take me to|destination|destinasi)\s+(?:floor|tingkat|level)\s+(satu|pertama|one|dua|kedua|two|tiga|ketiga|three)\b/
  );

  if (wordMatch) return words[wordMatch[1]];

  return null;
}

// ======================================
// INTENT DETECTION
// ======================================

function isLocationQuestion(message) {
  const text = expandShortforms(message);

  return (
    /\b(where|where is|where are|which floor|what floor|located|location)\b/.test(text) ||
    /\b(mana|di mana|dekat mana|tingkat berapa|floor berapa|berapa tingkat|kat mana)\b/.test(text)
  );
}

function isTravelCommand(message) {
  const text = expandShortforms(message);

  return (
    /\b(take me|bring me|send me|i want to go|i wanna go|i need to go|go to|head to|call the lift|call elevator)\b/.test(text) ||
    /\b(nak pergi|mahu pergi|ingin pergi|bawa saya|bawak saya|hantar saya|saya nak ke|saya mahu ke|pergi ke|nak ke|panggil lif|hantar lif)\b/.test(text) ||
    /\b(saya nak|nak|mahu|ingin)\s+(?:ke|pergi)\b/.test(text)
  );
}

function detectLanguage(message) {
  const text = expandShortforms(message);

  if (/\b(saya|awak|nak|pergi|tingkat|dengan|mana|berapa|dekat|bawa|hantar|sekarang)\b/.test(text)) {
    return "ms";
  }

  return "en";
}

// ======================================
// RESPONSE HELPERS
// ======================================

function askFloorReply(language) {
  return language === "ms"
    ? "Boleh beritahu saya awak berada di tingkat berapa sekarang? Contohnya, Tingkat 2."
    : "Which floor are you currently on? For example, Floor 2.";
}

function locationReply(facility, language) {
  return language === "ms"
    ? facility.name + " berada di Tingkat " + facility.floor + ". Nak saya bawa awak ke sana?"
    : facility.name + " is on Floor " + facility.floor + ". Would you like me to take you there?";
}

function sameFloorReply(facility, language) {
  return language === "ms"
    ? "Awak sudah berada di tingkat yang sama! " + facility.name + " berada di Tingkat " + facility.floor + "."
    : "You are already on the same floor! " + facility.name + " is on Floor " + facility.floor + ".";
}

// ======================================
// GROQ AI
// ======================================

const SYSTEM_PROMPT = `
You are the Hotel AI Assistant for a three-floor hotel elevator.

Understand natural Bahasa Melayu, English, Malay slang, shortforms,
informal spelling, typos and voice transcription.

Examples:
"sy nk g gym" means "Saya nak pergi ke gym".
"cafe kt mn?" means "Cafe dekat mana?"
"sy dri floor 2 nk ke cafe" means the guest is on Floor 2 and wants Cafe.
"aku kt tingkat 1" means the guest is on Floor 1.
"brp tingkat pool?" asks which floor has the swimming pool.

HOTEL DIRECTORY:

FLOOR 1:
Main Entrance, Reception, Front Desk, Waiting Lounge,
Restaurant, Cafe, Meeting Room, Hotel Office, Public Toilet.

FLOOR 2:
Standard Room, Deluxe Room, Twin Room, Family Room,
Housekeeping Room, Laundry Room, Guest Lounge.

FLOOR 3:
Swimming Pool, Gymnasium, Spa and Massage, Sauna,
Rooftop Restaurant, Sky Lounge, Kids Playroom.

Rules:
- Reply naturally and briefly.
- Use the same language as the guest.
- Do not invent hotel facilities or information.
- Do not claim the elevator has moved or arrived.
- Do not say a lift request was sent unless the system confirms it.
- For unclear requests, ask one simple question.
`;

// ======================================
// GROQ REQUEST
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
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 500
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || "Groq API request failed");
  }

  return result.choices?.[0]?.message?.content || "";
}

// ======================================
// ROUTES
// ======================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Intelligent Elevator AI Backend is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    aiConfigured: Boolean(GROQ_API_KEY)
  });
});

// ======================================
// AI ASSISTANT
// ======================================

app.post("/api/assistant", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const history = Array.isArray(req.body.history)
      ? req.body.history
      : Array.isArray(req.body.chatHistory)
        ? req.body.chatHistory
        : [];

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-10);

    const language = detectLanguage(message);

    let currentFloor = validFloor(req.body.currentFloor)
      ? Number(req.body.currentFloor)
      : null;

    const detectedCurrent = detectCurrentFloor(message);
    if (detectedCurrent !== null) currentFloor = detectedCurrent;

    const facility = findFacility(message);
    const locationQuestion = isLocationQuestion(message);
    const travelCommand = isTravelCommand(message);

    // 1. Location question: offer only, do not send request.
    if (facility && locationQuestion && !travelCommand) {
      return res.json({
        action: "offer_lift",
        reply: locationReply(facility, language),
        destinationFloor: facility.floor,
        facility: facility.name,
        currentFloor
      });
    }

    // 2. Direct request to a named hotel facility.
    if (facility && travelCommand) {
      if (!currentFloor) {
        return res.json({
          action: "ask_current_floor",
          reply: askFloorReply(language),
          destinationFloor: facility.floor,
          facility: facility.name
        });
      }

      if (currentFloor === facility.floor) {
        return res.json({
          action: "chat",
          reply: sameFloorReply(facility, language)
        });
      }

      return res.json({
        action: "send_lift",
        reply: language === "ms"
          ? "Baik! Saya sedang menghantar permintaan lif dari Tingkat " +
            currentFloor + " ke " + facility.name +
            " di Tingkat " + facility.floor + "."
          : "Okay! I am submitting your lift request from Floor " +
            currentFloor + " to " + facility.name +
            " on Floor " + facility.floor + ".",
        currentFloor,
        destinationFloor: facility.floor,
        facility: facility.name
      });
    }

    // 3. Direct request to a numbered floor.
    const destinationFloor = detectDestinationFloor(message);

    if (destinationFloor && travelCommand) {
      if (!currentFloor) {
        return res.json({
          action: "ask_current_floor",
          reply: askFloorReply(language),
          destinationFloor
        });
      }

      if (currentFloor === destinationFloor) {
        return res.json({
          action: "chat",
          reply: language === "ms"
            ? "Awak sudah berada di Tingkat " + destinationFloor + "!"
            : "You are already on Floor " + destinationFloor + "!"
        });
      }

      return res.json({
        action: "send_lift",
        reply: language === "ms"
          ? "Baik! Saya sedang menghantar permintaan lif ke Tingkat " + destinationFloor + "."
          : "Okay! I am submitting your lift request to Floor " + destinationFloor + ".",
        currentFloor,
        destinationFloor
      });
    }

    // 4. General conversation through Groq.
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...safeHistory,
      { role: "user", content: message }
    ];

    const aiReply = await callGroq(aiMessages);

    return res.json({
      action: "chat",
      reply: aiReply
    });

  } catch (error) {
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
