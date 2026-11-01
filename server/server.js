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
  {
    floor: 1,
    name: "Main Entrance",
    aliases: ["main entrance", "entrance", "pintu masuk"]
  },
  {
    floor: 1,
    name: "Reception",
    aliases: ["reception", "front desk", "kaunter", "kaunter reception"]
  },
  {
    floor: 1,
    name: "Waiting Lounge",
    aliases: ["waiting lounge", "ruang menunggu"]
  },
  {
    floor: 1,
    name: "Restaurant",
    aliases: ["restaurant", "restoran", "tempat makan"]
  },
  {
    floor: 1,
    name: "Cafe",
    aliases: ["cafe", "café", "coffee shop", "kedai kopi"]
  },
  {
    floor: 1,
    name: "Meeting Room",
    aliases: ["meeting room", "bilik meeting", "bilik mesyuarat"]
  },
  {
    floor: 1,
    name: "Hotel Office",
    aliases: ["hotel office", "office", "pejabat"]
  },
  {
    floor: 1,
    name: "Public Toilet",
    aliases: ["public toilet", "toilet", "tandas", "bilik air"]
  },
  {
    floor: 2,
    name: "Standard Room",
    aliases: ["standard room", "standard", "bilik standard"]
  },
  {
    floor: 2,
    name: "Deluxe Room",
    aliases: ["deluxe room", "deluxe", "bilik deluxe"]
  },
  {
    floor: 2,
    name: "Twin Room",
    aliases: ["twin room", "twin", "bilik twin"]
  },
  {
    floor: 2,
    name: "Family Room",
    aliases: ["family room", "family", "bilik family", "bilik keluarga"]
  },
  {
    floor: 2,
    name: "Housekeeping Room",
    aliases: ["housekeeping room", "housekeeping"]
  },
  {
    floor: 2,
    name: "Laundry Room",
    aliases: ["laundry room", "laundry", "dobi"]
  },
  {
    floor: 2,
    name: "Guest Lounge",
    aliases: ["guest lounge", "ruang tetamu"]
  },
  {
    floor: 3,
    name: "Swimming Pool",
    aliases: [
      "swimming pool", "pool", "swimming",
      "kolam", "kolam renang"
    ]
  },
  {
    floor: 3,
    name: "Gymnasium",
    aliases: ["gymnasium", "gym", "fitness", "fitness room"]
  },
  {
    floor: 3,
    name: "Spa and Massage",
    aliases: ["spa and massage", "spa", "massage", "urut"]
  },
  {
    floor: 3,
    name: "Sauna",
    aliases: ["sauna"]
  },
  {
    floor: 3,
    name: "Rooftop Restaurant",
    aliases: ["rooftop restaurant", "rooftop", "restoran rooftop"]
  },
  {
    floor: 3,
    name: "Sky Lounge",
    aliases: ["sky lounge"]
  },
  {
    floor: 3,
    name: "Kids Playroom",
    aliases: [
      "kids playroom", "playroom",
      "bilik permainan kanak kanak"
    ]
  }
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
    [/\bkt\b/g, " dekat "],
    [/\bdkt\b/g, " dekat "],
    [/\bdri\b/g, " dari "],
    [/\bdr\b/g, " dari "],
    [/\bnk\b/g, " nak "],
    [/\bngk\b/g, " nak "],
    [/\bgi\b/g, " pergi "],
    [/\bpegi\b/g, " pergi "],
    [/\bbrp\b/g, " berapa "],
    [/\bmn\b/g, " mana "],
    [/\btkt\b/g, " tingkat "],
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
// ======================================

function validFloor(value) {
  const floor = Number(value);
  return Number.isInteger(floor) && floor >= 1 && floor <= 3;
}

function detectCurrentFloor(message) {
  const text = expandShortforms(message);

  const patterns = [
    /\b(?:saya|aku|i|im|i am)\s+(?:sekarang\s+)?(?:berada\s+)?(?:di|dekat|dari|at|on)\s+(?:floor|level|tingkat)\s*([1-3])\b/,
    /\b(?:dari|from)\s+(?:floor|level|tingkat)\s*([1-3])\b/,
    /\b(?:current floor|my floor|floor saya|tingkat saya)\s*(?:is|ialah|adalah)?\s*([1-3])\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }

  const words = {
    satu: 1,
    pertama: 1,
    dua: 2,
    kedua: 2,
    tiga: 3,
    ketiga: 3
  };

  const match = text.match(
    /\b(?:floor|level|tingkat)\s+(satu|pertama|dua|kedua|tiga|ketiga)\b/
  );

  if (match) return words[match[1]];

  return null;
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
// INTENT DETECTION
// ======================================

function isLocationQuestion(message) {
  const text = expandShortforms(message);

  return (
    /\b(where|where is|where are|which floor|what floor|located|location)\b/.test(text) ||
    /\b(mana|di mana|dekat mana|tingkat berapa|floor berapa|berapa tingkat)\b/.test(text)
  );
}

function isTravelCommand(message) {
  const text = expandShortforms(message);

  return (
    /\b(take me|bring me|send me|i want to go|i wanna go|i need to go|go to|head to|send the lift|call the lift|call elevator)\b/.test(text) ||
    /\b(nak pergi|mahu pergi|ingin pergi|bawa saya|bawak saya|hantar saya|saya nak ke|saya mahu ke|pergi ke|nak ke|panggil lif|hantar lif)\b/.test(text)
  );
}

// ======================================
// LANGUAGE DETECTION
// ======================================

function detectLanguage(message) {
  const text = expandShortforms(message);

  if (/\b(saya|awak|aku|nak|pergi|tingkat|dengan|mana|berapa|dekat|bawa|hantar)\b/.test(text)) {
    return "ms";
  }

  return "en";
}

// ======================================
// RESPONSE HELPERS
// ======================================

function locationReply(facility, language) {
  if (language === "ms") {
    return facility.name + " berada di Tingkat " +
      facility.floor + ". Nak saya bawa awak ke sana?";
  }

  return facility.name + " is on Floor " +
    facility.floor + ". Would you like me to take you there?";
}

function askFloorReply(language) {
  return language === "ms"
    ? "Boleh beritahu saya sekarang awak berada di tingkat berapa?"
    : "May I know which floor you are currently on?";
}

// ======================================
// GROQ AI
// ======================================

const SYSTEM_PROMPT = `
You are the Hotel AI Assistant for an Intelligent Elevator System.

You must understand:
- English and Bahasa Melayu.
- Malay slang and shortforms.
- Informal spelling and common typing mistakes.
- Voice transcription.
- Natural everyday conversation.

Examples:
"sy nk g gym" = Saya nak pergi ke gym.
"cafe kt mn" = Cafe dekat mana?
"sy dri floor 2 nk ke cafe" = Saya dari Floor 2 nak ke Cafe.
"aku kt tingkat 1" = Saya berada di tingkat 1.
"brp tingkat pool" = Swimming pool berada di tingkat berapa?

Hotel directory:

FLOOR 1:
Main Entrance, Reception, Front Desk, Waiting Lounge,
Restaurant, Cafe, Meeting Room, Hotel Office, Public Toilet.

FLOOR 2:
Standard Room, Deluxe Room, Twin Room, Family Room,
Housekeeping Room, Laundry Room, Guest Lounge.

FLOOR 3:
Swimming Pool, Gymnasium, Spa and Massage, Sauna,
Rooftop Restaurant, Sky Lounge, Kids Playroom.

Reply naturally and concisely.
Use the same language as the guest.
Do not invent hotel information.
Never claim the lift has physically moved or arrived.
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
        temperature: 0.3,
        max_tokens: 600
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "Groq API request failed"
    );
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
      return res.status(400).json({
        error: "Message is required"
      });
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

    const detectedFloor = detectCurrentFloor(message);

    if (detectedFloor !== null) {
      currentFloor = detectedFloor;
    }

    const facility = findFacility(message);
    const locationQuestion = isLocationQuestion(message);
    const travelCommand = isTravelCommand(message);

    // LOCATION QUESTION
    if (facility && locationQuestion && !travelCommand) {
      return res.json({
        action: "offer_lift",
        reply: locationReply(facility, language),
        destinationFloor: facility.floor,
        facility: facility.name,
        currentFloor
      });
    }

    // DIRECT FACILITY TRAVEL
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
          reply: language === "ms"
            ? "Awak sudah berada di tingkat yang sama! " +
              facility.name + " berada di Tingkat " + facility.floor + "."
            : "You are already on the same floor! " +
              facility.name + " is on Floor " + facility.floor + "."
        });
      }

      return res.json({
        action: "send_lift",
        reply: language === "ms"
          ? "Baik! Permintaan perjalanan dari Tingkat " +
            currentFloor + " ke " + facility.name +
            " di Tingkat " + facility.floor +
            " sedang dihantar."
          : "Okay! Your trip from Floor " +
            currentFloor + " to " + facility.name +
            " on Floor " + facility.floor +
            " is being submitted.",
        currentFloor,
        destinationFloor: facility.floor
      });
    }

    // GENERAL CHAT
    const aiMessages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...safeHistory,
      {
        role: "user",
        content: message
      }
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
