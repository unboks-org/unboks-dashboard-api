import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAgentPersonality } from "@/hooks/use-agent-personality";
import type { AgentPersonalitySettings } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isSpainSpanishTenant, tenantText } from "@/lib/tenant-ui";

type Example = {
  label: string;
  text: string;
};

type Option = {
  label: string;
  recommended?: boolean;
};

type WizardQuestion = {
  id: string;
  question: string;
  options: Option[];
  customLabel?: string;
  customRows?: number;
  examples: Example[];
};

type Answer = {
  selected: string;
  custom: string;
};

type ChatMessage = {
  id: string;
  role: "client" | "agent";
  text: string;
};

const QUESTIONS: WizardQuestion[] = [
  {
    id: "formality",
    question: "How formal should your AI Agent sound?",
    options: [
      { label: "Very Formal" },
      { label: "Professional but Friendly", recommended: true },
      { label: "Friendly & Casual" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "Dear client, thank you for your message. We will look into this matter promptly.",
      },
      {
        label: "Example 2",
        text: "Hi there, thanks for reaching out. I’d be happy to help you with this.",
      },
      {
        label: "Example 3",
        text: "Hey! No worries at all, I’m here to help 🙂",
      },
    ],
  },
  {
    id: "warmth",
    question: "How warm and friendly should your AI Agent be?",
    options: [
      { label: "Very Warm" },
      { label: "Warm & Professional", recommended: true },
      { label: "Straightforward & Efficient" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I understand this matters to you. Let’s take it step by step and make sure you get the right help.",
      },
      {
        label: "Example 2",
        text: "Thanks for explaining that. I can help you with the next step.",
      },
      {
        label: "Example 3",
        text: "Received. Here is what we need from you to move forward.",
      },
    ],
  },
  {
    id: "empathy",
    question: "How empathetic should your AI Agent be when clients are stressed?",
    options: [
      { label: "Highly Empathetic" },
      { label: "Balanced Empathy", recommended: true },
      { label: "More Direct & Solution-focused" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I’m sorry you’re dealing with this. I’ll help you get this to the right person as quickly as possible.",
      },
      {
        label: "Example 2",
        text: "I understand. Let’s focus on what we can do next.",
      },
      {
        label: "Example 3",
        text: "The next step is to send us the details below so the team can review it.",
      },
    ],
  },
  {
    id: "directness",
    question: "Should your AI Agent chat a little or be very direct?",
    options: [
      { label: "Chatty & Engaging" },
      { label: "Balanced", recommended: true },
      { label: "Very Direct" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "That makes sense. A few details would help me guide you better. What happened, and when did it start?",
      },
      {
        label: "Example 2",
        text: "Thanks. Can you share a little more context so we can help properly?",
      },
      {
        label: "Example 3",
        text: "Please send the date, your name, and the main question.",
      },
    ],
  },
  {
    id: "appointmentStyle",
    question: "How should your AI Agent handle appointment requests?",
    options: [
      { label: "Gently suggest when appropriate", recommended: true },
      { label: "Only when client asks" },
      { label: "Always try to book" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I can share general information first. If you want personal advice after that, we can help schedule a time.",
      },
      {
        label: "Example 2",
        text: "Yes, I can help with an appointment. Which day works best for you?",
      },
      {
        label: "Example 3",
        text: "The best next step is to book a consultation. Would you like to schedule one now?",
      },
    ],
  },
  {
    id: "overallTone",
    question: "What overall tone should your AI Agent have?",
    options: [
      { label: "Calm & Patient", recommended: true },
      { label: "Energetic & Positive" },
      { label: "Authoritative & Confident" },
      { label: "Supportive & Helpful" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "No problem. Take your time. I’ll help you find the right next step.",
      },
      {
        label: "Example 2",
        text: "Great, we can help with that. Let’s get the important details first.",
      },
      {
        label: "Example 3",
        text: "Based on what you shared, this is the right way to proceed.",
      },
    ],
  },
  {
    id: "phrasesUse",
    question: "Are there any words or phrases your AI Agent should use often?",
    options: [
      { label: "Keep it simple and human", recommended: true },
      { label: "Use our business name often" },
      { label: "Use reassuring language" },
      { label: "No special phrases" },
    ],
    customLabel: "Or write the words and phrases you prefer",
    examples: [
      {
        label: "Example 1",
        text: "You can say: “I understand”, “Let’s look at this”, and “We can help with that.”",
      },
      {
        label: "Example 2",
        text: "Use the business name when confirming appointments or important details.",
      },
      {
        label: "Example 3",
        text: "Avoid sounding scripted. Use short, natural phrases.",
      },
    ],
  },
  {
    id: "phrasesAvoid",
    question: "Are there any words or phrases your AI Agent should never use?",
    options: [
      { label: "Avoid robotic phrases", recommended: true },
      { label: "Avoid slang" },
      { label: "Avoid over-promising" },
      { label: "No blocked phrases yet" },
    ],
    customLabel: "Or write the words and phrases to avoid",
    examples: [
      {
        label: "Example 1",
        text: "Avoid phrases like: “As a virtual assistant” or “I am unable to”.",
      },
      {
        label: "Example 2",
        text: "Avoid promising exact results, prices, or timelines unless they are confirmed.",
      },
      {
        label: "Example 3",
        text: "Avoid pushing for appointments in every message.",
      },
    ],
  },
  {
    id: "upsetClient",
    question: "How should your AI Agent reply when a client is upset or frustrated?",
    options: [
      { label: "Acknowledge feelings first", recommended: true },
      { label: "Apologize and move to next steps" },
      { label: "Stay calm and practical" },
      { label: "Escalate quickly to a human" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I understand this is frustrating. Let me help you get this to the right person.",
      },
      {
        label: "Example 2",
        text: "I’m sorry this has been difficult. Here is what we can do next.",
      },
      {
        label: "Example 3",
        text: "Thanks for explaining. I’ll pass this to the team so they can review it properly.",
      },
    ],
  },
  {
    id: "replyLength",
    question: "How long should your AI Agent’s replies usually be?",
    options: [
      { label: "Short & Clear" },
      { label: "Medium Length", recommended: true },
      { label: "Detailed & Thorough" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "Yes, we can help. Please send your name and preferred time.",
      },
      {
        label: "Example 2",
        text: "Yes, we can help with that. Please send your name, the best phone number, and the day that works for you.",
      },
      {
        label: "Example 3",
        text: "Yes, we can help with that. To prepare properly, please send your name, phone number, preferred day, and a short explanation of what you need help with.",
      },
    ],
  },
  {
    id: "questionsBack",
    question: "Should your AI Agent ask questions back to the client to understand better?",
    options: [
      { label: "Yes, when details are missing", recommended: true },
      { label: "Ask only one question at a time" },
      { label: "Ask several clear questions together" },
      { label: "Avoid questions unless necessary" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I can help. What day would work best for you?",
      },
      {
        label: "Example 2",
        text: "To understand this better, could you share when it happened?",
      },
      {
        label: "Example 3",
        text: "Please send your name, phone number, and the main thing you need help with.",
      },
    ],
  },
  {
    id: "overallDescription",
    question:
      "Describe in your own words how you want your AI Agent to sound overall",
    options: [
      { label: "Calm, helpful, and human", recommended: true },
      { label: "Professional, clear, and efficient" },
      { label: "Warm, patient, and reassuring" },
      { label: "Confident, direct, and practical" },
    ],
    customLabel: "Write your full description here",
    customRows: 7,
    examples: [
      {
        label: "Example 1",
        text: "Sound like a capable office assistant who answers first and only suggests appointments when useful.",
      },
      {
        label: "Example 2",
        text: "Sound professional but not cold. Be clear, patient, and helpful.",
      },
      {
        label: "Example 3",
        text: "Avoid sounding scripted. Keep replies natural, short, and useful.",
      },
    ],
  },
];

type LocalizedQuestion = {
  question: string;
  options: string[];
  customLabel?: string;
  examples: string[];
};

const SPANISH_QUESTIONS: Record<string, LocalizedQuestion> = {
  formality: {
    question: "¿Qué grado de formalidad debe tener el agente de IA?",
    options: ["Muy formal", "Profesional pero cercano", "Cercano e informal"],
    examples: [
      "Estimado paciente: gracias por su mensaje. Revisaremos el asunto lo antes posible.",
      "Hola, gracias por contactar. Estaré encantado de ayudarte.",
      "¡Hola! No te preocupes, estoy aquí para ayudarte 🙂",
    ],
  },
  warmth: {
    question: "¿Qué grado de cercanía y amabilidad debe tener el agente de IA?",
    options: ["Muy cercano", "Cercano y profesional", "Directo y eficaz"],
    examples: [
      "Entiendo que esto es importante para ti. Vamos paso a paso para darte la ayuda adecuada.",
      "Gracias por explicarlo. Puedo ayudarte con el siguiente paso.",
      "Recibido. Esto es lo que necesitamos para continuar.",
    ],
  },
  empathy: {
    question: "¿Qué grado de empatía debe mostrar el agente cuando un paciente está preocupado?",
    options: ["Muy empático", "Empatía equilibrada", "Más directo y orientado a soluciones"],
    examples: [
      "Siento que estés pasando por esto. Te ayudaré a trasladarlo a la persona adecuada cuanto antes.",
      "Lo entiendo. Vamos a centrarnos en lo que podemos hacer ahora.",
      "El siguiente paso es que nos envíes estos datos para que el equipo pueda revisarlos.",
    ],
  },
  directness: {
    question: "¿Debe conversar un poco o ser muy directo?",
    options: ["Conversador y cercano", "Equilibrado", "Muy directo"],
    examples: [
      "Lo entiendo. Para orientarte mejor, ¿puedes contarme qué ha ocurrido y cuándo empezó?",
      "Gracias. ¿Puedes compartir algo más de contexto para que podamos ayudarte bien?",
      "Indica la fecha, tu nombre y la consulta principal.",
    ],
  },
  appointmentStyle: {
    question: "¿Cómo debe gestionar el agente las solicitudes de cita?",
    options: ["Sugerirla con tacto cuando sea oportuno", "Solo cuando la pida el paciente", "Intentar reservar siempre"],
    examples: [
      "Primero puedo darte información general. Si después necesitas orientación personal, podemos ayudarte a concertar una cita.",
      "Sí, puedo ayudarte con una cita. ¿Qué día te viene mejor?",
      "El siguiente paso más adecuado es reservar una consulta. ¿Quieres concertarla ahora?",
    ],
  },
  overallTone: {
    question: "¿Qué tono general debe tener el agente de IA?",
    options: ["Tranquilo y paciente", "Enérgico y positivo", "Seguro y firme", "Atento y resolutivo"],
    examples: [
      "No hay problema. Tómate tu tiempo. Te ayudaré a encontrar el siguiente paso adecuado.",
      "Perfecto, podemos ayudarte. Empecemos por los datos importantes.",
      "Según lo que nos has contado, esta es la forma adecuada de proceder.",
    ],
  },
  phrasesUse: {
    question: "¿Hay palabras o expresiones que el agente deba utilizar a menudo?",
    options: ["Mantener un lenguaje sencillo y humano", "Usar a menudo el nombre de la clínica", "Usar un lenguaje tranquilizador", "Sin expresiones especiales"],
    customLabel: "O escribe las palabras y expresiones que prefieras",
    examples: [
      "Puedes decir: «Lo entiendo», «Vamos a revisarlo» y «Podemos ayudarte con eso».",
      "Usa el nombre de la clínica al confirmar citas o datos importantes.",
      "Evita sonar mecánico. Usa expresiones breves y naturales.",
    ],
  },
  phrasesAvoid: {
    question: "¿Hay palabras o expresiones que el agente no deba utilizar nunca?",
    options: ["Evitar expresiones robóticas", "Evitar jerga", "Evitar promesas excesivas", "Aún no hay expresiones prohibidas"],
    customLabel: "O escribe las palabras y expresiones que deben evitarse",
    examples: [
      "Evita expresiones como «Como asistente virtual» o «No puedo hacerlo».",
      "No prometas resultados, precios o plazos exactos si no están confirmados.",
      "Evita insistir en concertar una cita en cada mensaje.",
    ],
  },
  upsetClient: {
    question: "¿Cómo debe responder el agente cuando un paciente está molesto o frustrado?",
    options: ["Reconocer primero cómo se siente", "Disculparse y pasar a los siguientes pasos", "Mantener la calma y ser práctico", "Pasarlo pronto a una persona"],
    examples: [
      "Entiendo que esto resulte frustrante. Voy a ayudarte a trasladarlo a la persona adecuada.",
      "Siento que haya sido difícil. Esto es lo que podemos hacer ahora.",
      "Gracias por explicarlo. Se lo trasladaré al equipo para que pueda revisarlo correctamente.",
    ],
  },
  replyLength: {
    question: "¿Qué longitud deben tener normalmente las respuestas del agente?",
    options: ["Breves y claras", "Longitud media", "Detalladas y completas"],
    examples: [
      "Sí, podemos ayudarte. Indica tu nombre y el horario que prefieres.",
      "Sí, podemos ayudarte. Indica tu nombre, el mejor teléfono de contacto y qué día te viene bien.",
      "Sí, podemos ayudarte. Para prepararlo bien, indica tu nombre, teléfono, día preferido y un breve resumen de lo que necesitas.",
    ],
  },
  questionsBack: {
    question: "¿Debe hacer preguntas al paciente para entender mejor la consulta?",
    options: ["Sí, cuando falten datos", "Hacer solo una pregunta cada vez", "Hacer varias preguntas claras a la vez", "Evitar preguntas salvo que sean necesarias"],
    examples: [
      "Puedo ayudarte. ¿Qué día te viene mejor?",
      "Para entenderlo mejor, ¿puedes decirme cuándo ocurrió?",
      "Indica tu nombre, teléfono y el motivo principal de la consulta.",
    ],
  },
  overallDescription: {
    question: "Describe con tus propias palabras cómo debe comunicarse el agente de IA",
    options: ["Tranquilo, atento y humano", "Profesional, claro y eficaz", "Cercano, paciente y tranquilizador", "Seguro, directo y práctico"],
    customLabel: "Escribe aquí la descripción completa",
    examples: [
      "Debe parecer un asistente de clínica competente que responde primero y solo sugiere una cita cuando sea útil.",
      "Debe ser profesional sin resultar frío: claro, paciente y atento.",
      "Evita que suene mecánico. Las respuestas deben ser naturales, breves y útiles.",
    ],
  },
};

function localizedQuestion(question: WizardQuestion): LocalizedQuestion {
  if (!isSpainSpanishTenant()) {
    return {
      question: question.question,
      options: question.options.map((option) => option.label),
      customLabel: question.customLabel,
      examples: question.examples.map((example) => example.text),
    };
  }
  return SPANISH_QUESTIONS[question.id] ?? {
    question: question.question,
    options: question.options.map((option) => option.label),
    customLabel: question.customLabel,
    examples: question.examples.map((example) => example.text),
  };
}

const EMPTY_ANSWER: Answer = { selected: "", custom: "" };

const EMPTY_SETTINGS: AgentPersonalitySettings = {
  tone: "",
  formality: "",
  empathy: "",
  appointmentStyle: "",
  instructions: "",
  examples: [],
};

function emptyAnswers(): Record<string, Answer> {
  return QUESTIONS.reduce<Record<string, Answer>>((acc, question) => {
    acc[question.id] = { ...EMPTY_ANSWER };
    return acc;
  }, {});
}

function friendlyError(err: unknown, fallback: string) {
  const raw = err instanceof Error ? err.message : "";
  if (/configuration|configured|not ready|missing/i.test(raw)) {
    return tenantText(
      "The reply service is not ready yet. Please contact Unboks.",
      "El servicio de respuestas aún no está preparado. Contacta con Unboks.",
    );
  }
  return raw || fallback;
}

function answerText(answer?: Answer) {
  if (!answer) return "";
  return answer.custom.trim() || answer.selected.trim();
}

function findOption(question: WizardQuestion, value: string) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  const exact = question.options.find((option) => {
    const optionText = option.label.replace(" (Recommended)", "").trim().toLowerCase();
    return optionText === normalized;
  });
  return exact?.label ?? "";
}

function buildAnswersFromSettings(
  settings: AgentPersonalitySettings | undefined,
) {
  const next = emptyAnswers();
  if (!settings) return next;

  const seed: Record<string, string> = {
    formality: settings.formality,
    warmth: settings.tone,
    empathy: settings.empathy,
    appointmentStyle: settings.appointmentStyle,
    overallDescription: settings.instructions,
  };

  QUESTIONS.forEach((question) => {
    const value = seed[question.id]?.trim();
    if (!value) return;
    const option = findOption(question, value);
    next[question.id] = option
      ? { selected: option, custom: "" }
      : { selected: "", custom: value };
  });

  return next;
}

function buildInstructions(answers: Record<string, Answer>) {
  const lines = [
    "Agent style guide",
    "",
    `Formality: ${answerText(answers.formality) || "Professional but Friendly"}`,
    `Warmth: ${answerText(answers.warmth) || "Warm & Professional"}`,
    `Empathy: ${answerText(answers.empathy) || "Balanced Empathy"}`,
    `Conversation style: ${answerText(answers.directness) || "Balanced"}`,
    `Appointment behavior: ${
      answerText(answers.appointmentStyle) || "Gently suggest when appropriate"
    }`,
    `Overall tone: ${answerText(answers.overallTone) || "Calm & Patient"}`,
    `Phrases to use often: ${answerText(answers.phrasesUse) || "Keep it simple and human"}`,
    `Phrases to avoid: ${answerText(answers.phrasesAvoid) || "Avoid robotic phrases"}`,
    `When a client is upset: ${
      answerText(answers.upsetClient) || "Acknowledge feelings first"
    }`,
    `Reply length: ${answerText(answers.replyLength) || "Medium Length"}`,
    `Questions back to clients: ${
      answerText(answers.questionsBack) || "Yes, when details are missing"
    }`,
    `Overall description: ${
      answerText(answers.overallDescription) ||
      "Calm, helpful, human, and useful."
    }`,
    "",
    "Important behavior",
    "- Answer the client question first when possible.",
    "- Do not push appointments in every message.",
    "- Sound like a capable office assistant, not a chatbot.",
    "- Keep the reply natural and useful.",
  ];
  return lines.join("\n");
}

function buildSettings(
  answers: Record<string, Answer>,
  examples: string[],
): AgentPersonalitySettings {
  return {
    tone: answerText(answers.overallTone) || answerText(answers.warmth),
    formality: answerText(answers.formality),
    empathy: answerText(answers.empathy),
    appointmentStyle: answerText(answers.appointmentStyle),
    instructions: buildInstructions(answers),
    examples,
  };
}

function defaultExamplesFromAnswers(answers: Record<string, Answer>) {
  return [
    `Thanks for reaching out. I understand what you’re asking. ${answerText(answers.questionsBack) || "Could you share a little more detail so we can help properly?"}`,
    `I can help with that. ${answerText(answers.appointmentStyle) || "I’ll answer what I can first, and if needed we can help schedule a time."}`,
    `I understand this may feel stressful. ${answerText(answers.upsetClient) || "Let’s focus on the next step and make sure the right person sees this."}`,
  ];
}

export function AgentPersonalityWizard() {
  const {
    settings,
    isLoading,
    loadError,
    generateExamples,
    isGenerating,
    save,
    isSaving,
  } = useAgentPersonality();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(emptyAnswers);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [customFeedbackOpen, setCustomFeedbackOpen] = useState(false);
  const [customFeedback, setCustomFeedback] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAnswers(buildAnswersFromSettings(settings));
  }, [settings]);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(t);
  }, [saved]);

  const inSimulation = step >= QUESTIONS.length;
  const currentQuestion = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  const currentQuestionCopy = localizedQuestion(currentQuestion);
  const currentAnswer = answers[currentQuestion.id] ?? EMPTY_ANSWER;
  const isLastQuestion = step === QUESTIONS.length - 1;
  const progressValue = inSimulation
    ? 100
    : Math.round(((step + 1) / QUESTIONS.length) * 100);

  const canContinue = useMemo(() => {
    if (inSimulation) return true;
    return Boolean(answerText(currentAnswer));
  }, [currentAnswer, inSimulation]);

  const styleSettings = useMemo(() => {
    const examples = chat
      .filter((item) => item.role === "agent")
      .map((item) => item.text.trim())
      .filter(Boolean);
    return buildSettings(
      answers,
      examples.length ? examples : defaultExamplesFromAnswers(answers),
    );
  }, [answers, chat]);

  const updateAnswer = (questionId: string, patch: Partial<Answer>) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] ?? EMPTY_ANSWER),
        ...patch,
      },
    }));
  };

  const appendChat = (role: ChatMessage["role"], text: string) => {
    setChat((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, role, text },
    ]);
  };

  const prepareAgentReply = async (clientMessage: string, feedback?: string) => {
    const request: AgentPersonalitySettings = {
      ...styleSettings,
      instructions: [
        styleSettings.instructions,
        "",
        "Test reply request",
        `Client message: ${clientMessage}`,
        feedback ? `Adjustment requested: ${feedback}` : "",
        "Write one natural reply in the chosen business style.",
        isSpainSpanishTenant()
          ? "Reply in Spanish from Spain and use natural language suitable for a psychology clinic."
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };

    const result = await generateExamples(request);
    return (
      result.examples[0]?.trim() ||
      tenantText(
        "Thanks for explaining. I can help with that. Could you share one more detail so we can guide you properly?",
        "Gracias por explicarlo. Puedo ayudarte. ¿Puedes darme algún detalle más para que podamos orientarte correctamente?",
      )
    );
  };

  const handleSendMessage = async (feedback?: string) => {
    const clientMessage =
      message.trim() ||
      chat
        .filter((item) => item.role === "client")
        .slice(-1)[0]
        ?.text.trim();
    if (!clientMessage) return;

    if (message.trim()) {
      appendChat("client", message.trim());
      setMessage("");
    }

    try {
      const reply = await prepareAgentReply(clientMessage, feedback);
      appendChat("agent", reply);
      setCustomFeedbackOpen(false);
      setCustomFeedback("");
    } catch (err) {
      toast.error(friendlyError(
        err,
        tenantText(
          "Could not prepare a reply yet.",
          "Aún no se ha podido preparar una respuesta.",
        ),
      ));
    }
  };

  const handleFeedback = (feedback: string) => {
    if (feedback === "This is good") {
      toast.success(tenantText(
        "Good. You can keep testing or lock in this style.",
        "Perfecto. Puedes seguir probando o guardar este estilo.",
      ));
      return;
    }
    void handleSendMessage(feedback);
  };

  const handleSave = async () => {
    try {
      const result = await save(styleSettings);
      setAnswers(buildAnswersFromSettings(result));
      setSaved(true);
      if (result.bridgeSaved === false) {
        toast.warning(tenantText(
          "Saved. The live update did not confirm yet.",
          "Guardado. La actualización en directo aún no se ha confirmado.",
        ));
      } else {
        toast.success(tenantText(
          "Style saved and activated.",
          "Estilo guardado y activado.",
        ));
      }
    } catch (err) {
      toast.error(friendlyError(
        err,
        tenantText("Could not save this style.", "No se ha podido guardar este estilo."),
      ));
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-[#e8eaed] bg-white px-5 py-5 text-[14px] text-[#5f6368]">
        {tenantText(
          "Loading your AI Agent style...",
          "Cargando el estilo del agente de IA...",
        )}
      </section>
    );
  }

  if (!started) {
    return (
      <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
        <div className="mx-auto flex min-h-[520px] max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f0fe] text-[#1a73e8]">
            <Sparkles className="h-7 w-7" />
          </span>
          <h3 className="text-[28px] font-semibold tracking-normal text-[#202124]">
            {tenantText(
              "Let’s personalize your AI Agent",
              "Personaliza tu agente de IA",
            )}
          </h3>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#5f6368]">
            {tenantText(
              "This will help your AI Agent reply to your clients in a way that matches your business style. It’s an important step and will take about 5–7 minutes.",
              "Esto ayudará al agente de IA a responder a tus pacientes con el estilo de la clínica. Es un paso importante y tardará unos 5–7 minutos.",
            )}
          </p>
          {loadError && (
            <div className="mt-6 rounded-xl border border-[#f6caca] bg-[#fce8e6] px-4 py-3 text-left text-[13px] text-[#a50e0e]">
              {tenantText(
                "Could not load the current style. You can still continue.",
                "No se ha podido cargar el estilo actual. Puedes continuar de todos modos.",
              )}
            </div>
          )}
          <Button
            type="button"
            size="lg"
            className="mt-8 min-w-[220px] rounded-xl bg-[#1a73e8] text-white"
            onClick={() => setStarted(true)}
          >
            {tenantText("Start Personalizing", "Empezar a personalizar")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
      <header className="border-b border-[#edf0f3] bg-[#fbfcfd] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
              {inSimulation
                ? tenantText("Test your AI Agent", "Prueba tu agente de IA")
                : tenantText(
                    `Step ${step + 1} of ${QUESTIONS.length}`,
                    `Paso ${step + 1} de ${QUESTIONS.length}`,
                  )}
            </p>
            <span className="rounded-full border border-[#d8dde3] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#6b7280]">
              {inSimulation
                ? tenantText("Ready to save", "Listo para guardar")
                : tenantText(`${progressValue}% complete`, `${progressValue}% completado`)}
            </span>
          </div>
          <Progress value={progressValue} className="h-1.5 bg-[#e8eaed]" />
        </div>
      </header>

      {inSimulation ? (
        <div className="mx-auto max-w-[760px] px-4 py-5 sm:px-5">
          <div className="mb-4">
            <h3 className="text-[20px] font-semibold tracking-normal text-[#202124]">
              {tenantText(
                "Test your AI Agent before saving",
                "Prueba tu agente de IA antes de guardar",
              )}
            </h3>
            <p className="mt-1.5 text-[13px] leading-5 text-[#5f6368]">
              {tenantText(
                "Type a sample message as if a client sent it. See how your AI Agent would reply.",
                "Escribe un mensaje de ejemplo como si lo hubiera enviado un paciente y comprueba cómo respondería el agente.",
              )}
            </p>
          </div>

          <div className="rounded-xl border border-[#e8eaed] bg-[#f8fafd] p-3 sm:p-4">
            <div className="min-h-[220px] space-y-3">
              {chat.length === 0 ? (
                <div className="flex min-h-[190px] flex-col items-center justify-center rounded-lg border border-dashed border-[#dadce0] bg-white px-4 text-center">
                  <MessageCircle className="mb-2 h-5 w-5 text-[#9aa0a6]" />
                  <p className="text-[13px] font-medium text-[#3c4043]">
                    {tenantText(
                      "Send a sample client message to test the style.",
                      "Envía un mensaje de ejemplo de un paciente para probar el estilo.",
                    )}
                  </p>
                </div>
              ) : (
                chat.map((item, index) => {
                  const isAgent = item.role === "agent";
                  const isLastAgent =
                    isAgent &&
                    index ===
                      chat
                        .map((messageItem, messageIndex) =>
                          messageItem.role === "agent" ? messageIndex : -1,
                        )
                        .filter((messageIndex) => messageIndex >= 0)
                        .slice(-1)[0];
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex",
                        isAgent ? "justify-end" : "justify-start",
                      )}
                    >
                      <div className="max-w-[78%]">
                        <div
                          className={cn(
                            "rounded-xl px-3.5 py-2.5 text-[13px] leading-5 shadow-sm",
                            isAgent
                              ? "bg-[#1a73e8] text-white"
                              : "border border-[#e8eaed] bg-white text-[#202124]",
                          )}
                        >
                          {item.text}
                        </div>
                        {isLastAgent && (
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            {[
                              "This is good",
                              "Make it warmer",
                              "Make it more professional",
                              "Make it shorter",
                            ].map((label) => (
                              <Button
                                key={label}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isGenerating || isSaving}
                                onClick={() => handleFeedback(label)}
                                className="min-h-[30px] rounded-full bg-white px-2.5 text-[11px]"
                              >
                                {label === "This is good"
                                  ? tenantText(label, "Está bien")
                                  : label === "Make it warmer"
                                  ? tenantText(label, "Más cercano")
                                  : label === "Make it more professional"
                                  ? tenantText(label, "Más profesional")
                                  : tenantText(label, "Más breve")}
                              </Button>
                            ))}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isGenerating || isSaving}
                              onClick={() => setCustomFeedbackOpen((v) => !v)}
                              className="min-h-[30px] rounded-full bg-white px-2.5 text-[11px]"
                            >
                              {tenantText("Custom instruction", "Instrucción personalizada")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {customFeedbackOpen && (
              <div className="mt-3 rounded-lg border border-[#dadce0] bg-white p-3">
                <label className="mb-1.5 block text-[12px] font-medium text-[#3c4043]">
                  {tenantText("Custom instruction", "Instrucción personalizada")}
                </label>
                <Textarea
                  value={customFeedback}
                  onChange={(event) => setCustomFeedback(event.target.value)}
                  rows={2}
                  className="resize-y bg-white text-[13px]"
                  placeholder={tenantText(
                    "Example: Make this reply more relaxed and less sales-focused.",
                    "Ejemplo: Haz que la respuesta sea más natural y menos comercial.",
                  )}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    disabled={!customFeedback.trim() || isGenerating}
                    onClick={() => handleSendMessage(customFeedback.trim())}
                    className="min-h-[34px] rounded-lg bg-[#1a73e8] px-3 text-[12px] text-white"
                  >
                    {tenantText("Apply instruction", "Aplicar instrucción")}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={2}
                className="resize-y bg-white text-[13px]"
                placeholder={tenantText(
                  "Type a sample client message...",
                  "Escribe un mensaje de ejemplo del paciente...",
                )}
              />
              <Button
                type="button"
                disabled={!message.trim() || isGenerating || isSaving}
                onClick={() => handleSendMessage()}
                className="min-h-[40px] w-full rounded-lg bg-[#1a73e8] text-[13px] text-white sm:h-auto sm:w-auto sm:min-w-[92px]"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  tenantText("Send", "Enviar")
                )}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(QUESTIONS.length - 1)}
              disabled={isGenerating || isSaving}
              className="min-h-[36px] rounded-lg bg-white px-3 text-[13px]"
            >
              <ArrowLeft className="h-4 w-4" />
              {tenantText("Back", "Volver")}
            </Button>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span
                className={cn(
                  "text-center text-[13px] text-[#137333] transition-opacity sm:text-left",
                  saved ? "opacity-100" : "opacity-0",
                )}
              >
                {tenantText("Saved", "Guardado")}
              </span>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isGenerating}
                className="min-h-[40px] whitespace-normal rounded-lg bg-[#1a73e8] px-4 text-[13px] leading-5 text-white"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {tenantText(
                  "Yes, this is perfect – Lock in this style for my AI Agent",
                  "Sí, está perfecto. Guardar este estilo para mi agente de IA",
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-[760px] px-4 py-5 sm:px-5">
          <div className="mb-4">
            <h3 className="text-[20px] font-semibold tracking-normal text-[#202124]">
              {currentQuestionCopy.question}
            </h3>
          </div>

          <div className="grid gap-2">
            {currentQuestion.options.map((option, optionIndex) => {
              const selected = currentAnswer.selected === option.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() =>
                    updateAnswer(currentQuestion.id, {
                      selected: option.label,
                      custom: "",
                    })
                  }
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                    selected
                      ? "border-[#1a73e8] bg-[#e8f0fe]"
                      : "border-[#e8eaed] bg-white hover:bg-[#f8f9fa]",
                  )}
                >
                  <span className="text-[14px] font-medium text-[#202124]">
                    {currentQuestionCopy.options[optionIndex] ?? option.label}
                  </span>
                  <span className="flex items-center gap-2">
                    {option.recommended && (
                      <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-semibold text-[#137333]">
                        {tenantText("Recommended", "Recomendado")}
                      </span>
                    )}
                    <span
                      className={cn(
                        "grid h-4 w-4 place-items-center rounded-full border",
                        selected
                          ? "border-[#1a73e8] bg-[#1a73e8] text-white"
                          : "border-[#dadce0] bg-white text-transparent",
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12px] font-medium text-[#3c4043]">
              {currentQuestionCopy.customLabel ??
                tenantText("Or write your own answer", "O escribe tu propia respuesta")}
            </span>
            <Textarea
              value={currentAnswer.custom}
              onChange={(event) =>
                updateAnswer(currentQuestion.id, {
                  selected: "",
                  custom: event.target.value,
                })
              }
              rows={currentQuestion.customRows ?? 2}
              className="min-h-[68px] resize-y bg-white text-[13px]"
              placeholder={tenantText(
                "Write your own answer...",
                "Escribe tu propia respuesta...",
              )}
            />
          </label>

          <div className="mt-5">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
              {tenantText("Real-world reply examples", "Ejemplos de respuestas reales")}
            </p>
            <div className="grid gap-2 lg:grid-cols-3">
              {currentQuestion.examples.map((example, exampleIndex) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() =>
                    updateAnswer(currentQuestion.id, {
                      selected: "",
                      custom: currentQuestionCopy.examples[exampleIndex] ?? example.text,
                    })
                  }
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    currentAnswer.custom === (currentQuestionCopy.examples[exampleIndex] ?? example.text)
                      ? "border-[#1a73e8] bg-[#e8f0fe]"
                      : "border-[#e8eaed] bg-[#fbfbfd] hover:border-[#1a73e8] hover:bg-[#f6faff]",
                  )}
                  aria-label={tenantText(
                    `Use ${example.label} as your answer`,
                    `Usar el ejemplo ${exampleIndex + 1} como respuesta`,
                  )}
                >
                  <p className="mb-1.5 text-[11px] font-semibold text-[#1a73e8]">
                    {tenantText(example.label, `Ejemplo ${exampleIndex + 1}`)}
                  </p>
                  <p className="text-[12px] leading-5 text-[#3c4043]">
                    {currentQuestionCopy.examples[exampleIndex] ?? example.text}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eaed] pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (step === 0) {
                  setStarted(false);
                } else {
                  setStep((current) => current - 1);
                }
              }}
              className="min-h-[34px] rounded-lg bg-white px-3 text-[13px]"
            >
              <ArrowLeft className="h-4 w-4" />
              {tenantText("Back", "Volver")}
            </Button>
            <Button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep((current) => current + 1)}
              className="min-h-[34px] rounded-lg bg-[#1a73e8] px-4 text-[13px] text-white"
            >
              {isLastQuestion
                ? tenantText("Test your AI Agent", "Probar el agente de IA")
                : tenantText("Next", "Siguiente")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
