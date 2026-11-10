import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Interface-language support. Only the interface (navigation, chatbot chrome) is
 * translated; condition records and database results stay in English, and the chatbot says so.
 * `speech` is the BCP-47 tag used for text-to-speech and speech recognition.
 */
export const LANGS = [
    { id: "en", label: "English", speech: "en-IN" },
    { id: "hi", label: "हिन्दी", speech: "hi-IN" },
    { id: "te", label: "తెలుగు", speech: "te-IN" },
    { id: "ta", label: "தமிழ்", speech: "ta-IN" },
] as const;

export type LangId = (typeof LANGS)[number]["id"];

const T: Record<string, Partial<Record<LangId, string>>> = {
    Learn: { hi: "सीखें", te: "నేర్చుకోండి", ta: "கற்க" },
    Anatomy: { hi: "शरीर रचना", te: "శరీర నిర్మాణం", ta: "உடற்கூறியல்" },
    Lab: { hi: "प्रयोगशाला", te: "ల్యాబ్", ta: "ஆய்வகம்" },
    "Virtual Trials": { hi: "वर्चुअल ट्रायल", te: "వర్చువల్ ట్రయల్స్", ta: "மெய்நிகர் சோதனைகள்" },
    "AI Copilot": { hi: "एआई कोपायलट", te: "ఏఐ కోపైలట్", ta: "ஏஐ கோபைலட்" },
    Evidence: { hi: "साक्ष्य", te: "ఆధారాలు", ta: "சான்றுகள்" },
    Methods: { hi: "पद्धति", te: "పద్ధతులు", ta: "முறைகள்" },
    Funding: { hi: "वित्त पोषण", te: "నిధులు", ta: "நிதி" },
    "MedBase helper": { hi: "मेडबेस सहायक", te: "మెడ్‌బేస్ సహాయకుడు", ta: "மெட்பேஸ் உதவியாளர்" },
    "Scripted guide, not an AI model": {
        hi: "स्क्रिप्टेड गाइड, AI मॉडल नहीं",
        te: "స్క్రిప్ట్ చేసిన గైడ్, AI మోడల్ కాదు",
        ta: "ஸ்கிரிப்ட் செய்யப்பட்ட வழிகாட்டி, AI மாடல் அல்ல",
    },
    greeting: {
        en: 'Hi! What can I help you with today? Pick a topic below or type a condition, like "bone TB".',
        hi: "नमस्ते! आज मैं आपकी क्या मदद कर सकता हूँ? नीचे कोई विषय चुनें या किसी बीमारी का नाम लिखें, जैसे \"bone TB\"।",
        te: "నమస్కారం! ఈ రోజు నేను మీకు ఎలా సహాయం చేయగలను? కింద ఒక అంశాన్ని ఎంచుకోండి లేదా వ్యాధి పేరు టైప్ చేయండి, ఉదా. \"bone TB\".",
        ta: "வணக்கம்! இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்? கீழே ஒரு தலைப்பைத் தேர்ந்தெடுக்கவும் அல்லது நோயின் பெயரை உள்ளிடவும், எ.கா. \"bone TB\".",
    },
    "Browse conditions": { hi: "बीमारियाँ देखें", te: "వ్యాధులను చూడండి", ta: "நோய்களைப் பார்க்க" },
    "How does the Lab work?": { hi: "प्रयोगशाला कैसे काम करती है?", te: "ల్యాబ్ ఎలా పనిచేస్తుంది?", ta: "ஆய்வகம் எப்படி செயல்படுகிறது?" },
    "Region, soil and food info": {
        hi: "क्षेत्र, मिट्टी और भोजन की जानकारी",
        te: "ప్రాంతం, నేల, ఆహార సమాచారం",
        ta: "பகுதி, மண், உணவு தகவல்",
    },
    "Type a message": { hi: "संदेश लिखें", te: "సందేశం టైప్ చేయండి", ta: "செய்தியை உள்ளிடவும்" },
    notFound: {
        en: "I could not find that. Try a condition name, or ask about the Lab or region and food information. For personal medical questions, please see a clinician.",
        hi: "मुझे यह नहीं मिला। किसी बीमारी का नाम (अंग्रेज़ी में) आज़माएँ, या प्रयोगशाला के बारे में पूछें। व्यक्तिगत चिकित्सा प्रश्नों के लिए कृपया डॉक्टर से मिलें।",
        te: "నాకు అది దొరకలేదు. వ్యాధి పేరును (ఇంగ్లీష్‌లో) ప్రయత్నించండి, లేదా ల్యాబ్ గురించి అడగండి. వ్యక్తిగత వైద్య ప్రశ్నలకు దయచేసి వైద్యుడిని కలవండి.",
        ta: "அது கிடைக்கவில்லை. நோயின் பெயரை (ஆங்கிலத்தில்) முயற்சிக்கவும், அல்லது ஆய்வகம் பற்றி கேளுங்கள். தனிப்பட்ட மருத்துவ கேள்விகளுக்கு மருத்துவரை அணுகவும்.",
    },
    englishOnly: {
        en: "",
        hi: "ध्यान दें: बीमारियों की जानकारी अभी अंग्रेज़ी में है।",
        te: "గమనిక: వ్యాధుల సమాచారం ప్రస్తుతం ఇంగ్లీష్‌లో ఉంది.",
        ta: "குறிப்பு: நோய் தகவல்கள் தற்போது ஆங்கிலத்தில் உள்ளன.",
    },
    Speak: { hi: "बोलें", te: "మాట్లాడండి", ta: "பேசுங்கள்" },
    "Read aloud": { hi: "सुनें", te: "వినండి", ta: "கேளுங்கள்" },
    "Language": { hi: "भाषा", te: "భాష", ta: "மொழி" },
};

interface LangValue {
    lang: LangId;
    setLang: (l: LangId) => void;
    t: (key: string) => string;
    speech: string;
}

const KEY = "medbase.lang";
const LangContext = createContext<LangValue | null>(null);

const initial = (): LangId => {
    try {
        const v = localStorage.getItem(KEY);
        if (LANGS.some((l) => l.id === v)) return v as LangId;
    } catch {
        /* storage unavailable */
    }
    return "en";
};

export const LangProvider = ({ children }: { children: ReactNode }) => {
    const [lang, setLangState] = useState<LangId>(initial);
    const setLang = (l: LangId) => {
        setLangState(l);
        document.documentElement.lang = l;
        try {
            localStorage.setItem(KEY, l);
        } catch {
            /* stays for this session */
        }
    };
    const t = (key: string) => T[key]?.[lang] ?? T[key]?.en ?? key;
    const speech = LANGS.find((l) => l.id === lang)!.speech;
    return <LangContext.Provider value={{ lang, setLang, t, speech }}>{children}</LangContext.Provider>;
};

export const useLang = () => {
    const v = useContext(LangContext);
    if (!v) throw new Error("useLang must be used inside LangProvider");
    return v;
};

/** Speaks text with a voice for `speech`; returns false when the device has none for it. */
export const speak = (text: string, speech: string): boolean => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    const base = speech.split("-")[0];
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === speech || v.lang.startsWith(base));
    if (!voice && base !== "en") return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speech;
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
    return true;
};
