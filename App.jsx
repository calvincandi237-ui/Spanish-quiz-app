import { useState, useRef, useMemo, useEffect } from "react";
import { Trophy, BookOpen, Repeat2, Check, X, Globe, RotateCcw, ArrowLeft, ArrowRight, Coins, Utensils, Plane, Briefcase, Users, User, ShoppingBag, Stethoscope, Car, GraduationCap, Dumbbell, Sparkles, Volume2, Timer, ListChecks, Flame, Snowflake, Table2, SkipForward } from "lucide-react";

// Local-storage-backed replacement for Claude's window.storage API.
// window.storage only exists inside Claude's artifact sandbox — this shim
// gives the standalone deployed app the same {key, value} shape so every
// loadX()/saveX() function below works unchanged outside that sandbox.
const storage = {
  async get(key) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? null : { key, value };
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch {
      return null;
    }
  },
};

/* ---------------------------------------------------------------
   STYLE SYSTEM
------------------------------------------------------------------*/
const COLORS = {
  stage: "#0B1120",
  panel: "#141D33",
  panelBorder: "#293451",
  gold: "#E8B23D",
  cream: "#F5F1E6",
  muted: "#8E9AB8",
  green: "#3FB68A",
  red: "#E2564F",
};

const STAGE_GLOW = [
  "radial-gradient(circle at 50% 8%, rgba(232,178,61,0.20), rgba(232,178,61,0) 42%)",
  "repeating-radial-gradient(circle at 50% 8%, transparent 0px, transparent 68px, rgba(232,178,61,0.05) 69px, rgba(232,178,61,0.05) 70px)",
].join(", ");

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Manrope:wght@400;500;600;700;800&display=swap');

  .quiz-root { font-family: 'Manrope', system-ui, sans-serif; }
  .marquee { font-family: 'Bebas Neue', sans-serif; }

  .stage-btn {
    background-color: #141D33;
    border: 2px solid #293451;
    color: #F5F1E6;
    transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.15s ease;
  }
  .stage-btn:hover { border-color: var(--accent, #E8B23D); background-color: #192245; }
  .stage-btn:focus-visible { outline: 2px solid #E8B23D; outline-offset: 2px; }
  .stage-btn:active { transform: scale(0.97); }

  .gold-btn {
    background-color: #E8B23D;
    color: #0B1120;
    border: none;
    transition: background-color 0.2s ease, transform 0.15s ease;
  }
  .gold-btn:hover { background-color: #F4CD6A; }
  .gold-btn:active { transform: scale(0.97); }
  .gold-btn:focus-visible { outline: 2px solid #F5F1E6; outline-offset: 2px; }

  .ghost-btn {
    background-color: transparent;
    border: 2px solid #293451;
    color: #8E9AB8;
    transition: border-color 0.2s ease, color 0.2s ease;
  }
  .ghost-btn:hover { border-color: #8E9AB8; color: #F5F1E6; }
  .ghost-btn:focus-visible { outline: 2px solid #E8B23D; outline-offset: 2px; }

  .option-btn {
    background-color: #141D33;
    border: 2px solid #293451;
    color: #F5F1E6;
    transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.15s ease, opacity 0.2s ease;
  }
  .option-btn:disabled { cursor: default; }
  .option-btn.selected { border-color: #E8B23D; background-color: rgba(232,178,61,0.14); }
  .option-btn.correct { border-color: #3FB68A; background-color: rgba(63,182,138,0.16); animation: pulse-correct 0.5s ease; }
  .option-btn.wrong { border-color: #E2564F; background-color: rgba(226,86,79,0.16); opacity: 0.7; animation: shake-wrong 0.4s ease; }
  .option-btn:disabled:not(.correct):not(.wrong) { opacity: 0.4; }

  @keyframes pulse-correct {
    0% { transform: scale(1); }
    40% { transform: scale(1.05); }
    100% { transform: scale(1.02); }
  }
  @keyframes shake-wrong {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(2px); }
  }

  .stage-card {
    background-color: #141D33;
    border: 2px solid var(--accent, #E8B23D);
    box-shadow: 0 0 40px 6px var(--accent-glow-outer, rgba(232,178,61,0.20)), inset 0 0 0 1px var(--accent-glow-inner, rgba(232,178,61,0.30));
  }

  .letter-badge { background-color: var(--accent, #E8B23D); color: #0B1120; }

  @keyframes confetti-burst {
    0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); opacity: 0; }
  }
  .confetti-piece {
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 1px;
    animation-name: confetti-burst;
    animation-timing-function: cubic-bezier(0.15, 0.7, 0.3, 1);
    animation-fill-mode: forwards;
  }
  @media (prefers-reduced-motion: reduce) {
    .confetti-piece { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-btn, .option-btn, .gold-btn { transition: none; }
    .stage-btn:active, .gold-btn:active { transform: none; }
    .option-btn.correct, .option-btn.wrong { animation: none; }
  }
`;

/* ---------------------------------------------------------------
   DATA
------------------------------------------------------------------*/
const LANGUAGES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "uk", name: "Українська", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "ka", name: "ქართული", dir: "ltr" },
  { code: "fr", name: "Français", dir: "ltr" },
];

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Green -> rose spectrum: reads as "easier to harder" at a glance.
const LEVEL_COLORS = {
  A1: "#4ADE80",
  A2: "#38BDF8",
  B1: "#818CF8",
  B2: "#C084FC",
  C1: "#F472B6",
  C2: "#FB7185",
};

const CATEGORIES = [
  { id: "food", icon: Utensils, color: "#FB923C" },
  { id: "travel", icon: Plane, color: "#38BDF8" },
  { id: "work", icon: Briefcase, color: "#FBBF24" },
  { id: "family", icon: Users, color: "#F472B6" },
  { id: "shopping", icon: ShoppingBag, color: "#C084FC" },
  { id: "medicine", icon: Stethoscope, color: "#F87171" },
  { id: "transport", icon: Car, color: "#2DD4BF" },
  { id: "education", icon: GraduationCap, color: "#818CF8" },
  { id: "sports", icon: Dumbbell, color: "#4ADE80" },
];

// Vocabulary bank, tagged by CEFR level. Each entry: Spanish word + translation
// in all 5 interface languages. In-game, the NATIVE-language word is the prompt
// and the 4 answer options are Spanish words (1 correct + 3 same-level distractors).
const VOCAB_BANK = [
  // ---- A1 ----
  { level: "A1", es: "rápido", en: "fast", uk: "швидкий", ar: "سريع", ka: "სწრაფი", fr: "rapide" },
  { level: "A1", es: "lento", en: "slow", uk: "повільний", ar: "بطيء", ka: "ნელი", fr: "lent" },
  { level: "A1", es: "limpio", en: "clean", uk: "чистий", ar: "نظيف", ka: "სუფთა", fr: "propre" },
  { level: "A1", es: "sucio", en: "dirty", uk: "брудний", ar: "متسخ", ka: "ჭუჭყიანი", fr: "sale" },
  { level: "A1", es: "fuerte", en: "strong", uk: "сильний", ar: "قوي", ka: "ძლიერი", fr: "fort" },
  { level: "A1", es: "feliz", en: "happy", uk: "щасливий", ar: "سعيد", ka: "ბედნიერი", fr: "heureux" },
  { level: "A1", es: "triste", en: "sad", uk: "сумний", ar: "حزين", ka: "მწუხარე", fr: "triste" },
  { level: "A1", es: "cansado", en: "tired", uk: "втомлений", ar: "متعب", ka: "დაღლილი", fr: "fatigué" },
  { level: "A1", es: "grande", en: "big", uk: "великий", ar: "كبير", ka: "დიდი", fr: "grand" },
  { level: "A1", es: "pequeño", en: "small", uk: "маленький", ar: "صغير", ka: "პატარა", fr: "petit" },
  { level: "A1", es: "alto", en: "tall", uk: "високий", ar: "عالٍ", ka: "მაღალი", fr: "haut" },
  { level: "A1", es: "bajo", en: "short", uk: "низький", ar: "منخفض", ka: "დაბალი", fr: "bas" },
  { level: "A1", es: "nuevo", en: "new", uk: "новий", ar: "جديد", ka: "ახალი", fr: "nouveau" },
  { level: "A1", es: "viejo", en: "old", uk: "старий", ar: "قديم", ka: "ძველი", fr: "vieux" },
  { level: "A1", es: "joven", en: "young", uk: "молодий", ar: "يافع", ka: "ახალგაზრდა", fr: "jeune" },
  { level: "A1", es: "bonito", en: "pretty", uk: "гарний", ar: "جميل", ka: "ლამაზი", fr: "joli" },
  { level: "A1", es: "feo", en: "ugly", uk: "потворний", ar: "قبيح", ka: "მახინჯი", fr: "laid" },
  { level: "A1", es: "caliente", en: "hot", uk: "гарячий", ar: "ساخن", ka: "ცხელი", fr: "chaud" },
  { level: "A1", es: "frío", en: "cold", uk: "холодний", ar: "بارد", ka: "ცივი", fr: "froid" },
  { level: "A1", es: "rojo", en: "red", uk: "червоний", ar: "أحمر", ka: "წითელი", fr: "rouge" },
  { level: "A1", es: "azul", en: "blue", uk: "синій", ar: "أزرق", ka: "ლურჯი", fr: "bleu" },
  { level: "A1", es: "verde", en: "green", uk: "зелений", ar: "أخضر", ka: "მწვანე", fr: "vert" },
  { level: "A1", es: "amarillo", en: "yellow", uk: "жовтий", ar: "أصفر", ka: "ყვითელი", fr: "jaune" },
  { level: "A1", es: "negro", en: "black", uk: "чорний", ar: "أسود", ka: "შავი", fr: "noir" },
  { level: "A1", es: "blanco", en: "white", uk: "білий", ar: "أبيض", ka: "თეთრი", fr: "blanc" },
  { level: "A1", es: "naranja", en: "orange", uk: "помаранчевий", ar: "برتقالي", ka: "ნარინჯისფერი", fr: "orange" },
  { level: "A1", es: "rosa", en: "pink", uk: "рожевий", ar: "وردي", ka: "ვარდისფერი", fr: "rose" },
  { level: "A1", es: "gris", en: "gray", uk: "сірий", ar: "رمادي", ka: "რუხი", fr: "gris" },
  { level: "A1", es: "morado", en: "purple", uk: "фіолетовий", ar: "بنفسجي", ka: "იისფერი", fr: "violet" },
  { level: "A1", es: "madre", en: "mother", uk: "мати", ar: "أم", ka: "დედა", fr: "mère", category: "family" },
  { level: "A1", es: "padre", en: "father", uk: "батько", ar: "أب", ka: "მამა", fr: "père", category: "family" },
  { level: "A1", es: "hermano", en: "brother", uk: "брат", ar: "أخ", ka: "ძმა", fr: "frère", category: "family" },
  { level: "A1", es: "hermana", en: "sister", uk: "сестра", ar: "أخت", ka: "და", fr: "sœur", category: "family" },
  { level: "A1", es: "hijo", en: "son", uk: "син", ar: "ابن", ka: "ვაჟიშვილი", fr: "fils", category: "family" },
  { level: "A1", es: "hija", en: "daughter", uk: "дочка", ar: "ابنة", ka: "ქალიშვილი", fr: "fille", category: "family" },
  { level: "A1", es: "abuelo", en: "grandfather", uk: "дідусь", ar: "جد", ka: "პაპა", fr: "grand-père", category: "family" },
  { level: "A1", es: "abuela", en: "grandmother", uk: "бабуся", ar: "جدة", ka: "ბებია", fr: "grand-mère", category: "family" },
  { level: "A1", es: "tío", en: "uncle", uk: "дядько", ar: "عم", ka: "ბიძა", fr: "oncle", category: "family" },
  { level: "A1", es: "tía", en: "aunt", uk: "тітка", ar: "عمة", ka: "დეიდა", fr: "tante", category: "family" },
  { level: "A1", es: "casa", en: "house", uk: "дім", ar: "بيت", ka: "სახლი", fr: "maison" },
  { level: "A1", es: "agua", en: "water", uk: "вода", ar: "ماء", ka: "წყალი", fr: "eau" },
  { level: "A1", es: "comida", en: "food", uk: "їжа", ar: "طعام", ka: "საკვები", fr: "nourriture", category: "food" },
  { level: "A1", es: "pan", en: "bread", uk: "хліб", ar: "خبز", ka: "პური", fr: "pain", category: "food" },
  { level: "A1", es: "leche", en: "milk", uk: "молоко", ar: "حليب", ka: "რძე", fr: "lait", category: "food" },
  { level: "A1", es: "mesa", en: "table", uk: "стіл", ar: "طاولة", ka: "მაგიდა", fr: "table" },
  { level: "A1", es: "silla", en: "chair", uk: "стілець", ar: "كرسي", ka: "სკამი", fr: "chaise" },
  { level: "A1", es: "puerta", en: "door", uk: "двері", ar: "باب", ka: "კარი", fr: "porte" },
  { level: "A1", es: "ventana", en: "window", uk: "вікно", ar: "نافذة", ka: "ფანჯარა", fr: "fenêtre" },
  { level: "A1", es: "libro", en: "book", uk: "книга", ar: "كتاب", ka: "წიგნი", fr: "livre", category: "education" },
  { level: "A1", es: "perro", en: "dog", uk: "собака", ar: "كلب", ka: "ძაღლი", fr: "chien" },
  { level: "A1", es: "gato", en: "cat", uk: "кіт", ar: "قطة", ka: "კატა", fr: "chat" },
  { level: "A1", es: "pájaro", en: "bird", uk: "птах", ar: "طائر", ka: "ჩიტი", fr: "oiseau" },
  { level: "A1", es: "pez", en: "fish", uk: "риба", ar: "سمكة", ka: "თევზი", fr: "poisson" },
  { level: "A1", es: "caballo", en: "horse", uk: "кінь", ar: "حصان", ka: "ცხენი", fr: "cheval" },
  { level: "A1", es: "vaca", en: "cow", uk: "корова", ar: "بقرة", ka: "ძროხა", fr: "vache" },
  { level: "A1", es: "oveja", en: "sheep", uk: "вівця", ar: "خروف", ka: "ცხვარი", fr: "mouton" },
  { level: "A1", es: "ratón", en: "mouse", uk: "миша", ar: "فأر", ka: "თაგვი", fr: "souris" },
  { level: "A1", es: "león", en: "lion", uk: "лев", ar: "أسد", ka: "ლომი", fr: "lion" },
  { level: "A1", es: "oso", en: "bear", uk: "ведмідь", ar: "دب", ka: "დათვი", fr: "ours" },
  { level: "A1", es: "cabeza", en: "head", uk: "голова", ar: "رأس", ka: "თავი", fr: "tête" },
  { level: "A1", es: "mano", en: "hand", uk: "кисть", ar: "يد", ka: "ხელი", fr: "main" },
  { level: "A1", es: "pie", en: "foot", uk: "стопа", ar: "قدم", ka: "ტერფი", fr: "pied" },
  { level: "A1", es: "ojo", en: "eye", uk: "око", ar: "عين", ka: "თვალი", fr: "œil" },
  { level: "A1", es: "boca", en: "mouth", uk: "рот", ar: "فم", ka: "პირი", fr: "bouche" },
  { level: "A1", es: "nariz", en: "nose", uk: "ніс", ar: "أنف", ka: "ცხვირი", fr: "nez" },
  { level: "A1", es: "oreja", en: "ear", uk: "вухо", ar: "أذن", ka: "ყური", fr: "oreille" },
  { level: "A1", es: "brazo", en: "arm", uk: "рука", ar: "ذراع", ka: "მკლავი", fr: "bras" },
  { level: "A1", es: "pierna", en: "leg", uk: "нога", ar: "ساق", ka: "ფეხი", fr: "jambe" },
  { level: "A1", es: "corazón", en: "heart", uk: "серце", ar: "قلب", ka: "გული", fr: "cœur" },
  { level: "A1", es: "uno", en: "one", uk: "один", ar: "واحد", ka: "ერთი", fr: "un" },
  { level: "A1", es: "dos", en: "two", uk: "два", ar: "اثنان", ka: "ორი", fr: "deux" },
  { level: "A1", es: "tres", en: "three", uk: "три", ar: "ثلاثة", ka: "სამი", fr: "trois" },
  { level: "A1", es: "cuatro", en: "four", uk: "чотири", ar: "أربعة", ka: "ოთხი", fr: "quatre" },
  { level: "A1", es: "cinco", en: "five", uk: "п'ять", ar: "خمسة", ka: "ხუთი", fr: "cinq" },
  { level: "A1", es: "seis", en: "six", uk: "шість", ar: "ستة", ka: "ექვსი", fr: "six" },
  { level: "A1", es: "siete", en: "seven", uk: "сім", ar: "سبعة", ka: "შვიდი", fr: "sept" },
  { level: "A1", es: "ocho", en: "eight", uk: "вісім", ar: "ثمانية", ka: "რვა", fr: "huit" },
  { level: "A1", es: "nueve", en: "nine", uk: "дев'ять", ar: "تسعة", ka: "ცხრა", fr: "neuf" },
  { level: "A1", es: "diez", en: "ten", uk: "десять", ar: "عشرة", ka: "ათი", fr: "dix" },
  { level: "A1", es: "lunes", en: "Monday", uk: "понеділок", ar: "الإثنين", ka: "ორშაბათი", fr: "lundi" },
  { level: "A1", es: "martes", en: "Tuesday", uk: "вівторок", ar: "الثلاثاء", ka: "სამშაბათი", fr: "mardi" },
  { level: "A1", es: "miércoles", en: "Wednesday", uk: "середа", ar: "الأربعاء", ka: "ოთხშაბათი", fr: "mercredi" },
  { level: "A1", es: "jueves", en: "Thursday", uk: "четвер", ar: "الخميس", ka: "ხუთშაბათი", fr: "jeudi" },
  { level: "A1", es: "viernes", en: "Friday", uk: "п'ятниця", ar: "الجمعة", ka: "პარასკევი", fr: "vendredi" },
  { level: "A1", es: "sábado", en: "Saturday", uk: "субота", ar: "السبت", ka: "შაბათი", fr: "samedi" },
  { level: "A1", es: "domingo", en: "Sunday", uk: "неділя", ar: "الأحد", ka: "კვირა", fr: "dimanche" },
  { level: "A1", category: "education", es: "lápiz", en: "pencil", uk: "олівець", ar: "قلم رصاص", ka: "ფანქარი", fr: "crayon" },
  { level: "A1", category: "education", es: "cuaderno", en: "notebook", uk: "зошит", ar: "دفتر", ka: "რვეული", fr: "cahier" },
  { level: "A1", category: "education", es: "bolígrafo", en: "pen", uk: "ручка", ar: "قلم حبر", ka: "კალამი", fr: "stylo" },
  { level: "A1", es: "goma", en: "eraser", uk: "гумка", ar: "ممحاة", ka: "საშლელი", fr: "gomme" },
  { level: "A1", es: "tijeras", en: "scissors", uk: "ножиці", ar: "مقص", ka: "მაკრატელი", fr: "ciseaux" },
  { level: "A1", es: "papel", en: "paper", uk: "папір", ar: "ورق", ka: "ქაღალდი", fr: "papier" },
  { level: "A1", es: "ropa", en: "clothes", uk: "одяг", ar: "ملابس", ka: "ტანსაცმელი", fr: "vêtements" },
  { level: "A1", es: "chaqueta", en: "jacket", uk: "куртка", ar: "سترة", ka: "ჟაკეტი", fr: "veste" },
  { level: "A1", es: "pijama", en: "pajamas", uk: "піжама", ar: "بيجاما", ka: "პიჟამა", fr: "pyjama" },
  { level: "A1", category: "family", es: "primo", en: "male cousin", uk: "двоюрідний брат", ar: "ابن عم", ka: "ბიძაშვილი", fr: "cousin" },
  { level: "A1", category: "family", es: "sobrino", en: "nephew", uk: "племінник", ar: "ابن أخ", ka: "ძმისწული", fr: "neveu" },
  { level: "A1", category: "family", es: "nieto", en: "grandson", uk: "онук", ar: "حفيد", ka: "შვილიშვილი", fr: "petit-fils" },
  { level: "A1", es: "árbol", en: "tree", uk: "дерево", ar: "شجرة", ka: "ხე", fr: "arbre" },
  { level: "A1", es: "flor", en: "flower", uk: "квітка", ar: "زهرة", ka: "ყვავილი", fr: "fleur" },
  { level: "A1", es: "montaña", en: "mountain", uk: "гора", ar: "جبل", ka: "მთა", fr: "montagne" },
  { level: "A1", es: "río", en: "river", uk: "річка", ar: "نهر", ka: "მდინარე", fr: "rivière" },
  { level: "A1", es: "mar", en: "sea", uk: "море", ar: "بحر", ka: "ზღვა", fr: "mer" },
  { level: "A1", es: "hoy", en: "today", uk: "сьогодні", ar: "اليوم", ka: "დღეს", fr: "aujourd'hui" },
  { level: "A1", es: "ayer", en: "yesterday", uk: "вчора", ar: "أمس", ka: "გუშინ", fr: "hier" },
  { level: "A1", es: "temprano", en: "early", uk: "рано", ar: "مبكرًا", ka: "ადრე", fr: "tôt" },
  { level: "A1", es: "tarde", en: "late", uk: "пізно", ar: "متأخرًا", ka: "გვიან", fr: "tard" },
  { level: "A1", es: "calor", en: "heat", uk: "спека", ar: "حرارة", ka: "სიცხე", fr: "chaleur" },
  { level: "A1", es: "estrella", en: "star", uk: "зірка", ar: "نجمة", ka: "ვარსკვლავი", fr: "étoile" },
  { level: "A1", es: "toalla", en: "towel", uk: "рушник", ar: "منشفة", ka: "პირსახოცი", fr: "serviette" },
  { level: "A1", es: "jabón", en: "soap", uk: "мило", ar: "صابون", ka: "საპონი", fr: "savon" },
  { level: "A1", es: "cepillo", en: "brush", uk: "щітка", ar: "فرشاة", ka: "ჯაგრისი", fr: "brosse" },
  { level: "A1", es: "peine", en: "comb", uk: "гребінець", ar: "مشط", ka: "სავარცხელი", fr: "peigne" },
  { level: "A1", es: "taza", en: "cup", uk: "чашка", ar: "كوب", ka: "ჭიქა", fr: "tasse" },
  { level: "A1", es: "parque", en: "park", uk: "парк", ar: "حديقة عامة", ka: "პარკი", fr: "parc" },
  { level: "A1", es: "playa", en: "beach", uk: "пляж", ar: "شاطئ", ka: "პლაჟი", fr: "plage" },
  { level: "A1", es: "museo", en: "museum", uk: "музей", ar: "متحف", ka: "მუზეუმი", fr: "musée" },
  { level: "A1", es: "iglesia", en: "church", uk: "церква", ar: "كنيسة", ka: "ეკლესია", fr: "église" },
  { level: "A1", category: "education", es: "biblioteca", en: "library", uk: "бібліотека", ar: "مكتبة", ka: "ბიბლიოთეკა", fr: "bibliothèque" },
  { level: "A1", es: "once", en: "eleven", uk: "одинадцять", ar: "أحد عشر", ka: "თერთმეტი", fr: "onze" },
  { level: "A1", es: "doce", en: "twelve", uk: "дванадцять", ar: "اثنا عشر", ka: "თორმეტი", fr: "douze" },
  { level: "A1", es: "veinte", en: "twenty", uk: "двадцять", ar: "عشرون", ka: "ოცი", fr: "vingt" },
  { level: "A1", es: "treinta", en: "thirty", uk: "тридцять", ar: "ثلاثون", ka: "ოცდაათი", fr: "trente" },
  { level: "A1", es: "cien", en: "hundred", uk: "сто", ar: "مئة", ka: "ასი", fr: "cent" },
  { level: "A1", es: "enero", en: "January", uk: "січень", ar: "يناير", ka: "იანვარი", fr: "janvier" },
  { level: "A1", es: "febrero", en: "February", uk: "лютий", ar: "فبراير", ka: "თებერვალი", fr: "février" },
  { level: "A1", es: "marzo", en: "March", uk: "березень", ar: "مارس", ka: "მარტი", fr: "mars" },
  { level: "A1", es: "abril", en: "April", uk: "квітень", ar: "أبريل", ka: "აპრილი", fr: "avril" },
  { level: "A1", es: "mayo", en: "May", uk: "травень", ar: "مايو", ka: "მაისი", fr: "mai" },
  { level: "A1", es: "junio", en: "June", uk: "червень", ar: "يونيو", ka: "ივნისი", fr: "juin" },
  { level: "A1", es: "julio", en: "July", uk: "липень", ar: "يوليو", ka: "ივლისი", fr: "juillet" },
  { level: "A1", es: "agosto", en: "August", uk: "серпень", ar: "أغسطس", ka: "აგვისტო", fr: "août" },
  { level: "A1", es: "septiembre", en: "September", uk: "вересень", ar: "سبتمبر", ka: "სექტემბერი", fr: "septembre" },
  { level: "A1", es: "octubre", en: "October", uk: "жовтень", ar: "أكتوبر", ka: "ოქტომბერი", fr: "octobre" },
  { level: "A1", es: "noviembre", en: "November", uk: "листопад", ar: "نوفمبر", ka: "ნოემბერი", fr: "novembre" },
  { level: "A1", es: "diciembre", en: "December", uk: "грудень", ar: "ديسمبر", ka: "დეკემბერი", fr: "décembre" },
  { level: "A1", es: "primavera", en: "spring", uk: "весна", ar: "ربيع", ka: "გაზაფხული", fr: "printemps" },
  { level: "A1", es: "verano", en: "summer", uk: "літо", ar: "صيف", ka: "ზაფხული", fr: "été" },
  { level: "A1", es: "otoño", en: "autumn", uk: "осінь", ar: "خريف", ka: "შემოდგომა", fr: "automne" },
  { level: "A1", es: "invierno", en: "winter", uk: "зима", ar: "شتاء", ka: "ზამთარი", fr: "hiver" },
  { level: "A1", es: "dedo", en: "finger", uk: "палець", ar: "إصبع", ka: "თითი", fr: "doigt" },
  { level: "A1", es: "cuello", en: "neck", uk: "шия", ar: "رقبة", ka: "კისერი", fr: "cou" },
  { level: "A1", es: "hombro", en: "shoulder", uk: "плече", ar: "كتف", ka: "მხარი", fr: "épaule" },
  { level: "A1", es: "rodilla", en: "knee", uk: "коліно", ar: "ركبة", ka: "მუხლი", fr: "genou" },
  { level: "A1", es: "diente", en: "tooth", uk: "зуб", ar: "سن", ka: "კბილი", fr: "dent" },
  { level: "A1", es: "reloj", en: "watch", uk: "годинник", ar: "ساعة", ka: "საათი", fr: "montre" },
  { level: "A1", es: "gorra", en: "cap", uk: "кепка", ar: "طاقية", ka: "კეპი", fr: "casquette" },
  { level: "A1", es: "botas", en: "boots", uk: "чоботи", ar: "حذاء طويل", ka: "ჩექმა", fr: "bottes" },
  { level: "A1", category: "food", es: "pollo", en: "chicken", uk: "курка", ar: "دجاج", ka: "ქათამი", fr: "poulet" },
  { level: "A1", es: "pato", en: "duck", uk: "качка", ar: "بطة", ka: "იხვი", fr: "canard" },
  { level: "A1", es: "cerdo", en: "pig", uk: "свиня", ar: "خنزير", ka: "ღორი", fr: "cochon" },
  { level: "A1", es: "conejo", en: "rabbit", uk: "кролик", ar: "أرنب", ka: "კურდღელი", fr: "lapin" },
  { level: "A1", es: "anoche", en: "last night", uk: "минулої ночі", ar: "الليلة الماضية", ka: "გუშინ ღამით", fr: "hier soir" },

  { level: "A1", es: "ser", en: "to be", uk: "бути", ar: "يكون", ka: "ყოფნა", fr: "être" },
  { level: "A1", es: "estar", en: "to stay", uk: "залишатися", ar: "يبقى", ka: "დარჩენა", fr: "rester" },
  { level: "A1", es: "tener", en: "to have", uk: "володіти", ar: "يملك", ka: "ქონა", fr: "avoir" },
  { level: "A1", es: "hacer", en: "to do", uk: "робити", ar: "يفعل", ka: "კეთება", fr: "faire" },
  { level: "A1", es: "ir", en: "to go", uk: "йти", ar: "يذهب", ka: "წასვლა", fr: "aller" },
  { level: "A1", es: "venir", en: "to come", uk: "приходити", ar: "يأتي", ka: "მოსვლა", fr: "venir" },
  { level: "A1", es: "hablar", en: "to speak", uk: "говорити", ar: "يتحدث", ka: "საუბარი", fr: "parler" },
  { level: "A1", es: "comer", en: "to eat", uk: "їсти", ar: "يأكل", ka: "ჭამა", fr: "manger" },
  { level: "A1", es: "beber", en: "to drink", uk: "пити", ar: "يشرب", ka: "სმა", fr: "boire" },
  { level: "A1", es: "vivir", en: "to live", uk: "жити", ar: "يعيش", ka: "ცხოვრება", fr: "vivre" },
  { level: "A1", es: "trabajar", en: "to work", uk: "працювати", ar: "يعمل", ka: "მუშაობა", fr: "travailler" },
  { level: "A1", es: "estudiar", en: "to study", uk: "вчитися", ar: "يدرس", ka: "სწავლა", fr: "étudier" },
  { level: "A1", es: "jugar", en: "to play", uk: "гратися", ar: "يلعب", ka: "თამაში", fr: "jouer" },
  { level: "A1", es: "dormir", en: "to sleep", uk: "спати", ar: "ينام", ka: "ძილი", fr: "dormir" },
  { level: "A1", es: "comprar", en: "to buy", uk: "купувати", ar: "يشتري", ka: "ყიდვა", fr: "acheter" },
  { level: "A1", es: "vender", en: "to sell", uk: "продавати", ar: "يبيع", ka: "გაყიდვა", fr: "vendre" },
  { level: "A1", es: "abrir", en: "to open", uk: "відкривати", ar: "يفتح", ka: "გახსნა", fr: "ouvrir" },
  { level: "A1", es: "cerrar", en: "to close", uk: "закривати", ar: "يغلق", ka: "დახურვა", fr: "fermer" },
  { level: "A1", es: "escribir", en: "to write", uk: "писати", ar: "يكتب", ka: "წერა", fr: "écrire" },
  { level: "A1", es: "leer", en: "to read", uk: "читати", ar: "يقرأ", ka: "კითხვა", fr: "lire" },
  { level: "A1", es: "correr", en: "to run", uk: "бігти", ar: "يجري", ka: "სირბილი", fr: "courir" },
  { level: "A1", es: "nadar", en: "to swim", uk: "плавати", ar: "يسبح", ka: "ცურვა", fr: "nager" },
  { level: "A1", es: "cantar", en: "to sing", uk: "співати", ar: "يغني", ka: "სიმღერა", fr: "chanter" },
  { level: "A1", es: "bailar", en: "to dance", uk: "танцювати", ar: "يرقص", ka: "ცეკვა", fr: "danser" },
  { level: "A1", es: "ayudar", en: "to help", uk: "допомагати", ar: "يساعد", ka: "დახმარება", fr: "aider" },
  { level: "A1", es: "bueno", en: "good", uk: "добрий", ar: "جيد", ka: "კარგი", fr: "bon" },
  { level: "A1", es: "malo", en: "bad", uk: "поганий", ar: "سيء", ka: "ცუდი", fr: "mauvais" },
  { level: "A1", es: "gordo", en: "fat", uk: "товстий", ar: "سمين", ka: "მსუქანი", fr: "gros" },
  { level: "A1", es: "delgado", en: "thin", uk: "худий", ar: "نحيف", ka: "გამხდარი", fr: "mince" },
  { level: "A1", es: "guapo", en: "handsome", uk: "вродливий", ar: "وسيم", ka: "მშვენიერი", fr: "beau" },
  { level: "A1", es: "rico", en: "rich", uk: "багатий", ar: "غني", ka: "მდიდარი", fr: "riche" },
  { level: "A1", es: "pobre", en: "poor", uk: "бідний", ar: "فقير", ka: "ღარიბი", fr: "pauvre" },
  { level: "A1", es: "rubio", en: "blonde", uk: "білявий", ar: "أشقر", ka: "ქერა", fr: "blond" },
  // ---- A2 ----
  { level: "A2", es: "cómodo", en: "comfortable", uk: "зручний", ar: "مريح", ka: "მოსახერხებელი", fr: "confortable" },
  { level: "A2", es: "difícil", en: "difficult", uk: "складний", ar: "صعب", ka: "რთული", fr: "difficile" },
  { level: "A2", es: "fácil", en: "easy", uk: "легкий", ar: "سهل", ka: "ადვილი", fr: "facile" },
  { level: "A2", es: "caro", en: "expensive", uk: "дорогий", ar: "غالٍ", ka: "ძვირი", fr: "cher" },
  { level: "A2", es: "barato", en: "cheap", uk: "дешевий", ar: "رخيص", ka: "იაფი", fr: "bon marché" },
  { level: "A2", es: "débil", en: "weak", uk: "слабкий", ar: "ضعيف", ka: "სუსტი", fr: "faible" },
  { level: "A2", es: "ocupado", en: "busy", uk: "зайнятий", ar: "مشغول", ka: "დაკავებული", fr: "occupé" },
  { level: "A2", es: "libre", en: "free", uk: "вільний", ar: "حر", ka: "თავისუფალი", fr: "libre" },
  { level: "A2", es: "amable", en: "kind", uk: "добрий", ar: "لطيف", ka: "თავაზიანი", fr: "aimable" },
  { level: "A2", es: "inteligente", en: "intelligent", uk: "розумний", ar: "ذكي", ka: "ჭკვიანი", fr: "intelligent" },
  { level: "A2", es: "seguro", en: "safe", uk: "безпечний", ar: "آمن", ka: "უსაფრთხო", fr: "sûr" },
  { level: "A2", es: "importante", en: "important", uk: "важливий", ar: "مهم", ka: "მნიშვნელოვანი", fr: "important" },
  { level: "A2", es: "gratis", en: "free of charge", uk: "безкоштовний", ar: "مجاني", ka: "უფასო", fr: "gratuit" },
  { level: "A2", es: "lleno", en: "full", uk: "повний", ar: "ممتلئ", ka: "სავსე", fr: "plein" },
  { level: "A2", es: "vacío", en: "empty", uk: "порожній", ar: "فارغ", ka: "ცარიელი", fr: "vide" },
  { level: "A2", es: "dulce", en: "sweet", uk: "солодкий", ar: "حلو", ka: "ტკბილი", fr: "sucré" },
  { level: "A2", es: "camisa", en: "shirt", uk: "сорочка", ar: "قميص", ka: "პერანგი", fr: "chemise" },
  { level: "A2", es: "pantalón", en: "trousers", uk: "штани", ar: "بنطال", ka: "შარვალი", fr: "pantalon" },
  { level: "A2", es: "zapatos", en: "shoes", uk: "туфлі", ar: "أحذية", ka: "ფეხსაცმელი", fr: "chaussures" },
  { level: "A2", es: "sombrero", en: "hat", uk: "капелюх", ar: "قبعة", ka: "ქუდი", fr: "chapeau" },
  { level: "A2", es: "abrigo", en: "coat", uk: "пальто", ar: "معطف", ka: "პალტო", fr: "manteau" },
  { level: "A2", es: "falda", en: "skirt", uk: "спідниця", ar: "تنورة", ka: "ქვედაბოლო", fr: "jupe" },
  { level: "A2", es: "vestido", en: "dress", uk: "сукня", ar: "فستان", ka: "კაბა", fr: "robe" },
  { level: "A2", es: "calcetines", en: "socks", uk: "шкарпетки", ar: "جوارب", ka: "წინდები", fr: "chaussettes" },
  { level: "A2", es: "guantes", en: "gloves", uk: "рукавички", ar: "قفازات", ka: "ხელთათმანები", fr: "gants" },
  { level: "A2", es: "bufanda", en: "scarf", uk: "шарф", ar: "وشاح", ka: "შარფი", fr: "écharpe" },
  { level: "A2", es: "lluvia", en: "rain", uk: "дощ", ar: "مطر", ka: "წვიმა", fr: "pluie" },
  { level: "A2", es: "nieve", en: "snow", uk: "сніг", ar: "ثلج", ka: "თოვლი", fr: "neige" },
  { level: "A2", es: "viento", en: "wind", uk: "вітер", ar: "رياح", ka: "ქარი", fr: "vent" },
  { level: "A2", es: "sol", en: "sun", uk: "сонце", ar: "شمس", ka: "მზე", fr: "soleil" },
  { level: "A2", es: "nube", en: "cloud", uk: "хмара", ar: "سحابة", ka: "ღრუბელი", fr: "nuage" },
  { level: "A2", es: "tormenta", en: "storm", uk: "буря", ar: "عاصفة", ka: "ქარიშხალი", fr: "tempête" },
  { level: "A2", es: "semana", en: "week", uk: "тиждень", ar: "أسبوع", ka: "კვირა", fr: "semaine" },
  { level: "A2", es: "mes", en: "month", uk: "місяць", ar: "شهر", ka: "თვე", fr: "mois" },
  { level: "A2", es: "año", en: "year", uk: "рік", ar: "سنة", ka: "წელი", fr: "année" },
  { level: "A2", es: "hora", en: "hour", uk: "година", ar: "ساعة", ka: "საათი", fr: "heure" },
  { level: "A2", es: "minuto", en: "minute", uk: "хвилина", ar: "دقيقة", ka: "წუთი", fr: "minute" },
  { level: "A2", es: "mañana", en: "morning", uk: "ранок", ar: "صباح", ka: "დილა", fr: "matin" },
  { level: "A2", es: "noche", en: "night", uk: "ніч", ar: "ليل", ka: "ღამე", fr: "nuit" },
  { level: "A2", es: "cocina", en: "kitchen", uk: "кухня", ar: "مطبخ", ka: "სამზარეულო", fr: "cuisine" },
  { level: "A2", es: "dormitorio", en: "bedroom", uk: "спальня", ar: "غرفة نوم", ka: "საძინებელი", fr: "chambre" },
  { level: "A2", es: "baño", en: "bathroom", uk: "ванна кімната", ar: "حمام", ka: "აბაზანა", fr: "salle de bain" },
  { level: "A2", es: "jardín", en: "garden", uk: "сад", ar: "حديقة", ka: "ბაღი", fr: "jardin" },
  { level: "A2", es: "cama", en: "bed", uk: "ліжко", ar: "سرير", ka: "საწოლი", fr: "lit" },
  { level: "A2", es: "espejo", en: "mirror", uk: "дзеркало", ar: "مرآة", ka: "სარკე", fr: "miroir" },
  { level: "A2", es: "lámpara", en: "lamp", uk: "лампа", ar: "مصباح", ka: "ლამპა", fr: "lampe" },
  { level: "A2", es: "escalera", en: "stairs", uk: "сходи", ar: "درج", ka: "კიბე", fr: "escalier" },
  { level: "A2", es: "teléfono", en: "phone", uk: "телефон", ar: "هاتف", ka: "ტელეფონი", fr: "téléphone" },
  { level: "A2", es: "ordenador", en: "computer", uk: "комп'ютер", ar: "حاسوب", ka: "კომპიუტერი", fr: "ordinateur" },
  { level: "A2", es: "periódico", en: "newspaper", uk: "газета", ar: "جريدة", ka: "გაზეთი", fr: "journal" },
  { level: "A2", es: "revista", en: "magazine", uk: "журнал", ar: "مجلة", ka: "ჟურნალი", fr: "magazine" },
  { level: "A2", es: "carta", en: "letter", uk: "лист", ar: "رسالة", ka: "წერილი", fr: "lettre" },
  { level: "A2", es: "sello", en: "stamp", uk: "марка", ar: "طابع بريد", ka: "მარკა", fr: "timbre" },
  { level: "A2", es: "postal", en: "postcard", uk: "листівка", ar: "بطاقة بريدية", ka: "საფოსტო ბარათი", fr: "carte postale" },
  { level: "A2", es: "paraguas", en: "umbrella", uk: "парасолька", ar: "مظلة", ka: "ქოლგა", fr: "parapluie" },
  { level: "A2", category: "education", es: "mochila", en: "backpack", uk: "рюкзак", ar: "حقيبة ظهر", ka: "ზურგჩანთა", fr: "sac à dos" },
  { level: "A2", es: "cartera", en: "wallet", uk: "гаманець", ar: "محفظة", ka: "საფულე", fr: "portefeuille" },
  { level: "A2", es: "llave", en: "key", uk: "ключ", ar: "مفتاح", ka: "გასაღები", fr: "clé" },
  { level: "A2", es: "gafas", en: "glasses", uk: "окуляри", ar: "نظارات", ka: "სათვალე", fr: "lunettes" },
  { level: "A2", es: "cinturón", en: "belt", uk: "пояс", ar: "حزام", ka: "ქამარი", fr: "ceinture" },
  { level: "A2", es: "anillo", en: "ring", uk: "каблучка", ar: "خاتم", ka: "ბეჭედი", fr: "bague" },
  { level: "A2", es: "collar", en: "necklace", uk: "намисто", ar: "قلادة", ka: "ყელსაბამი", fr: "collier" },
  { level: "A2", es: "pulsera", en: "bracelet", uk: "браслет", ar: "سوار", ka: "სამაჯური", fr: "bracelet" },
  { level: "A2", category: "shopping", es: "bolso", en: "purse", uk: "сумка", ar: "حقيبة يد", ka: "ჩანთა", fr: "sac à main" },
  { level: "A2", es: "camiseta", en: "t-shirt", uk: "футболка", ar: "تي شيرت", ka: "მაისური", fr: "t-shirt" },
  { level: "A2", category: "food", es: "cuchillo", en: "knife", uk: "ніж", ar: "سكين", ka: "დანა", fr: "couteau" },
  { level: "A2", category: "food", es: "tenedor", en: "fork", uk: "виделка", ar: "شوكة", ka: "ჩანგალი", fr: "fourchette" },
  { level: "A2", category: "food", es: "cuchara", en: "spoon", uk: "ложка", ar: "ملعقة", ka: "კოვზი", fr: "cuillère" },
  { level: "A2", category: "food", es: "vaso", en: "glass", uk: "склянка", ar: "كأس", ka: "სასმისი", fr: "verre" },
  { level: "A2", es: "sartén", en: "frying pan", uk: "сковорода", ar: "مقلاة", ka: "ტაფა", fr: "poêle" },
  { level: "A2", es: "olla", en: "pot", uk: "каструля", ar: "قدر", ka: "ქვაბი", fr: "marmite" },
  { level: "A2", es: "horno", en: "oven", uk: "духовка", ar: "فرن", ka: "ღუმელი", fr: "four" },
  { level: "A2", es: "nevera", en: "fridge", uk: "холодильник", ar: "ثلاجة", ka: "მაცივარი", fr: "réfrigérateur" },
  { level: "A2", es: "lavadora", en: "washing machine", uk: "пральна машина", ar: "غسالة", ka: "სარეცხი მანქანა", fr: "machine à laver" },
  { level: "A2", es: "ducha", en: "shower", uk: "душ", ar: "دش", ka: "შხაპი", fr: "douche" },
  { level: "A2", es: "champú", en: "shampoo", uk: "шампунь", ar: "شامبو", ka: "შამპუნი", fr: "shampooing" },
  { level: "A2", es: "película", en: "movie", uk: "фільм", ar: "فيلم", ka: "ფილმი", fr: "film" },
  { level: "A2", es: "canción", en: "song", uk: "пісня", ar: "أغنية", ka: "სიმღერა", fr: "chanson" },
  { level: "A2", es: "concierto", en: "concert", uk: "концерт", ar: "حفلة موسيقية", ka: "კონცერტი", fr: "concert" },
  { level: "A2", es: "entrada", en: "admission", uk: "перепустка", ar: "تذكرة دخول", ka: "შესასვლელი ბილეთი", fr: "entrée" },
  { level: "A2", es: "fiesta", en: "party", uk: "вечірка", ar: "حفلة", ka: "წვეულება", fr: "fête" },
  { level: "A2", category: "shopping", es: "regalo", en: "gift", uk: "подарунок", ar: "هدية", ka: "საჩუქარი", fr: "cadeau" },
  { level: "A2", es: "cumpleaños", en: "birthday", uk: "день народження", ar: "عيد ميلاد", ka: "დაბადების დღე", fr: "anniversaire" },
  { level: "A2", es: "sorpresa", en: "surprise", uk: "сюрприз", ar: "مفاجأة", ka: "სიურპრიზი", fr: "surprise" },
  { level: "A2", es: "invitado", en: "guest", uk: "гість", ar: "ضيف", ka: "სტუმარი", fr: "invité" },
  { level: "A2", es: "juego", en: "game", uk: "гра", ar: "لعبة", ka: "თამაში", fr: "jeu" },
  { level: "A2", es: "juguete", en: "toy", uk: "іграшка", ar: "لعبة أطفال", ka: "სათამაშო", fr: "jouet" },
  { level: "A2", es: "muñeca", en: "doll", uk: "лялька", ar: "دمية", ka: "თოჯინა", fr: "poupée" },
  { level: "A2", category: "sports", es: "piscina", en: "pool", uk: "басейн", ar: "مسبح", ka: "აუზი", fr: "piscine" },
  { level: "A2", es: "bosque", en: "forest", uk: "ліс", ar: "غابة", ka: "ტყე", fr: "forêt" },
  { level: "A2", category: "food", es: "pescado", en: "fish", uk: "риба", ar: "سمك", ka: "თევზი", fr: "poisson" },
  { level: "A2", category: "food", es: "verdura", en: "vegetable", uk: "овоч", ar: "خضار", ka: "ბოსტნეული", fr: "légume" },
  { level: "A2", es: "fruta", en: "fruit", uk: "фрукт", ar: "فاكهة", ka: "ხილი", fr: "fruit" },
  { level: "A2", category: "food", es: "ensalada", en: "salad", uk: "салат", ar: "سلطة", ka: "სალათი", fr: "salade" },
  { level: "A2", category: "food", es: "sopa", en: "soup", uk: "суп", ar: "حساء", ka: "წვნიანი", fr: "soupe" },
  { level: "A2", es: "sandwich", en: "sandwich", uk: "сендвіч", ar: "شطيرة", ka: "სენდვიჩი", fr: "sandwich" },
  { level: "A2", es: "helado", en: "ice cream", uk: "морозиво", ar: "آيس كريم", ka: "ნაყინი", fr: "glace" },
  { level: "A2", category: "food", es: "galleta", en: "cookie", uk: "печиво", ar: "بسكويت", ka: "ბისკვიტი", fr: "biscuit" },
  { level: "A2", es: "chocolate", en: "chocolate", uk: "шоколад", ar: "شوكولاتة", ka: "შოკოლადი", fr: "chocolat" },
  { level: "A2", es: "vino", en: "wine", uk: "вино", ar: "نبيذ", ka: "ღვინო", fr: "vin" },
  { level: "A2", es: "cerveza", en: "beer", uk: "пиво", ar: "بيرة", ka: "ლუდი", fr: "bière" },
  { level: "A2", es: "jugo", en: "juice", uk: "сік", ar: "عصير", ka: "წვენი", fr: "jus" },
  { level: "A2", category: "food", es: "mantequilla", en: "butter", uk: "масло", ar: "زبدة", ka: "კარაქი", fr: "beurre" },
  { level: "A2", es: "azúcar", en: "sugar", uk: "цукор", ar: "سكر", ka: "შაქარი", fr: "sucre" },
  { level: "A2", es: "sal", en: "salt", uk: "сіль", ar: "ملح", ka: "მარილი", fr: "sel" },
  { level: "A2", category: "food", es: "pimienta", en: "pepper", uk: "перець", ar: "فلفل", ka: "პილპილი", fr: "poivre" },
  { level: "A2", category: "food", es: "aceite", en: "oil", uk: "олія", ar: "زيت", ka: "ზეთი", fr: "huile" },
  { level: "A2", es: "quizás", en: "maybe", uk: "можливо", ar: "ربما", ka: "შესაძლოა", fr: "peut-être" },
  { level: "A2", es: "espalda", en: "back", uk: "спина", ar: "ظهر", ka: "ზურგი", fr: "dos" },

  { level: "A2", es: "pensar", en: "to think", uk: "думати", ar: "يفكر", ka: "ფიქრი", fr: "penser" },
  { level: "A2", es: "sentir", en: "to feel", uk: "відчувати", ar: "يشعر", ka: "შეგრძნება", fr: "sentir" },
  { level: "A2", es: "llegar", en: "to arrive", uk: "прибувати", ar: "يصل", ka: "ჩამოსვლა", fr: "arriver" },
  { level: "A2", es: "salir", en: "to leave", uk: "виходити", ar: "يخرج", ka: "გასვლა", fr: "sortir" },
  { level: "A2", es: "entrar", en: "to enter", uk: "входити", ar: "يدخل", ka: "შესვლა", fr: "entrer" },
  { level: "A2", es: "empezar", en: "to start", uk: "починати", ar: "يبدأ", ka: "დაწყება", fr: "commencer" },
  { level: "A2", es: "terminar", en: "to finish", uk: "закінчувати", ar: "ينهي", ka: "დამთავრება", fr: "terminer" },
  { level: "A2", es: "esperar", en: "to wait", uk: "чекати", ar: "ينتظر", ka: "ლოდინი", fr: "attendre" },
  { level: "A2", es: "buscar", en: "to search", uk: "шукати", ar: "يبحث", ka: "ძებნა", fr: "chercher" },
  { level: "A2", es: "encontrar", en: "to find", uk: "знаходити", ar: "يجد", ka: "პოვნა", fr: "trouver" },
  { level: "A2", es: "llevar", en: "to carry", uk: "нести", ar: "يحمل", ka: "ტარება", fr: "porter" },
  { level: "A2", es: "traer", en: "to bring", uk: "приносити", ar: "يجلب", ka: "მოტანა", fr: "apporter" },
  { level: "A2", es: "poner", en: "to put", uk: "класти", ar: "يضع", ka: "დადება", fr: "mettre" },
  { level: "A2", es: "sacar", en: "to take out", uk: "виймати", ar: "يسحب", ka: "გამოღება", fr: "retirer" },
  { level: "A2", es: "pagar", en: "to pay", uk: "платити", ar: "يدفع", ka: "გადახდა", fr: "payer" },
  { level: "A2", es: "viajar", en: "to travel", uk: "подорожувати", ar: "يسافر", ka: "მოგზაურობა", fr: "voyager" },
  { level: "A2", es: "conducir", en: "to drive", uk: "водити", ar: "يقود", ka: "მართვა", fr: "conduire" },
  { level: "A2", es: "caminar", en: "to walk", uk: "ходити пішки", ar: "يمشي", ka: "სიარული", fr: "marcher" },
  { level: "A2", es: "subir", en: "to go up", uk: "підніматися", ar: "يصعد", ka: "ასვლა", fr: "monter" },
  { level: "A2", es: "bajar", en: "to go down", uk: "спускатися", ar: "ينزل", ka: "ჩასვლა", fr: "descendre" },
  { level: "A2", es: "interesante", en: "interesting", uk: "цікавий", ar: "مثير للاهتمام", ka: "საინტერესო", fr: "intéressant" },
  { level: "A2", es: "aburrido", en: "boring", uk: "нудний", ar: "مملّ", ka: "მოსაწყენი", fr: "ennuyeux" },
  { level: "A2", es: "moderno", en: "modern", uk: "сучасний", ar: "حديث", ka: "თანამედროვე", fr: "moderne" },
  { level: "A2", es: "antiguo", en: "old (ancient)", uk: "стародавній", ar: "قديم", ka: "ძველი", fr: "ancien" },
  // ---- B1 ----
  { level: "B1", es: "cercano", en: "nearby", uk: "близький", ar: "قريب", ka: "ახლო", fr: "proche" },
  { level: "B1", es: "lejano", en: "far", uk: "далекий", ar: "بعيد", ka: "შორეული", fr: "lointain" },
  { level: "B1", es: "peligroso", en: "dangerous", uk: "небезпечний", ar: "خطير", ka: "საშიში", fr: "dangereux" },
  { level: "B1", es: "tranquilo", en: "calm", uk: "спокійний", ar: "هادئ", ka: "მშვიდი", fr: "calme" },
  { level: "B1", es: "ruidoso", en: "noisy", uk: "гучний", ar: "صاخب", ka: "ხმაურიანი", fr: "bruyant" },
  { level: "B1", es: "útil", en: "useful", uk: "корисний", ar: "مفيد", ka: "სასარგებლო", fr: "utile" },
  { level: "B1", es: "inútil", en: "useless", uk: "некорисний", ar: "غير مفيد", ka: "უსარგებლო", fr: "inutile" },
  { level: "B1", es: "amargo", en: "bitter", uk: "гіркий", ar: "مر", ka: "მწარე", fr: "amer" },
  { level: "B1", es: "espacioso", en: "spacious", uk: "просторий", ar: "واسع", ka: "ვრცელი", fr: "spacieux" },
  { level: "B1", es: "estrecho", en: "narrow", uk: "вузький", ar: "ضيق", ka: "ვიწრო", fr: "étroit" },
  { level: "B1", es: "sencillo", en: "simple", uk: "простий", ar: "بسيط", ka: "მარტივი", fr: "simple" },
  { level: "B1", es: "complicado", en: "complicated", uk: "заплутаний", ar: "معقد", ka: "გართულებული", fr: "compliqué" },
  { level: "B1", es: "curioso", en: "curious", uk: "цікавий", ar: "فضولي", ka: "ცნობისმოყვარე", fr: "curieux" },
  { level: "B1", es: "valiente", en: "brave", uk: "хоробрий", ar: "شجاع", ka: "მამაცი", fr: "courageux" },
  { level: "B1", es: "generoso", en: "generous", uk: "щедрий", ar: "كريم", ka: "გულუხვი", fr: "généreux" },
  { level: "B1", es: "egoísta", en: "selfish", uk: "егоїстичний", ar: "أناني", ka: "ეგოისტი", fr: "égoïste" },
  { level: "B1", es: "honesto", en: "honest", uk: "чесний", ar: "صادق", ka: "პატიოსანი", fr: "honnête" },
  { level: "B1", es: "paciencia", en: "patience", uk: "терпіння", ar: "صبر", ka: "მოთმინება", fr: "patience" },
  { level: "B1", category: "medicine", es: "paciente", en: "patient", uk: "терплячий", ar: "صبور", ka: "მომთმენი", fr: "patient" },
  { level: "B1", es: "impaciente", en: "impatient", uk: "нетерплячий", ar: "نافد الصبر", ka: "მოუთმენელი", fr: "impatient" },
  { level: "B1", es: "cuidadoso", en: "careful", uk: "обережний", ar: "حذر", ka: "ფრთხილი", fr: "prudent" },
  { level: "B1", es: "descuidado", en: "careless", uk: "недбалий", ar: "مهمل", ka: "დაუდევარი", fr: "négligent" },
  { level: "B1", es: "orgulloso", en: "proud", uk: "гордий", ar: "فخور", ka: "ამაყი", fr: "fier" },
  { level: "B1", es: "modesto", en: "modest", uk: "скромний", ar: "متواضع", ka: "მოკრძალებული", fr: "modeste" },
  { level: "B1", es: "tímido", en: "shy", uk: "сором'язливий", ar: "خجول", ka: "მორცხვი", fr: "timide" },
  { level: "B1", es: "sociable", en: "sociable", uk: "товариський", ar: "اجتماعي", ka: "კომუნიკაბელური", fr: "sociable" },
  { level: "B1", es: "optimista", en: "optimistic", uk: "оптимістичний", ar: "متفائل", ka: "ოპტიმისტური", fr: "optimiste" },
  { level: "B1", es: "pesimista", en: "pessimistic", uk: "песимістичний", ar: "متشائم", ka: "პესიმისტური", fr: "pessimiste" },
  { level: "B1", es: "maduro", en: "mature", uk: "зрілий", ar: "ناضج", ka: "მწიფე", fr: "mûr" },
  { level: "B1", es: "infantil", en: "childish", uk: "інфантильний", ar: "طفولي", ka: "ბავშვური", fr: "enfantin" },
  { level: "B1", es: "flexible", en: "flexible", uk: "гнучкий", ar: "مرن", ka: "მოქნილი", fr: "flexible" },
  { level: "B1", es: "terco", en: "stubborn", uk: "впертий", ar: "عنيد", ka: "ჯიუტი", fr: "têtu" },
  { level: "B1", es: "sensible", en: "sensitive", uk: "чутливий", ar: "حساس", ka: "მგრძნობიარე", fr: "sensible" },
  { level: "B1", es: "sensato", en: "sensible", uk: "розважливий", ar: "حكيم", ka: "გონივრული", fr: "raisonnable" },
  { level: "B1", es: "amistad", en: "friendship", uk: "дружба", ar: "صداقة", ka: "მეგობრობა", fr: "amitié" },
  { level: "B1", es: "confianza", en: "trust", uk: "довіра", ar: "ثقة", ka: "ნდობა", fr: "confiance" },
  { level: "B1", es: "respeto", en: "respect", uk: "повага", ar: "احترام", ka: "პატივისცემა", fr: "respect" },
  { level: "B1", es: "libertad", en: "freedom", uk: "свобода", ar: "حرية", ka: "თავისუფლება", fr: "liberté" },
  { level: "B1", es: "igualdad", en: "equality", uk: "рівність", ar: "مساواة", ka: "თანასწორობა", fr: "égalité" },
  { level: "B1", es: "justicia", en: "justice", uk: "справедливість", ar: "عدالة", ka: "სამართლიანობა", fr: "justice" },
  { level: "B1", es: "injusticia", en: "injustice", uk: "несправедливість", ar: "ظلم", ka: "უსამართლობა", fr: "injustice" },
  { level: "B1", es: "responsabilidad", en: "responsibility", uk: "відповідальність", ar: "مسؤولية", ka: "პასუხისმგებლობა", fr: "responsabilité" },
  { level: "B1", es: "costumbre", en: "custom", uk: "звичай", ar: "عرف", ka: "ჩვეულება", fr: "coutume" },
  { level: "B1", es: "hábito", en: "habit", uk: "звичка", ar: "عادة", ka: "ჩვევა", fr: "habitude" },
  { level: "B1", es: "objetivo", en: "goal", uk: "ціль", ar: "هدف", ka: "მიზანი", fr: "objectif" },
  { level: "B1", es: "meta", en: "target", uk: "мета", ar: "غاية", ka: "სამიზნე", fr: "but" },
  { level: "B1", es: "logro", en: "achievement", uk: "досягнення", ar: "إنجاز", ka: "მიღწევა", fr: "réussite" },
  { level: "B1", es: "fracaso", en: "failure", uk: "невдача", ar: "فشل", ka: "წარუმატებლობა", fr: "échec" },
  { level: "B1", es: "éxito", en: "success", uk: "успіх", ar: "نجاح", ka: "წარმატება", fr: "succès" },
  { level: "B1", es: "esfuerzo", en: "effort", uk: "зусилля", ar: "جهد", ka: "ძალისხმევა", fr: "effort" },
  { level: "B1", es: "paz", en: "peace", uk: "мир", ar: "سلام", ka: "მშვიდობა", fr: "paix" },
  { level: "B1", es: "guerra", en: "war", uk: "війна", ar: "حرب", ka: "ომი", fr: "guerre" },
  { level: "B1", es: "crisis", en: "crisis", uk: "криза", ar: "أزمة", ka: "კრიზისი", fr: "crise" },
  { level: "B1", category: "shopping", es: "cambio", en: "change", uk: "зміна", ar: "تغيير", ka: "ცვლილება", fr: "changement" },
  { level: "B1", es: "progreso", en: "progress", uk: "прогрес", ar: "تقدم", ka: "პროგრესი", fr: "progrès" },
  { level: "B1", es: "desarrollo", en: "development", uk: "розвиток", ar: "تطور", ka: "განვითარება", fr: "développement" },
  { level: "B1", es: "sociedad", en: "society", uk: "суспільство", ar: "مجتمع", ka: "საზოგადოება", fr: "société" },
  { level: "B1", es: "cultura", en: "culture", uk: "культура", ar: "ثقافة", ka: "კულტურა", fr: "culture" },
  { level: "B1", es: "tradición", en: "tradition", uk: "традиція", ar: "تقليد", ka: "ტრადიცია", fr: "tradition" },
  { level: "B1", es: "costa", en: "coast", uk: "узбережжя", ar: "ساحل", ka: "სანაპირო", fr: "côte" },
  { level: "B1", category: "sports", es: "campo", en: "field", uk: "поле", ar: "حقل", ka: "მინდორი", fr: "champ" },
  { level: "B1", es: "paisaje", en: "landscape", uk: "пейзаж", ar: "منظر طبيعي", ka: "პეიზაჟი", fr: "paysage" },
  { level: "B1", es: "naturaleza", en: "nature", uk: "природа", ar: "طبيعة", ka: "ბუნება", fr: "nature" },
  { level: "B1", es: "medio ambiente", en: "environment", uk: "довкілля", ar: "بيئة", ka: "გარემო", fr: "environnement" },
  { level: "B1", es: "contaminación", en: "pollution", uk: "забруднення", ar: "تلوث", ka: "დაბინძურება", fr: "pollution" },
  { level: "B1", es: "reciclaje", en: "recycling", uk: "переробка", ar: "إعادة تدوير", ka: "გადამუშავება", fr: "recyclage" },
  { level: "B1", es: "energía", en: "energy", uk: "енергія", ar: "طاقة", ka: "ენერგია", fr: "énergie" },
  { level: "B1", category: "work", es: "horario", en: "schedule", uk: "розклад", ar: "جدول زمني", ka: "განრიგი", fr: "horaire" },
  { level: "B1", es: "cita", en: "appointment", uk: "прийом", ar: "موعد", ka: "პაემანი", fr: "rendez-vous" },
  { level: "B1", es: "plazo", en: "deadline", uk: "термін", ar: "مهلة", ka: "ვადა", fr: "délai" },
  { level: "B1", es: "compromiso", en: "commitment", uk: "зобов'язання", ar: "التزام", ka: "ვალდებულება", fr: "engagement" },
  { level: "B1", es: "mensaje", en: "message", uk: "повідомлення", ar: "رسالة", ka: "შეტყობინება", fr: "message" },
  { level: "B1", es: "llamada", en: "call", uk: "дзвінок", ar: "مكالمة", ka: "ზარი", fr: "appel" },
  { level: "B1", es: "correo", en: "mail", uk: "пошта", ar: "بريد", ka: "ფოსტა", fr: "courrier" },
  { level: "B1", es: "contraseña", en: "password", uk: "пароль", ar: "كلمة مرور", ka: "პაროლი", fr: "mot de passe" },
  { level: "B1", es: "conexión", en: "connection", uk: "з'єднання", ar: "اتصال", ka: "კავშირი", fr: "connexion" },
  { level: "B1", es: "pantalla", en: "screen", uk: "екран", ar: "شاشة", ka: "ეკრანი", fr: "écran" },
  { level: "B1", es: "batería", en: "battery", uk: "батарея", ar: "بطارية", ka: "ბატარეა", fr: "batterie" },
  { level: "B1", es: "cargador", en: "charger", uk: "зарядка", ar: "شاحن", ka: "დამტენი", fr: "chargeur" },
  { level: "B1", es: "aplicación", en: "app", uk: "додаток", ar: "تطبيق", ka: "აპლიკაცია", fr: "application" },
  { level: "B1", es: "red", en: "network", uk: "мережа", ar: "شبكة", ka: "ქსელი", fr: "réseau" },
  { level: "B1", es: "internet", en: "internet", uk: "інтернет", ar: "إنترنت", ka: "ინტერნეტი", fr: "internet" },
  { level: "B1", es: "archivo", en: "file", uk: "файл", ar: "ملف", ka: "ფაილი", fr: "fichier" },
  { level: "B1", es: "impresora", en: "printer", uk: "принтер", ar: "طابعة", ka: "პრინტერი", fr: "imprimante" },
  { level: "B1", es: "barrio", en: "neighborhood", uk: "район", ar: "حي", ka: "უბანი", fr: "quartier" },
  { level: "B1", es: "calle", en: "street", uk: "вулиця", ar: "شارع", ka: "ქუჩა", fr: "rue" },
  { level: "B1", es: "edificio", en: "building", uk: "будівля", ar: "مبنى", ka: "შენობა", fr: "bâtiment" },
  { level: "B1", es: "esquina", en: "corner", uk: "ріг", ar: "زاوية", ka: "კუთხე", fr: "coin" },
  { level: "B1", category: "transport", es: "semáforo", en: "traffic light", uk: "світлофор", ar: "إشارة مرور", ka: "შუქნიშანი", fr: "feu de circulation" },
  { level: "B1", es: "acera", en: "sidewalk", uk: "тротуар", ar: "رصيف", ka: "ტროტუარი", fr: "trottoir" },
  { level: "B1", es: "ayuntamiento", en: "city hall", uk: "мерія", ar: "بلدية", ka: "მერია", fr: "mairie" },
  { level: "B1", es: "banco", en: "bank", uk: "банк", ar: "بنك", ka: "ბანკი", fr: "banque" },
  { level: "B1", es: "cuenta", en: "account", uk: "рахунок", ar: "حساب", ka: "ანგარიში", fr: "compte" },
  { level: "B1", category: "shopping", es: "tarjeta", en: "card", uk: "картка", ar: "بطاقة", ka: "ბარათი", fr: "carte" },
  { level: "B1", es: "efectivo", en: "cash", uk: "готівка", ar: "نقد", ka: "ნაღდი ფული", fr: "espèces" },
  { level: "B1", category: "shopping", es: "factura", en: "bill", uk: "квитанція", ar: "فاتورة", ka: "ინვოისი", fr: "facture" },
  { level: "B1", es: "impuesto", en: "tax", uk: "податок", ar: "ضريبة", ka: "გადასახადი", fr: "impôt" },
  { level: "B1", es: "ahorro", en: "savings", uk: "заощадження", ar: "ادخار", ka: "დანაზოგი", fr: "épargne" },
  { level: "B1", es: "préstamo", en: "loan", uk: "позика", ar: "قرض", ka: "სესხი", fr: "prêt" },
  { level: "B1", es: "deuda", en: "debt", uk: "борг", ar: "دين", ka: "ვალი", fr: "dette" },
  { level: "B1", es: "alquiler", en: "rent", uk: "оренда", ar: "إيجار", ka: "ქირა", fr: "loyer" },
  { level: "B1", es: "hipoteca", en: "mortgage", uk: "іпотека", ar: "رهن عقاري", ka: "იპოთეკა", fr: "hypothèque" },
  { level: "B1", es: "rutina", en: "routine", uk: "рутина", ar: "روتين", ka: "რუტინა", fr: "routine" },
  { level: "B1", es: "ejercicio", en: "exercise", uk: "вправа", ar: "تمرين", ka: "ვარჯიში", fr: "exercice" },
  { level: "B1", es: "dieta", en: "diet", uk: "дієта", ar: "حمية", ka: "დიეტა", fr: "régime" },
  { level: "B1", es: "descanso", en: "rest", uk: "відпочинок", ar: "راحة", ka: "დასვენება", fr: "repos" },
  { level: "B1", es: "sueño", en: "sleep", uk: "сон", ar: "نوم", ka: "ძილი", fr: "sommeil" },
  { level: "B1", es: "pesadilla", en: "nightmare", uk: "кошмар", ar: "كابوس", ka: "კოშმარი", fr: "cauchemar" },
  { level: "B1", es: "despertador", en: "alarm clock", uk: "будильник", ar: "منبه", ka: "მაღვიძარა", fr: "réveil" },
  { level: "B1", es: "desayuno", en: "breakfast", uk: "сніданок", ar: "فطور", ka: "საუზმე", fr: "petit-déjeuner" },
  { level: "B1", es: "almuerzo", en: "lunch", uk: "обід", ar: "غداء", ka: "სადილი", fr: "déjeuner" },
  { level: "B1", es: "cena", en: "dinner", uk: "вечеря", ar: "عشاء", ka: "ვახშამი", fr: "dîner" },
  { level: "B1", es: "bebida", en: "drink", uk: "напій", ar: "مشروب", ka: "სასმელი", fr: "boisson" },
  { level: "B1", category: "food", es: "postre", en: "dessert", uk: "десерт", ar: "حلوى", ka: "დესერტი", fr: "dessert" },
  { level: "B1", es: "ingrediente", en: "ingredient", uk: "інгредієнт", ar: "مكون", ka: "ინგრედიენტი", fr: "ingrédient" },
  { level: "B1", es: "sabor", en: "flavor", uk: "смак", ar: "نكهة", ka: "გემო", fr: "saveur" },
  { level: "B1", category: "food", es: "plato", en: "dish", uk: "страва", ar: "طبق", ka: "კერძი", fr: "plat" },
  { level: "B1", es: "conversación", en: "conversation", uk: "розмова", ar: "محادثة", ka: "საუბარი", fr: "conversation" },
  { level: "B1", es: "discusión", en: "argument", uk: "обговорення", ar: "جدال", ka: "განხილვა", fr: "discussion" },
  { level: "B1", es: "consejo", en: "advice", uk: "порада", ar: "نصيحة", ka: "რჩევა", fr: "conseil" },
  { level: "B1", es: "sugerencia", en: "suggestion", uk: "пропозиція", ar: "اقتراح", ka: "წინადადება", fr: "suggestion" },
  { level: "B1", es: "queja", en: "complaint", uk: "скарга", ar: "شكوى", ka: "საჩივარი", fr: "plainte" },
  { level: "B1", es: "disculpa", en: "apology", uk: "вибачення", ar: "اعتذار", ka: "ბოდიში", fr: "excuse" },
  { level: "B1", es: "felicitación", en: "congratulation", uk: "поздоровлення", ar: "تهنئة", ka: "მილოცვა", fr: "félicitations" },
  { level: "B1", es: "invitación", en: "invitation", uk: "запрошення", ar: "دعوة", ka: "მოწვევა", fr: "invitation" },
  { level: "B1", es: "despedida", en: "farewell", uk: "прощання", ar: "وداع", ka: "დამშვიდობება", fr: "adieu" },
  { level: "B1", es: "saludo", en: "greeting", uk: "привітання", ar: "تحية", ka: "მისალმება", fr: "salutation" },
  { level: "B1", es: "afición", en: "hobby", uk: "захоплення", ar: "هواية", ka: "გატაცება", fr: "passion" },
  { level: "B1", es: "entretenimiento", en: "entertainment", uk: "розвага", ar: "ترفيه", ka: "გართობა", fr: "divertissement" },
  { level: "B1", es: "pasatiempo", en: "pastime", uk: "дозвілля", ar: "تسلية", ka: "თავშექცევა", fr: "passe-temps" },
  { level: "B1", es: "colección", en: "collection", uk: "колекція", ar: "مجموعة", ka: "კოლექცია", fr: "collection" },
  { level: "B1", es: "mueble", en: "piece of furniture", uk: "меблі", ar: "أثاث", ka: "ავეჯი", fr: "meuble" },
  { level: "B1", es: "armario", en: "closet", uk: "шафа", ar: "خزانة", ka: "კარადა", fr: "armoire" },
  { level: "B1", es: "estantería", en: "shelf", uk: "полиця", ar: "رف", ka: "თარო", fr: "étagère" },
  { level: "B1", es: "alfombra", en: "carpet", uk: "килим", ar: "سجادة", ka: "ხალიჩა", fr: "tapis" },
  { level: "B1", es: "cortina", en: "curtain", uk: "штора", ar: "ستارة", ka: "ფარდა", fr: "rideau" },
  { level: "B1", es: "balcón", en: "balcony", uk: "балкон", ar: "شرفة", ka: "აივანი", fr: "balcon" },
  { level: "B1", es: "terraza", en: "terrace", uk: "тераса", ar: "تراس", ka: "ტერასა", fr: "terrasse" },
  { level: "B1", es: "jardinería", en: "gardening", uk: "садівництво", ar: "بستنة", ka: "მებაღეობა", fr: "jardinage" },
  { level: "B1", es: "huerto", en: "vegetable garden", uk: "город", ar: "بستان", ka: "ბოსტანი", fr: "potager" },
  { level: "B1", es: "relámpago", en: "lightning", uk: "блискавка", ar: "برق", ka: "ელვა", fr: "éclair" },
  { level: "B1", es: "trueno", en: "thunder", uk: "грім", ar: "رعد", ka: "ქუხილი", fr: "tonnerre" },
  { level: "B1", es: "actualmente", en: "currently", uk: "наразі", ar: "حاليًا", ka: "ამჟამად", fr: "actuellement" },
  { level: "B1", es: "finalmente", en: "finally", uk: "нарешті", ar: "أخيرًا", ka: "საბოლოოდ", fr: "finalement" },
  { level: "B1", es: "frecuentemente", en: "frequently", uk: "часто", ar: "بشكل متكرر", ka: "ხშირად", fr: "fréquemment" },
  { level: "B1", es: "generalmente", en: "generally", uk: "загалом", ar: "بشكل عام", ka: "ზოგადად", fr: "généralement" },
  { level: "B1", es: "inmediatamente", en: "immediately", uk: "негайно", ar: "فورًا", ka: "დაუყოვნებლივ", fr: "immédiatement" },
  { level: "B1", es: "personalmente", en: "personally", uk: "особисто", ar: "شخصيًا", ka: "პირადად", fr: "personnellement" },
  { level: "B1", es: "rápidamente", en: "quickly", uk: "швидко", ar: "بسرعة", ka: "სწრაფად", fr: "rapidement" },
  { level: "B1", es: "recientemente", en: "recently", uk: "нещодавно", ar: "مؤخرًا", ka: "ცოტა ხნის წინ", fr: "récemment" },
  { level: "B1", es: "totalmente", en: "totally", uk: "повністю", ar: "تمامًا", ka: "სრულიად", fr: "totalement" },
  { level: "B1", es: "lentamente", en: "slowly", uk: "повільно", ar: "ببطء", ka: "ნელა", fr: "lentement" },
  { level: "B1", es: "naturalmente", en: "naturally", uk: "природно", ar: "بطبيعة الحال", ka: "ბუნებრივია", fr: "naturellement" },
  { level: "B1", es: "obviamente", en: "obviously", uk: "очевидно", ar: "بوضوح", ka: "აშკარად", fr: "évidemment" },

  // ---- B2 ----
  { level: "B2", es: "amplio", en: "wide", uk: "широкий", ar: "عريض", ka: "ფართო", fr: "large" },
  { level: "B2", es: "acuerdo", en: "agreement", uk: "угода", ar: "اتفاق", ka: "შეთანხმება", fr: "accord" },
  { level: "B2", es: "desacuerdo", en: "disagreement", uk: "незгода", ar: "خلاف", ka: "უთანხმოება", fr: "désaccord" },
  { level: "B2", es: "argumento", en: "argument", uk: "аргумент", ar: "حجة", ka: "არგუმენტი", fr: "argument" },
  { level: "B2", es: "evidencia", en: "evidence", uk: "доказ", ar: "دليل", ka: "მტკიცებულება", fr: "preuve" },
  { level: "B2", es: "hipótesis", en: "hypothesis", uk: "гіпотеза", ar: "فرضية", ka: "ჰიპოთეზა", fr: "hypothèse" },
  { level: "B2", es: "teoría", en: "theory", uk: "теорія", ar: "نظرية", ka: "თეორია", fr: "théorie" },
  { level: "B2", es: "consecuencia", en: "consequence", uk: "наслідок", ar: "نتيجة", ka: "შედეგი", fr: "conséquence" },
  { level: "B2", es: "causa", en: "cause", uk: "причина", ar: "سبب", ka: "მიზეზი", fr: "cause" },
  { level: "B2", es: "efecto", en: "effect", uk: "ефект", ar: "تأثير", ka: "ეფექტი", fr: "effet" },
  { level: "B2", es: "ventaja", en: "advantage", uk: "перевага", ar: "ميزة", ka: "უპირატესობა", fr: "avantage" },
  { level: "B2", es: "desventaja", en: "disadvantage", uk: "недолік", ar: "عيب", ka: "ნაკლი", fr: "inconvénient" },
  { level: "B2", es: "beneficio", en: "benefit", uk: "вигода", ar: "فائدة", ka: "სარგებელი", fr: "bénéfice" },
  { level: "B2", es: "perjuicio", en: "harm", uk: "шкода", ar: "ضرر", ka: "ზიანი", fr: "préjudice" },
  { level: "B2", es: "riesgo", en: "risk", uk: "ризик", ar: "خطر", ka: "რისკი", fr: "risque" },
  { level: "B2", es: "oportunidad", en: "opportunity", uk: "можливість", ar: "فرصة", ka: "შესაძლებლობა", fr: "opportunité" },
  { level: "B2", es: "obstáculo", en: "obstacle", uk: "перешкода", ar: "عائق", ka: "დაბრკოლება", fr: "obstacle" },
  { level: "B2", es: "solución", en: "solution", uk: "розв'язання", ar: "حل", ka: "გადაწყვეტა", fr: "solution" },
  { level: "B2", es: "alternativa", en: "alternative", uk: "альтернатива", ar: "بديل", ka: "ალტერნატივა", fr: "alternative" },
  { level: "B2", es: "decisión", en: "decision", uk: "рішення", ar: "قرار", ka: "გადაწყვეტილება", fr: "décision" },
  { level: "B2", es: "elección", en: "choice", uk: "вибір", ar: "اختيار", ka: "არჩევანი", fr: "choix" },
  { level: "B2", es: "opinión", en: "opinion", uk: "думка", ar: "رأي", ka: "აზრი", fr: "opinion" },
  { level: "B2", es: "actitud", en: "attitude", uk: "ставлення", ar: "موقف", ka: "დამოკიდებულება", fr: "attitude" },
  { level: "B2", es: "comportamiento", en: "behavior", uk: "поведінка", ar: "سلوك", ka: "ქცევა", fr: "comportement" },
  { level: "B2", es: "reacción", en: "reaction", uk: "реакція", ar: "رد فعل", ka: "რეაქცია", fr: "réaction" },
  { level: "B2", es: "expectativa", en: "expectation", uk: "очікування", ar: "توقع", ka: "მოლოდინი", fr: "attente" },
  { level: "B2", es: "suposición", en: "assumption", uk: "припущення", ar: "افتراض", ka: "ვარაუდი", fr: "supposition" },
  { level: "B2", es: "conclusión", en: "conclusion", uk: "висновок", ar: "استنتاج", ka: "დასკვნა", fr: "conclusion" },
  { level: "B2", category: "medicine", es: "análisis", en: "analysis", uk: "аналіз", ar: "تحليل", ka: "ანალიზი", fr: "analyse" },
  { level: "B2", category: "education", es: "investigación", en: "research", uk: "дослідження", ar: "بحث", ka: "კვლევა", fr: "recherche" },
  { level: "B2", es: "estadística", en: "statistic", uk: "статистика", ar: "إحصائية", ka: "სტატისტიკა", fr: "statistique" },
  { level: "B2", es: "porcentaje", en: "percentage", uk: "відсоток", ar: "نسبة مئوية", ka: "პროცენტი", fr: "pourcentage" },
  { level: "B2", es: "promedio", en: "average", uk: "середнє", ar: "متوسط", ka: "საშუალო", fr: "moyenne" },
  { level: "B2", es: "tendencia", en: "trend", uk: "тенденція", ar: "اتجاه", ka: "ტენდენცია", fr: "tendance" },
  { level: "B2", es: "fenómeno", en: "phenomenon", uk: "явище", ar: "ظاهرة", ka: "ფენომენი", fr: "phénomène" },
  { level: "B2", es: "factor", en: "factor", uk: "фактор", ar: "عامل", ka: "ფაქტორი", fr: "facteur" },
  { level: "B2", es: "aspecto", en: "aspect", uk: "аспект", ar: "جانب", ka: "ასპექტი", fr: "aspect" },
  { level: "B2", es: "concepto", en: "concept", uk: "поняття", ar: "مفهوم", ka: "კონცეფცია", fr: "concept" },
  { level: "B2", es: "principio", en: "principle", uk: "принцип", ar: "مبدأ", ka: "პრინციპი", fr: "principe" },
  { level: "B2", es: "estrategia", en: "strategy", uk: "стратегія", ar: "استراتيجية", ka: "სტრატეგია", fr: "stratégie" },
  { level: "B2", es: "prueba", en: "test", uk: "тест", ar: "اختبار", ka: "ტესტი", fr: "test" },
  { level: "B2", es: "noticia", en: "news", uk: "новина", ar: "خبر", ka: "ამბავი", fr: "nouvelle" },
  { level: "B2", es: "titular", en: "headline", uk: "заголовок", ar: "عنوان رئيسي", ka: "სათაური", fr: "titre" },
  { level: "B2", es: "debate", en: "debate", uk: "дебати", ar: "نقاش", ka: "დებატები", fr: "débat" },
  { level: "B2", es: "votación", en: "voting", uk: "голосування", ar: "تصويت", ka: "კენჭისყრა", fr: "vote" },
  { level: "B2", es: "comicios", en: "elections", uk: "вибори", ar: "انتخابات", ka: "არჩევნები", fr: "élections" },
  { level: "B2", es: "gobierno", en: "government", uk: "уряд", ar: "حكومة", ka: "მთავრობა", fr: "gouvernement" },
  { level: "B2", es: "ciudadano", en: "citizen", uk: "громадянин", ar: "مواطن", ka: "მოქალაქე", fr: "citoyen" },
  { level: "B2", es: "democracia", en: "democracy", uk: "демократія", ar: "ديمقراطية", ka: "დემოკრატია", fr: "démocratie" },
  { level: "B2", es: "ley", en: "law", uk: "закон", ar: "قانون", ka: "კანონი", fr: "loi" },
  { level: "B2", es: "norma", en: "norm", uk: "норма", ar: "معيار", ka: "ნორმა", fr: "norme" },
  { level: "B2", es: "reforma", en: "reform", uk: "реформа", ar: "إصلاح", ka: "რეფორმა", fr: "réforme" },
  { level: "B2", es: "política", en: "policy", uk: "політика", ar: "سياسة", ka: "პოლიტიკა", fr: "politique" },
  { level: "B2", es: "economía", en: "economy", uk: "економіка", ar: "اقتصاد", ka: "ეკონომიკა", fr: "économie" },
  { level: "B2", es: "mercado", en: "market", uk: "ринок", ar: "سوق", ka: "ბაზარი", fr: "marché" },
  { level: "B2", category: "work", es: "empresa", en: "company", uk: "компанія", ar: "شركة", ka: "კომპანია", fr: "entreprise" },
  { level: "B2", es: "inversión", en: "investment", uk: "інвестиція", ar: "استثمار", ka: "ინვესტიცია", fr: "investissement" },
  { level: "B2", es: "producción", en: "production", uk: "виробництво", ar: "إنتاج", ka: "წარმოება", fr: "production" },
  { level: "B2", es: "consumo", en: "consumption", uk: "споживання", ar: "استهلاك", ka: "მოხმარება", fr: "consommation" },
  { level: "B2", es: "exportación", en: "export", uk: "експорт", ar: "تصدير", ka: "ექსპორტი", fr: "exportation" },
  { level: "B2", es: "importación", en: "import", uk: "імпорт", ar: "استيراد", ka: "იმპორტი", fr: "importation" },
  { level: "B2", es: "innovación", en: "innovation", uk: "інновація", ar: "ابتكار", ka: "ინოვაცია", fr: "innovation" },
  { level: "B2", es: "tecnología", en: "technology", uk: "технологія", ar: "تقنية", ka: "ტექნოლოგია", fr: "technologie" },
  { level: "B2", es: "invento", en: "invention", uk: "винахід", ar: "اختراع", ka: "გამოგონება", fr: "invention" },
  { level: "B2", es: "descubrimiento", en: "discovery", uk: "відкриття", ar: "اكتشاف", ka: "აღმოჩენა", fr: "découverte" },
  { level: "B2", es: "avance", en: "breakthrough", uk: "прорив", ar: "تقدم", ka: "წინსვლა", fr: "avancée" },
  { level: "B2", es: "herramienta", en: "tool", uk: "інструмент", ar: "أداة", ka: "ინსტრუმენტი", fr: "outil" },
  { level: "B2", es: "recurso", en: "resource", uk: "ресурс", ar: "مورد", ka: "რესურსი", fr: "ressource" },
  { level: "B2", es: "sostenibilidad", en: "sustainability", uk: "сталість", ar: "استدامة", ka: "მდგრადობა", fr: "durabilité" },
  { level: "B2", es: "emisión", en: "emission", uk: "викид", ar: "انبعاث", ka: "გამონაბოლქვი", fr: "émission" },
  { level: "B2", es: "clima", en: "climate", uk: "клімат", ar: "مناخ", ka: "კლიმატი", fr: "climat" },
  { level: "B2", es: "calentamiento", en: "warming", uk: "потепління", ar: "احترار", ka: "დათბობა", fr: "réchauffement" },
  { level: "B2", es: "ecosistema", en: "ecosystem", uk: "екосистема", ar: "نظام بيئي", ka: "ეკოსისტემა", fr: "écosystème" },
  { level: "B2", es: "especie", en: "species", uk: "вид", ar: "نوع", ka: "სახეობა", fr: "espèce" },
  { level: "B2", es: "biodiversidad", en: "biodiversity", uk: "біорізноманіття", ar: "تنوع بيولوجي", ka: "ბიომრავალფეროვნება", fr: "biodiversité" },
  { level: "B2", es: "aprendizaje", en: "learning", uk: "навчання", ar: "تعلم", ka: "სწავლა", fr: "apprentissage" },
  { level: "B2", es: "enseñanza", en: "teaching", uk: "викладання", ar: "تدريس", ka: "სწავლება", fr: "enseignement" },
  { level: "B2", es: "conocimiento", en: "knowledge", uk: "знання", ar: "معرفة", ka: "ცოდნა", fr: "connaissance" },
  { level: "B2", es: "habilidad", en: "skill", uk: "навичка", ar: "مهارة", ka: "უნარი", fr: "compétence" },
  { level: "B2", es: "capacidad", en: "capacity", uk: "здатність", ar: "قدرة", ka: "კომპეტენცია", fr: "capacité" },
  { level: "B2", es: "talento", en: "talent", uk: "талант", ar: "موهبة", ka: "ნიჭი", fr: "talent" },
  { level: "B2", es: "vocación", en: "vocation", uk: "покликання", ar: "نزعة", ka: "მოწოდება", fr: "vocation" },
  { level: "B2", es: "formación", en: "training", uk: "підготовка", ar: "تدريب", ka: "მომზადება", fr: "formation" },
  { level: "B2", es: "entorno", en: "surroundings", uk: "середовище", ar: "محيط", ka: "გარემო", fr: "environnement" },
  { level: "B2", es: "contexto", en: "context", uk: "контекст", ar: "سياق", ka: "კონტექსტი", fr: "contexte" },
  { level: "B2", es: "proceso", en: "process", uk: "процес", ar: "عملية", ka: "პროცესი", fr: "processus" },
  { level: "B2", es: "etapa", en: "stage", uk: "етап", ar: "مرحلة", ka: "ეტაპი", fr: "étape" },
  { level: "B2", es: "fase", en: "phase", uk: "фаза", ar: "طور", ka: "ფაზა", fr: "phase" },
  { level: "B2", es: "transformación", en: "transformation", uk: "трансформація", ar: "تحول", ka: "ტრანსფორმაცია", fr: "transformation" },
  { level: "B2", es: "evolución", en: "evolution", uk: "еволюція", ar: "تطور", ka: "ევოლუცია", fr: "évolution" },
  { level: "B2", es: "rendimiento", en: "performance", uk: "продуктивність", ar: "أداء", ka: "შესრულება", fr: "performance" },
  { level: "B2", es: "tribunal", en: "court", uk: "суд", ar: "محكمة", ka: "სასამართლო", fr: "tribunal" },
  { level: "B2", es: "juez", en: "judge", uk: "суддя", ar: "قاضٍ", ka: "მოსამართლე", fr: "juge" },
  { level: "B2", es: "abogado", en: "lawyer", uk: "адвокат", ar: "محامٍ", ka: "ადვოკატი", fr: "avocat" },
  { level: "B2", es: "testigo", en: "witness", uk: "свідок", ar: "شاهد", ka: "მოწმე", fr: "témoin" },
  { level: "B2", es: "veredicto", en: "verdict", uk: "вердикт", ar: "حكم", ka: "ვერდიქტი", fr: "verdict" },
  { level: "B2", es: "sentencia", en: "sentence", uk: "вирок", ar: "عقوبة", ka: "განაჩენი", fr: "sentence" },
  { level: "B2", es: "delito", en: "crime", uk: "злочин", ar: "جريمة", ka: "დანაშაული", fr: "délit" },
  { level: "B2", es: "víctima", en: "victim", uk: "жертва", ar: "ضحية", ka: "მსხვერპლი", fr: "victime" },
  { level: "B2", es: "culpa", en: "guilt", uk: "провина", ar: "ذنب", ka: "ბრალი", fr: "culpabilité" },
  { level: "B2", es: "inocencia", en: "innocence", uk: "невинність", ar: "براءة", ka: "უდანაშაულობა", fr: "innocence" },
  { level: "B2", es: "sospecha", en: "suspicion", uk: "підозра", ar: "شك", ka: "ეჭვი", fr: "soupçon" },
  { level: "B2", es: "acusación", en: "accusation", uk: "звинувачення", ar: "اتهام", ka: "ბრალდება", fr: "accusation" },
  { level: "B2", es: "defensa", en: "defense", uk: "захист", ar: "دفاع", ka: "დაცვა", fr: "défense" },
  { level: "B2", es: "escultura", en: "sculpture", uk: "скульптура", ar: "نحت", ka: "სკულპტურა", fr: "sculpture" },
  { level: "B2", es: "arquitectura", en: "architecture", uk: "архітектура", ar: "عمارة", ka: "არქიტექტურა", fr: "architecture" },
  { level: "B2", es: "literatura", en: "literature", uk: "література", ar: "أدب", ka: "ლიტერატურა", fr: "littérature" },
  { level: "B2", es: "poesía", en: "poetry", uk: "поезія", ar: "شعر", ka: "პოეზია", fr: "poésie" },
  { level: "B2", es: "novela", en: "novel", uk: "роман", ar: "رواية", ka: "რომანი", fr: "roman" },
  { level: "B2", es: "ensayo", en: "essay", uk: "есе", ar: "مقال", ka: "ესე", fr: "essai" },
  { level: "B2", es: "crítica", en: "critique", uk: "критика", ar: "نقد", ka: "კრიტიკა", fr: "critique" },
  { level: "B2", es: "exposición", en: "exhibition", uk: "виставка", ar: "معرض", ka: "გამოფენა", fr: "exposition" },
  { level: "B2", es: "galería", en: "gallery", uk: "галерея", ar: "صالة عرض", ka: "გალერეა", fr: "galerie" },
  { level: "B2", es: "genética", en: "genetics", uk: "генетика", ar: "علم الوراثة", ka: "გენეტიკა", fr: "génétique" },
  { level: "B2", es: "célula", en: "cell", uk: "клітина", ar: "خلية", ka: "უჯრედი", fr: "cellule" },
  { level: "B2", es: "universo", en: "universe", uk: "всесвіт", ar: "كون", ka: "სამყარო", fr: "univers" },
  { level: "B2", es: "asimismo", en: "likewise", uk: "так само", ar: "كذلك", ka: "ასევე", fr: "de même" },
  { level: "B2", es: "anteriormente", en: "previously", uk: "раніше", ar: "سابقًا", ka: "ადრე", fr: "précédemment" },
  { level: "B2", es: "afortunadamente", en: "fortunately", uk: "на щастя", ar: "لحسن الحظ", ka: "საბედნიეროდ", fr: "heureusement" },
  { level: "B2", es: "constantemente", en: "constantly", uk: "постійно", ar: "باستمرار", ka: "მუდმივად", fr: "constamment" },
  { level: "B2", es: "continuamente", en: "continuously", uk: "безперервно", ar: "بشكل مستمر", ka: "განუწყვეტლივ", fr: "continuellement" },
  { level: "B2", es: "inicialmente", en: "initially", uk: "спочатку", ar: "في البداية", ka: "თავდაპირველად", fr: "initialement" },
  { level: "B2", es: "justamente", en: "precisely", uk: "саме", ar: "بالضبط", ka: "სწორედ", fr: "justement" },
  { level: "B2", es: "mayormente", en: "mostly", uk: "здебільшого", ar: "في الغالب", ka: "უმეტესწილად", fr: "surtout" },
  { level: "B2", es: "nuevamente", en: "again", uk: "знову", ar: "مرة أخرى", ka: "კვლავ", fr: "de nouveau" },
  { level: "B2", es: "posiblemente", en: "possibly", uk: "ймовірно", ar: "من المحتمل", ka: "სავარაუდოდ", fr: "possiblement" },
  { level: "B2", es: "previamente", en: "beforehand", uk: "попередньо", ar: "مسبقًا", ka: "წინასწარ", fr: "préalablement" },
  { level: "B2", es: "principalmente", en: "mainly", uk: "головним чином", ar: "بشكل أساسي", ka: "ძირითადად", fr: "principalement" },
  { level: "B2", es: "sinceramente", en: "sincerely", uk: "щиро", ar: "بصدق", ka: "გულწრფელად", fr: "sincèrement" },
  { level: "B2", es: "tranquilamente", en: "calmly", uk: "спокійно", ar: "بهدوء", ka: "მშვიდად", fr: "tranquillement" },
  { level: "B2", es: "verdaderamente", en: "truly", uk: "справді", ar: "حقًا", ka: "ჭეშმარიტად", fr: "vraiment" },
  { level: "B2", es: "encima", en: "above", uk: "зверху", ar: "فوق", ka: "ზემოთ", fr: "au-dessus" },
  { level: "B2", es: "debajo", en: "below", uk: "знизу", ar: "تحت", ka: "ქვემოთ", fr: "en dessous" },
  { level: "B2", es: "delante", en: "in front", uk: "попереду", ar: "أمام", ka: "წინ", fr: "devant" },
  { level: "B2", es: "aparte", en: "apart", uk: "окремо", ar: "جانبًا", ka: "ცალკე", fr: "à part" },
  { level: "B2", es: "ojalá", en: "hopefully", uk: "дай боже", ar: "ليت", ka: "ნეტავ", fr: "espérons" },
  { level: "B2", es: "eventualmente", en: "potentially", uk: "евентуально", ar: "احتمالًا", ka: "შემთხვევით", fr: "éventuellement" },
  { level: "B2", es: "brevemente", en: "briefly", uk: "коротко", ar: "بإيجاز", ka: "მოკლედ", fr: "brièvement" },
  { level: "B2", es: "imprescindible", en: "essential", uk: "незамінний", ar: "ضروري", ka: "აუცილებელი", fr: "indispensable" },
  { level: "B2", es: "ambiguo", en: "ambiguous", uk: "двозначний", ar: "غامض", ka: "ორაზროვანი", fr: "ambigu" },
  { level: "B2", es: "coherente", en: "coherent", uk: "послідовний", ar: "متماسك", ka: "თანმიმდევრული", fr: "cohérent" },
  { level: "B2", es: "eficaz", en: "effective", uk: "ефективний", ar: "فعّال", ka: "ეფექტური", fr: "efficace" },
  { level: "B2", es: "previsible", en: "predictable", uk: "передбачуваний", ar: "متوقع", ka: "განჭვრეტადი", fr: "prévisible" },
  { level: "B2", es: "sostenible", en: "sustainable", uk: "сталий", ar: "مستدام", ka: "მდგრადი", fr: "durable" },
  { level: "B2", es: "polémico", en: "controversial", uk: "суперечливий", ar: "مثير للجدل", ka: "საკამათო", fr: "polémique" },
  { level: "B2", es: "versátil", en: "versatile", uk: "універсальний", ar: "متعدد الاستخدامات", ka: "მრავალმხრივი", fr: "polyvalent" },
  { level: "B2", es: "exhaustivo", en: "exhaustive", uk: "вичерпний", ar: "شامل", ka: "ამომწურავი", fr: "exhaustif" },
  { level: "B2", es: "audaz", en: "bold", uk: "сміливий", ar: "جريء", ka: "თამამი", fr: "audacieux" },
  { level: "B2", es: "ingenuo", en: "naive", uk: "наївний", ar: "ساذج", ka: "გულუბრყვილო", fr: "naïf" },
  { level: "B2", es: "escéptico", en: "skeptical", uk: "скептичний", ar: "متشكك", ka: "სკეპტიკური", fr: "sceptique" },
  { level: "B2", es: "pragmático", en: "pragmatic", uk: "прагматичний", ar: "عملي", ka: "პრაგმატული", fr: "pragmatique" },
  { level: "B2", es: "autónomo", en: "autonomous", uk: "автономний", ar: "مستقل", ka: "ავტონომიური", fr: "autonome" },
  { level: "B2", es: "contundente", en: "forceful", uk: "рішучий", ar: "قاطع", ka: "მტკიცე", fr: "catégorique" },
  { level: "B2", es: "riguroso", en: "rigorous", uk: "суворий", ar: "صارم", ka: "მკაცრი", fr: "rigoureux" },
  { level: "B2", es: "incierto", en: "uncertain", uk: "непевний", ar: "غير مؤكد", ka: "გაურკვეველი", fr: "incertain" },

  // ---- C1 ----
  { level: "C1", es: "efímero", en: "ephemeral", uk: "ефемерний", ar: "زائل", ka: "ხანმოკლე", fr: "éphémère" },
  { level: "C1", es: "perspicaz", en: "perceptive", uk: "проникливий", ar: "فطن", ka: "გამჭრიახი", fr: "perspicace" },
  { level: "C1", es: "vehemente", en: "vehement", uk: "палкий", ar: "شديد", ka: "მძაფრი", fr: "véhément" },
  { level: "C1", es: "lacónico", en: "laconic", uk: "лаконічний", ar: "مقتضب", ka: "ლაკონური", fr: "laconique" },
  { level: "C1", es: "exiguo", en: "meager", uk: "мізерний", ar: "ضئيل", ka: "მწირი", fr: "maigre" },
  { level: "C1", es: "intrínseco", en: "intrinsic", uk: "притаманний", ar: "جوهري", ka: "თანდაყოლილი", fr: "intrinsèque" },
  { level: "C1", es: "ubicuo", en: "ubiquitous", uk: "повсюдний", ar: "منتشر", ka: "ყველგანმყოფი", fr: "omniprésent" },
  { level: "C1", es: "ecléctico", en: "eclectic", uk: "еклектичний", ar: "انتقائي", ka: "ეკლექტიკური", fr: "éclectique" },
  { level: "C1", es: "austero", en: "austere", uk: "аскетичний", ar: "متقشف", ka: "ასკეტური", fr: "austère" },
  { level: "C1", es: "sagaz", en: "shrewd", uk: "кмітливий", ar: "حصيف", ka: "საზრიანი", fr: "sagace" },
  { level: "C1", es: "prolífico", en: "prolific", uk: "плідний", ar: "مثمر", ka: "ნაყოფიერი", fr: "prolifique" },
  { level: "C1", es: "inequívoco", en: "unequivocal", uk: "однозначний", ar: "جلي", ka: "ცალსახა", fr: "univoque" },
  { level: "C1", es: "indeleble", en: "indelible", uk: "незгладимий", ar: "لا يُمحى", ka: "ამოუშლელი", fr: "indélébile" },
  { level: "C1", es: "taciturno", en: "taciturn", uk: "мовчазний", ar: "صموت", ka: "მდუმარე", fr: "taciturne" },
  { level: "C1", es: "vertiginoso", en: "vertiginous", uk: "запаморочливий", ar: "دوّار", ka: "თავბრუდამხვევი", fr: "vertigineux" },
  { level: "C1", es: "ostensible", en: "evident", uk: "очевидний", ar: "ملحوظ", ka: "თვალსაჩინო", fr: "ostensible" },
  { level: "C1", es: "matiz", en: "nuance", uk: "нюанс", ar: "فارق دقيق", ka: "ნიუანსი", fr: "nuance" },
  { level: "C1", es: "paradoja", en: "paradox", uk: "парадокс", ar: "مفارقة", ka: "პარადოქსი", fr: "paradoxe" },
  { level: "C1", es: "dilema", en: "dilemma", uk: "дилема", ar: "معضلة", ka: "დილემა", fr: "dilemme" },
  { level: "C1", es: "controversia", en: "controversy", uk: "суперечка", ar: "جدل", ka: "კონტროვერსია", fr: "controverse" },
  { level: "C1", es: "encrucijada", en: "crossroads", uk: "перехрестя", ar: "مفترق طرق", ka: "გზაჯვარედინი", fr: "carrefour" },
  { level: "C1", es: "ambigüedad", en: "ambiguity", uk: "двозначність", ar: "غموض", ka: "ორაზროვნება", fr: "ambiguïté" },
  { level: "C1", es: "incertidumbre", en: "uncertainty", uk: "невизначеність", ar: "عدم اليقين", ka: "გაურკვევლობა", fr: "incertitude" },
  { level: "C1", es: "certeza", en: "certainty", uk: "певність", ar: "يقين", ka: "დარწმუნებულობა", fr: "certitude" },
  { level: "C1", es: "verosimilitud", en: "plausibility", uk: "правдоподібність", ar: "معقولية", ka: "სარწმუნოობა", fr: "vraisemblance" },
  { level: "C1", es: "discrepancia", en: "discrepancy", uk: "розбіжність", ar: "تباين", ka: "შეუსაბამობა", fr: "divergence" },
  { level: "C1", es: "subjetividad", en: "subjectivity", uk: "суб'єктивність", ar: "ذاتية", ka: "სუბიექტურობა", fr: "subjectivité" },
  { level: "C1", es: "objetividad", en: "objectivity", uk: "об'єктивність", ar: "موضوعية", ka: "ობიექტურობა", fr: "objectivité" },
  { level: "C1", es: "imparcialidad", en: "impartiality", uk: "неупередженість", ar: "حياد", ka: "მიუკერძოებლობა", fr: "impartialité" },
  { level: "C1", es: "sesgo", en: "bias", uk: "упередженість", ar: "تحيز", ka: "მიკერძოება", fr: "biais" },
  { level: "C1", es: "prejuicio", en: "prejudice", uk: "упередження", ar: "تحامل", ka: "წინასწარგანწყობა", fr: "préjugé" },
  { level: "C1", es: "estereotipo", en: "stereotype", uk: "стереотип", ar: "قالب نمطي", ka: "სტერეოტიპი", fr: "stéréotype" },
  { level: "C1", es: "discriminación", en: "discrimination", uk: "дискримінація", ar: "تمييز", ka: "დისკრიმინაცია", fr: "discrimination" },
  { level: "C1", es: "tolerancia", en: "tolerance", uk: "толерантність", ar: "تسامح", ka: "შემწყნარებლობა", fr: "tolérance" },
  { level: "C1", es: "empatía", en: "empathy", uk: "емпатія", ar: "تعاطف", ka: "ემპათია", fr: "empathie" },
  { level: "C1", es: "compasión", en: "compassion", uk: "співчуття", ar: "شفقة", ka: "თანაგრძნობა", fr: "compassion" },
  { level: "C1", es: "indiferencia", en: "indifference", uk: "байдужість", ar: "لامبالاة", ka: "გულგრილობა", fr: "indifférence" },
  { level: "C1", es: "apatía", en: "apathy", uk: "апатія", ar: "خمول", ka: "აპათია", fr: "apathie" },
  { level: "C1", es: "resiliencia", en: "resilience", uk: "стійкість", ar: "مرونة", ka: "გამძლეობა", fr: "résilience" },
  { level: "C1", es: "perseverancia", en: "perseverance", uk: "наполегливість", ar: "مثابرة", ka: "დაჟინებულობა", fr: "persévérance" },
  { level: "C1", es: "determinación", en: "determination", uk: "рішучість", ar: "عزيمة", ka: "სიმტკიცე", fr: "détermination" },
  { level: "C1", es: "ambición", en: "ambition", uk: "амбіція", ar: "طموح", ka: "ამბიცია", fr: "ambition" },
  { level: "C1", es: "arrogancia", en: "arrogance", uk: "зарозумілість", ar: "غطرسة", ka: "ქედმაღლობა", fr: "arrogance" },
  { level: "C1", es: "humildad", en: "humility", uk: "смирення", ar: "تواضع", ka: "თავმდაბლობა", fr: "humilité" },
  { level: "C1", es: "integridad", en: "integrity", uk: "цілісність", ar: "نزاهة", ka: "მთლიანობა", fr: "intégrité" },
  { level: "C1", es: "hipocresía", en: "hypocrisy", uk: "лицемірство", ar: "نفاق", ka: "თვალთმაქცობა", fr: "hypocrisie" },
  { level: "C1", es: "sinceridad", en: "sincerity", uk: "щирість", ar: "صدق", ka: "გულწრფელობა", fr: "sincérité" },
  { level: "C1", es: "franqueza", en: "frankness", uk: "відвертість", ar: "صراحة", ka: "გულღიაობა", fr: "franchise" },
  { level: "C1", es: "discreción", en: "discretion", uk: "стриманість", ar: "تحفظ", ka: "სიფრთხილე", fr: "discrétion" },
  { level: "C1", es: "prudencia", en: "prudence", uk: "розсудливість", ar: "حكمة", ka: "გონიერება", fr: "prudence" },
  { level: "C1", es: "temeridad", en: "recklessness", uk: "безрозсудність", ar: "تهور", ka: "დაუფიქრებლობა", fr: "témérité" },
  { level: "C1", es: "cautela", en: "caution", uk: "обачність", ar: "حذر", ka: "წინდახედულობა", fr: "précaution" },
  { level: "C1", es: "vulnerabilidad", en: "vulnerability", uk: "вразливість", ar: "هشاشة", ka: "დაუცველობა", fr: "vulnérabilité" },
  { level: "C1", es: "fortaleza", en: "fortitude", uk: "мужність", ar: "صمود", ka: "გამბედაობა", fr: "force" },
  { level: "C1", es: "adversidad", en: "adversity", uk: "труднощі", ar: "محنة", ka: "გასაჭირი", fr: "adversité" },
  { level: "C1", es: "trascendencia", en: "significance", uk: "значущість", ar: "أهمية", ka: "მნიშვნელობა", fr: "portée" },
  { level: "C1", es: "legado", en: "legacy", uk: "спадщина", ar: "إرث", ka: "მემკვიდრეობა", fr: "héritage", category: "family" },
  { level: "C1", es: "herencia", en: "inheritance", uk: "спадок", ar: "ميراث", ka: "სამკვიდრო", fr: "patrimoine", category: "family" },
  { level: "C1", es: "vínculo", en: "bond", uk: "зв'язок", ar: "رابطة", ka: "კავშირი", fr: "lien" },
  { level: "C1", es: "lazo", en: "tie", uk: "узи", ar: "رباط", ka: "ბმა", fr: "attache" },
  { level: "C1", es: "rivalidad", en: "rivalry", uk: "суперництво", ar: "تنافس", ka: "მეტოქეობა", fr: "rivalité" },
  { level: "C1", es: "alianza", en: "alliance", uk: "союз", ar: "تحالف", ka: "ალიანსი", fr: "alliance" },
  { level: "C1", es: "conflicto", en: "conflict", uk: "конфлікт", ar: "صراع", ka: "კონფლიქტი", fr: "conflit" },
  { level: "C1", es: "reconciliación", en: "reconciliation", uk: "примирення", ar: "مصالحة", ka: "შერიგება", fr: "réconciliation" },
  { level: "C1", es: "negociación", en: "negotiation", uk: "переговори", ar: "تفاوض", ka: "მოლაპარაკება", fr: "négociation" },
  { level: "C1", es: "mediación", en: "mediation", uk: "посередництво", ar: "وساطة", ka: "შუამავლობა", fr: "médiation" },
  { level: "C1", es: "consenso", en: "consensus", uk: "консенсус", ar: "إجماع", ka: "კონსენსუსი", fr: "consensus" },
  { level: "C1", es: "unanimidad", en: "unanimity", uk: "одностайність", ar: "إجماع تام", ka: "ერთსულოვნება", fr: "unanimité" },
  { level: "C1", es: "mayoría", en: "majority", uk: "більшість", ar: "أغلبية", ka: "უმრავლესობა", fr: "majorité" },
  { level: "C1", es: "minoría", en: "minority", uk: "меншість", ar: "أقلية", ka: "უმცირესობა", fr: "minorité" },
  { level: "C1", es: "representación", en: "representation", uk: "представництво", ar: "تمثيل", ka: "წარმომადგენლობა", fr: "représentation" },
  { level: "C1", es: "legitimidad", en: "legitimacy", uk: "легітимність", ar: "شرعية", ka: "ლეგიტიმურობა", fr: "légitimité" },
  { level: "C1", es: "autoridad", en: "authority", uk: "авторитет", ar: "سلطة", ka: "ავტორიტეტი", fr: "autorité" },
  { level: "C1", es: "jerarquía", en: "hierarchy", uk: "ієрархія", ar: "تسلسل هرمي", ka: "იერარქია", fr: "hiérarchie", category: "work" },
  { level: "C1", es: "autonomía", en: "autonomy", uk: "автономія", ar: "استقلالية", ka: "ავტონომია", fr: "autonomie" },
  { level: "C1", es: "dependencia", en: "dependence", uk: "залежність", ar: "اعتماد", ka: "დამოკიდებულება", fr: "dépendance" },
  { level: "C1", es: "interdependencia", en: "interdependence", uk: "взаємозалежність", ar: "ترابط", ka: "ურთიერთდამოკიდებულება", fr: "interdépendance" },
  { level: "C1", es: "solidaridad", en: "solidarity", uk: "солідарність", ar: "تضامن", ka: "სოლიდარობა", fr: "solidarité" },
  { level: "C1", es: "cohesión", en: "cohesion", uk: "згуртованість", ar: "تماسك", ka: "თანმიმდევრულობა", fr: "cohésion" },
  { level: "C1", es: "fragmentación", en: "fragmentation", uk: "фрагментація", ar: "تجزئة", ka: "ფრაგმენტაცია", fr: "fragmentation" },
  { level: "C1", es: "polarización", en: "polarization", uk: "поляризація", ar: "استقطاب", ka: "პოლარიზაცია", fr: "polarisation" },
  { level: "C1", es: "manipulación", en: "manipulation", uk: "маніпуляція", ar: "تلاعب", ka: "მანიპულაცია", fr: "manipulation" },
  { level: "C1", es: "persuasión", en: "persuasion", uk: "переконання", ar: "إقناع", ka: "დარწმუნება", fr: "persuasion" },
  { level: "C1", es: "retórica", en: "rhetoric", uk: "риторика", ar: "بلاغة", ka: "რიტორიკა", fr: "rhétorique", category: "education" },
  { level: "C1", es: "elocuencia", en: "eloquence", uk: "красномовність", ar: "فصاحة", ka: "მჭევრმეტყველება", fr: "éloquence", category: "education" },
  { level: "C1", es: "ironía", en: "irony", uk: "іронія", ar: "سخرية", ka: "ირონია", fr: "ironie" },
  { level: "C1", es: "sarcasmo", en: "sarcasm", uk: "сарказм", ar: "تهكم", ka: "სარკაზმი", fr: "sarcasme" },
  { level: "C1", es: "sátira", en: "satire", uk: "сатира", ar: "هجاء", ka: "სატირა", fr: "satire" },
  { level: "C1", es: "metáfora", en: "metaphor", uk: "метафора", ar: "استعارة", ka: "მეტაფორა", fr: "métaphore" },
  { level: "C1", es: "alegoría", en: "allegory", uk: "алегорія", ar: "تمثيل رمزي", ka: "ალეგორია", fr: "allégorie" },
  { level: "C1", es: "simbolismo", en: "symbolism", uk: "символізм", ar: "رمزية", ka: "სიმბოლიზმი", fr: "symbolisme" },
  { level: "C1", es: "connotación", en: "connotation", uk: "конотація", ar: "دلالة ضمنية", ka: "კონოტაცია", fr: "connotation" },
  { level: "C1", es: "denotación", en: "denotation", uk: "пряме значення", ar: "دلالة صريحة", ka: "პირდაპირი მნიშვნელობა", fr: "dénotation" },
  { level: "C1", es: "interpretación", en: "interpretation", uk: "інтерпретація", ar: "تفسير", ka: "ინტერპრეტაცია", fr: "interprétation" },
  { level: "C1", es: "malentendido", en: "misunderstanding", uk: "непорозуміння", ar: "سوء فهم", ka: "გაუგებრობა", fr: "malentendu" },
  { level: "C1", es: "equívoco", en: "misconception", uk: "хибне уявлення", ar: "مغالطة", ka: "მცდარი წარმოდგენა", fr: "méprise" },
  { level: "C1", es: "percepción", en: "perception", uk: "сприйняття", ar: "إدراك", ka: "აღქმა", fr: "perception" },
  { level: "C1", es: "introspección", en: "introspection", uk: "самоаналіз", ar: "تأمل ذاتي", ka: "თვითანალიზი", fr: "introspection" },
  { level: "C1", es: "autoconocimiento", en: "self-knowledge", uk: "самопізнання", ar: "معرفة الذات", ka: "თვითშემეცნება", fr: "connaissance de soi" },
  { level: "C1", es: "autoestima", en: "self-esteem", uk: "самооцінка", ar: "تقدير الذات", ka: "თვითშეფასება", fr: "estime de soi" },
  { level: "C1", es: "autocontrol", en: "self-control", uk: "самоконтроль", ar: "ضبط النفس", ka: "თვითკონტროლი", fr: "maîtrise de soi" },
  { level: "C1", es: "autosuficiencia", en: "self-sufficiency", uk: "самодостатність", ar: "اكتفاء ذاتي", ka: "თვითკმარობა", fr: "autosuffisance" },
  { level: "C1", es: "desapego", en: "detachment", uk: "відстороненість", ar: "انفصال عاطفي", ka: "მოწყვეტა", fr: "détachement" },
  { level: "C1", es: "apego", en: "attachment", uk: "прив'язаність", ar: "تعلق", ka: "მიჯაჭვულობა", fr: "attachement" },
  { level: "C1", es: "melancolía", en: "melancholy", uk: "меланхолія", ar: "كآبة", ka: "მელანქოლია", fr: "mélancolie" },
  { level: "C1", es: "euforia", en: "euphoria", uk: "ейфорія", ar: "نشوة", ka: "ეიფორია", fr: "euphorie" },
  { level: "C1", es: "aprisa", en: "hastily", uk: "поспіхом", ar: "بسرعة", ka: "ჩქარა", fr: "promptement" },
  { level: "C1", es: "arduamente", en: "arduously", uk: "важко", ar: "بصعوبة", ka: "ძნელად", fr: "laborieusement" },
  { level: "C1", es: "repentinamente", en: "suddenly", uk: "раптово", ar: "فجأة", ka: "უცებ", fr: "soudainement" },
  { level: "C1", es: "adrede", en: "deliberately", uk: "навмисно", ar: "عمدًا", ka: "განზრახ", fr: "exprès" },
  { level: "C1", es: "aposta", en: "on purpose", uk: "спеціально", ar: "قصدًا", ka: "მიზანმიმართულად", fr: "à dessein" },
  { level: "C1", es: "conforme", en: "according to", uk: "відповідно до", ar: "وفقًا لـ", ka: "შესაბამისად", fr: "conformément" },
  { level: "C1", es: "inclusive", en: "even", uk: "навіть", ar: "حتى", ka: "კიდეც", fr: "même" },
  { level: "C1", es: "exclusive", en: "exclusively", uk: "виключно", ar: "حصريًا", ka: "ექსკლუზიურად", fr: "exclusivement" },
  { level: "C1", es: "viceversa", en: "vice versa", uk: "навпаки", ar: "والعكس صحيح", ka: "პირიქით", fr: "vice versa" },
  { level: "C1", es: "harto", en: "quite", uk: "досить", ar: "جدًا", ka: "საკმაოდ", fr: "assez" },
  { level: "C1", es: "dondequiera", en: "wherever", uk: "будь-де", ar: "أينما", ka: "სადაც არ უნდა", fr: "où que ce soit" },
  { level: "C1", es: "cuandoquiera", en: "whenever", uk: "будь-коли", ar: "متى ما", ka: "როდესაც არ უნდა", fr: "n'importe quand" },
  { level: "C1", es: "quienquiera", en: "whoever", uk: "хто б не", ar: "أيًّا كان", ka: "ვინც არ უნდა", fr: "qui que ce soit" },
  { level: "C1", es: "comoquiera", en: "however", uk: "як би не", ar: "كيفما", ka: "როგორც არ უნდა", fr: "quoi qu'il en soit" },
  { level: "C1", es: "cualesquiera", en: "whichever", uk: "будь-які", ar: "أي كان", ka: "რომელიც არ უნდა", fr: "quels qu'ils soient" },
  { level: "C1", es: "ulteriormente", en: "subsequently", uk: "згодом", ar: "لاحقًا", ka: "შემდგომში", fr: "ultérieurement" },
  { level: "C1", es: "seguidamente", en: "next", uk: "далі", ar: "تاليًا", ka: "შემდეგ", fr: "ensuite" },
  { level: "C1", es: "paulatinamente", en: "gradually", uk: "поступово", ar: "تدريجيًا", ka: "თანდათან", fr: "progressivement" },
  { level: "C1", es: "parentesco", en: "kinship", uk: "спорідненість", ar: "قرابة", ka: "ნათესაობა", fr: "parenté", category: "family" },
  { level: "C1", es: "maridaje", en: "food pairing", uk: "поєднання", ar: "اقتران", ka: "შეხამება", fr: "accord", category: "food" },
  { level: "C1", es: "periplo", en: "journey", uk: "мандрівка", ar: "رحلة طويلة", ka: "მოგზაურობა", fr: "périple" },
  { level: "C1", es: "sinergia", en: "synergy", uk: "синергія", ar: "تآزر", ka: "სინერგია", fr: "synergie", category: "work" },
  { level: "C1", es: "patología", en: "pathology", uk: "патологія", ar: "علم الأمراض", ka: "პათოლოგია", fr: "pathologie", category: "medicine" },
  { level: "C1", es: "ciberseguridad", en: "cybersecurity", uk: "кібербезпека", ar: "أمن سيبراني", ka: "კიბერუსაფრთხოება", fr: "cybersécurité" },
  { level: "C1", es: "jurisdicción", en: "jurisdiction", uk: "юрисдикція", ar: "اختصاص قضائي", ka: "იურისდიქცია", fr: "juridiction" },
  { level: "C1", es: "exquisitez", en: "delicacy", uk: "вишуканість", ar: "طعام شهي", ka: "დელიკატესი", fr: "délicatesse", category: "food" },
  { level: "C1", es: "tránsito", en: "transit", uk: "транзит", ar: "عبور", ka: "ტრანზიტი", fr: "transit", category: "transport" },
  { level: "C1", es: "lucrativo", en: "lucrative", uk: "прибутковий", ar: "مربح", ka: "მომგებიანი", fr: "lucratif", category: "work" },
  { level: "C1", es: "crónico", en: "chronic", uk: "хронічний", ar: "مزمن", ka: "ქრონიკული", fr: "chronique", category: "medicine" },
  { level: "C1", es: "encriptación", en: "encryption", uk: "шифрування", ar: "تشفير", ka: "დაშიფვრა", fr: "chiffrement" },
  { level: "C1", es: "burocracia", en: "bureaucracy", uk: "бюрократія", ar: "بيروقراطية", ka: "ბიუროკრატია", fr: "bureaucratie", category: "work" },
  { level: "C1", es: "deforestación", en: "deforestation", uk: "вирубка лісів", ar: "إزالة الغابات", ka: "ტყის გაჩეხვა", fr: "déforestation" },
  { level: "C1", es: "degustación", en: "tasting", uk: "дегустація", ar: "تذوق", ka: "დეგუსტაცია", fr: "dégustation", category: "food" },
  { level: "C1", es: "nómada", en: "nomad", uk: "кочівник", ar: "بدو", ka: "მომთაბარე", fr: "nomade", category: "travel" },
  { level: "C1", es: "inmunidad", en: "immunity", uk: "імунітет", ar: "مناعة", ka: "იმუნიტეტი", fr: "immunité", category: "medicine" },
  { level: "C1", es: "interfaz", en: "interface", uk: "інтерфейс", ar: "واجهة", ka: "ინტერფეისი", fr: "interface" },
  { level: "C1", es: "hegemonía", en: "hegemony", uk: "гегемонія", ar: "هيمنة", ka: "ჰეგემონია", fr: "hégémonie" },

  { level: "C1", es: "prolegómeno", en: "prologue", uk: "пролог", ar: "مقدمة", ka: "პროლოგი", fr: "prolégomènes" },
  { level: "C1", es: "consuetudinario", en: "customary", uk: "звичаєвий", ar: "عرفي", ka: "ჩვეულებითი", fr: "coutumier" },
  { level: "C1", es: "inexorable", en: "inexorable", uk: "невблаганний", ar: "لايرحم", ka: "შეუპოვარი", fr: "inexorable" },
  { level: "C1", es: "intangible", en: "intangible", uk: "нематеріальний", ar: "غيرملموس", ka: "არამატერიალური", fr: "intangible" },
  { level: "C1", es: "coercitivo", en: "coercive", uk: "примусовий", ar: "قسري", ka: "იძულებითი", fr: "coercitif" },
  { level: "C1", es: "vicisitud", en: "vicissitude", uk: "перепетія", ar: "تقلب", ka: "მერყეობა", fr: "vicissitude" },
  { level: "C1", es: "idiosincrasia", en: "idiosyncrasy", uk: "ідіосинкразія", ar: "خصوصية", ka: "იდიოსინკრაზია", fr: "idiosyncrasie" },
  { level: "C1", es: "paradigma", en: "paradigm", uk: "парадигма", ar: "نموذج", ka: "პარადიგმა", fr: "paradigme", category: "education" },
  { level: "C1", es: "dicotomía", en: "dichotomy", uk: "дихотомія", ar: "ثنائية", ka: "დიქოტომია", fr: "dichotomie" },
  { level: "C1", es: "dogma", en: "dogma", uk: "догма", ar: "عقيدة", ka: "დოგმა", fr: "dogme" },
  { level: "C1", es: "incólume", en: "unscathed", uk: "неушкоджений", ar: "سليم", ka: "უვნებელი", fr: "sain" },
  { level: "C1", es: "vehemencia", en: "vehemence", uk: "палкість", ar: "حماسة", ka: "შემართება", fr: "véhémence" },
  { level: "C1", es: "solvencia", en: "solvency", uk: "платоспроможність", ar: "ملاءة", ka: "გადახდისუნარიანობა", fr: "solvabilité" },
  { level: "C1", es: "conjetura", en: "conjecture", uk: "припущення", ar: "تخمين", ka: "ვარაუდი", fr: "conjecture", category: "education" },
  { level: "C1", es: "escepticismo", en: "skepticism", uk: "скептицизм", ar: "شكوكية", ka: "სკეპტიციზმი", fr: "scepticisme" },
  { level: "C1", es: "exasperación", en: "exasperation", uk: "роздратування", ar: "استيلاء", ka: "გაღიზიანება", fr: "exaspération" },
  { level: "C1", es: "consternación", en: "consternation", uk: "тривога", ar: "ذهول", ka: "შეძრწუნება", fr: "consternation" },
  { level: "C1", es: "pragmatismo", en: "pragmatism", uk: "прагматизм", ar: "براغماتية", ka: "პრაგმატიზმი", fr: "pragmatisme" },
  { level: "C1", es: "procrastinación", en: "procrastination", uk: "прокрастинація", ar: "تسويف", ka: "პროკრასტინაცია", fr: "procrastination" },
  { level: "C1", es: "redundancia", en: "redundancy", uk: "надмірність", ar: "تكرار", ka: "ზედმეტობა", fr: "redondance" },
  { level: "C1", es: "vanguardia", en: "avantgarde", uk: "авангард", ar: "طليعة", ka: "ავანგარდი", fr: "avantgarde" },
  { level: "C1", es: "coyuntura", en: "conjuncture", uk: "конюнктура", ar: "ظرف", ka: "კონიუნქტურა", fr: "conjoncture" },
  { level: "C1", es: "gregario", en: "gregarious", uk: "стадний", ar: "قطيعي", ka: "ჯოგური", fr: "grégaire" },
  { level: "C1", es: "mendaz", en: "mendacious", uk: "брехливий", ar: "كاذب", ka: "მტყუანი", fr: "mendacieux" },
  { level: "C1", es: "plausible", en: "plausible", uk: "правдоподібний", ar: "معقول", ka: "დასაჯერებელი", fr: "plausible" },
  { level: "C1", es: "esperpento", en: "grotesquery", uk: "гротеск", ar: "مسخ", ka: "გროტესკი", fr: "esperpento" },
  { level: "C1", es: "refutar", en: "refute", uk: "спростовувати", ar: "دحض", ka: "უარყოფა", fr: "réfuter" },
  { level: "C1", es: "sutileza", en: "subtlety", uk: "тонкість", ar: "دقة", ka: "სიფაქიზე", fr: "subtilité" },
  { level: "C1", es: "acuciante", en: "pressing", uk: "нагальний", ar: "ملح", ka: "მწვავე", fr: "pressant" },
  { level: "C1", es: "dilapidar", en: "squander", uk: "розтрачати", ar: "بدد", ka: "გაფანტვა", fr: "dilapider" },
  { level: "C1", es: "gala", en: "galas", uk: "гала", ar: "احتفال", ka: "ზეიმი", fr: "gala" },
  { level: "C1", es: "hastío", en: "tedium", uk: "нудьга", ar: "سأم", ka: "მოწყენილობა", fr: "lassitude" },
  { level: "C1", es: "latente", en: "latent", uk: "латентний", ar: "كامنة", ka: "ფარული", fr: "latent" },
  { level: "C1", es: "molicie", en: "softness", uk: "м'якість", ar: "ترف", ka: "სინაზე", fr: "mollesse" },
  { level: "C1", es: "nadir", en: "nadir", uk: "надир", ar: "حضيض", ka: "ნადირი", fr: "nadir" },
  { level: "C1", es: "recalcitrante", en: "recalcitrant", uk: "впертий", ar: "معاند", ka: "ურჩი", fr: "recalcitrant" },
  { level: "C1", es: "utópico", en: "utopian", uk: "утопічний", ar: "طوباوي", ka: "უტოპიური", fr: "utopique" },
  { level: "C1", es: "venal", en: "venal", uk: "продажний", ar: "مرتش", ka: "მექრთამე", fr: "vénal" },
  { level: "C1", es: "zarandear", en: "shake", uk: "трусити", ar: "هز", ka: "შერხევა", fr: "secouer" },
  { level: "C1", es: "aberración", en: "aberration", uk: "аберація", ar: "انحراف", ka: "გადახრა", fr: "aberration" },
  { level: "C1", es: "bisoño", en: "inexperienced", uk: "недосвідчений", ar: "مبتدئ", ka: "გამოუცდელი", fr: "novice" },
  { level: "C1", es: "cálido", en: "warm", uk: "теплий", ar: "داافئ", ka: "თბილი", fr: "chaleureux" },
  { level: "C1", es: "debacle", en: "debacle", uk: "крах", ar: "انهيار", ka: "კრახი", fr: "débâcle" },
  { level: "C1", es: "frivolidad", en: "frivolity", uk: "легковажність", ar: "سطحية", ka: "ზედაპირულობა", fr: "frivolité" },
  { level: "C1", es: "germen", en: "germ", uk: "зародок", ar: "جرثومة", ka: "ჩანსახი", fr: "germe" },
  { level: "C1", es: "huraño", en: "reclusive", uk: "нелюдимий", ar: "منعزل", ka: "ჩაკეტილი", fr: "sauvage" },
  { level: "C1", es: "imbecilidad", en: "imbecility", uk: "дебільність", ar: "بلاهة", ka: "სულელობა", fr: "imbécillité" },
  { level: "C1", es: "jauja", en: "landofplenty", uk: "земляобітована", ar: "فردوس", ka: "სამოთხე", fr: "cocagne" },
  { level: "C1", es: "lacerante", en: "lacerating", uk: "пекучий", ar: "جارح", ka: "მტკივნეული", fr: "lacerant" },
  { level: "C1", es: "magno", en: "grand", uk: "величний", ar: "عظيم", ka: "დიდებული", fr: "magnifique" },
  { level: "C1", es: "necropsia", en: "autopsy", uk: "розтин", ar: "تشريح", ka: "გაკვეთა", fr: "autopsie", category: "medicine" },
  { level: "C1", es: "preámbulo", en: "preamble", uk: "преамбула", ar: "ديباجة", ka: "შესავალი", fr: "préambule" },
  { level: "C1", es: "quid", en: "core", uk: "суть", ar: "جوهر", ka: "არსი", fr: "noyau" },
  { level: "C1", es: "resquicio", en: "chink", uk: "щілина", ar: "شق", ka: "ნაპრალი", fr: "fissure" },
  { level: "C1", es: "superfluo", en: "superfluous", uk: "зайвий", ar: "زائد", ka: "ზედმეტი", fr: "superflu" },
  { level: "C1", es: "tortuoso", en: "tortuous", uk: "звивистий", ar: "متعرج", ka: "დახვეული", fr: "tortueux" },
  { level: "C1", es: "uver", en: "usher", uk: "супроводжувати", ar: "رافق", ka: "მიყოლა", fr: "escorter" },
  { level: "C1", es: "vanagloria", en: "vainglory", uk: "марнославство", ar: "غرور", ka: "ამპარტავნება", fr: "vaine" },
  { level: "C1", es: "xenofobia", en: "xenophobia", uk: "ксенофобія", ar: "رهابالأجانب", ka: "ქსენოფობია", fr: "xénophobie" },
  { level: "C1", es: "yacer", en: "lie", uk: "лежати", ar: "رقد", ka: "წოლა", fr: "gésir" },
  { level: "C1", es: "zaborra", en: "dregs", uk: "осад", ar: "رواسب", ka: "ნალექი", fr: "résidu" },
  { level: "C1", es: "apogeo", en: "apogee", uk: "апогей", ar: "أوج", ka: "აპოგეი", fr: "apogée" },
  { level: "C1", es: "barbarie", en: "barbarism", uk: "варварство", ar: "همجية", ka: "ვარვარობა", fr: "barbarie" },
  { level: "C1", es: "cúspide", en: "summit", uk: "вершина", ar: "قمة", ka: "მწვერვალი", fr: "sommet" },
  { level: "C1", es: "disenso", en: "dissent", uk: "незгода", ar: "خلاف", ka: "უთანხმოება", fr: "dissentiment" },
  { level: "C1", es: "fiasco", en: "fiasco", uk: "фіаско", ar: "إخفاق", ka: "ფიასკო", fr: "fiasco" },
  { level: "C1", es: "genocidio", en: "genocide", uk: "геноцид", ar: "إبادة", ka: "გენოციდი", fr: "génocide" },
  { level: "C1", es: "hiperbole", en: "hyperbole", uk: "гіпербола", ar: "مبالغة", ka: "ჰიპერბოლა", fr: "hyperbole" },
  { level: "C1", es: "inercia", en: "inertia", uk: "інерція", ar: "قصور", ka: "ინერცია", fr: "inertie" },
  { level: "C1", es: "juicio", en: "trial", uk: "суд", ar: "محاكمة", ka: "სასამართლო", fr: "procès" },
  { level: "C1", es: "laconismo", en: "laconism", uk: "лаконічність", ar: "إيجاز", ka: "ლაკონიზმი", fr: "laconisme" },
  { level: "C1", es: "magisterio", en: "teaching", uk: "вчительство", ar: "تعليم", ka: "სწავლება", fr: "magistère", category: "education" },
  { level: "C1", es: "nefario", en: "nefarious", uk: "лиходійський", ar: "شنيع", ka: "ბოროტი", fr: "criminel" },
  { level: "C1", es: "oráculo", en: "oracle", uk: "оракул", ar: "وحي", ka: "ორაკული", fr: "oracle" },
  { level: "C1", es: "prerrogativa", en: "prerogative", uk: "прерогатива", ar: "امتياز", ka: "პრივილეგია", fr: "prérogative" },
  { level: "C1", es: "abastecimiento", en: "supply", uk: "постачання", ar: "تزويد", ka: "მომარაგება", fr: "approvisionnement" },
  { level: "C1", es: "aplazamiento", en: "postponement", uk: "відстрочка", ar: "تأجيل", ka: "გადადება", fr: "ajournement" },
  { level: "C1", es: "arrendamiento", en: "lease", uk: "оренда", ar: "إيجار", ka: "იჯარა", fr: "bail" },
  { level: "C1", es: "auge", en: "boom", uk: "підйом", ar: "ازدهار", ka: "აღმავლობა", fr: "essor" },
  { level: "C1", es: "coalición", en: "coalition", uk: "коаліція", ar: "ائتلاف", ka: "კოალიცია", fr: "coalition", category: "work" },
  { level: "C1", es: "cobertura", en: "coverage", uk: "покриття", ar: "تغطية", ka: "დაფარვა", fr: "couverture", category: "work" },
  { level: "C1", es: "desacato", en: "contempt", uk: "неповага", ar: "ازدراء", ka: "უპატივცემულობა", fr: "outrage" },
  { level: "C1", es: "efectividad", en: "effectiveness", uk: "ефективність", ar: "فعالية", ka: "ეფექტურობა", fr: "efficacité", category: "work" },
  { level: "C1", es: "escrutinio", en: "scrutiny", uk: "перевірка", ar: "تدقيق", ka: "შემოწმება", fr: "examen" },
  { level: "C1", es: "esbozo", en: "outline", uk: "нарис", ar: "مسودة", ka: "მონახაზი", fr: "esquisse" },
  { level: "C1", es: "eslabón", en: "link", uk: "ланка", ar: "حلقة", ka: "რგოლი", fr: "maillon" },
  { level: "C1", es: "estigma", en: "stigma", uk: "клеймо", ar: "وصمة", ka: "სტიგმა", fr: "stigmate" },
  { level: "C1", es: "faceta", en: "facet", uk: "грань", ar: "جانب", ka: "წახნაგი", fr: "facette" },
  { level: "C1", es: "gestión", en: "management", uk: "управління", ar: "إدارة", ka: "მართვა", fr: "gestion", category: "work" },
  { level: "C1", es: "hincapié", en: "emphasis", uk: "наголос", ar: "تأكيد", ka: "ხაზგასმა", fr: "insistance" },
  { level: "C1", es: "imperativo", en: "imperative", uk: "імператив", ar: "حتمية", ka: "იმპერატივი", fr: "impératif" },
  { level: "C1", es: "incentivo", en: "incentive", uk: "стимул", ar: "حافز", ka: "სტიმული", fr: "incitation", category: "work" },
  { level: "C1", es: "indicio", en: "clue", uk: "ознака", ar: "دليل", ka: "ნიშანი", fr: "indice" },
  { level: "C1", es: "injerto", en: "graft", uk: "трансплантат", ar: "تطعيم", ka: "ნამყენი", fr: "greffe" },
  { level: "C1", es: "lucro", en: "profit", uk: "прибуток", ar: "ربح", ka: "მოგება", fr: "lucre" },
  { level: "C1", es: "marginación", en: "marginalization", uk: "маргіналізація", ar: "تهميش", ka: "მარგინალიზაცია", fr: "marginalisation" },
  { level: "C1", es: "moratoria", en: "moratorium", uk: "мораторій", ar: "تجميد", ka: "მორატორიუმი", fr: "moratoire", category: "work" },
  { level: "C1", es: "normativa", en: "regulation", uk: "норматив", ar: "لائحة", ka: "ნორმატივი", fr: "réglementation" },
  { level: "C1", es: "noción", en: "notion", uk: "поняття", ar: "مفهوم", ka: "ცნება", fr: "notion" },
  { level: "C1", es: "omisión", en: "omission", uk: "упущення", ar: "إغفال", ka: "გამოტოვება", fr: "omission" },
  { level: "C1", es: "patrón", en: "pattern", uk: "шаблон", ar: "نمط", ka: "შაბლონი", fr: "motif" },
  { level: "C1", es: "pauta", en: "guideline", uk: "орієнтир", ar: "معيار", ka: "მითითება", fr: "directive" },
  { level: "C1", es: "postulado", en: "postulate", uk: "постулат", ar: "مسلمة", ka: "პოსტულატი", fr: "postulat", category: "education" },
  { level: "C1", es: "quórum", en: "quorum", uk: "кворум", ar: "نصاب", ka: "ქვორუმი", fr: "quorum" },
  { level: "C1", es: "represalia", en: "retaliation", uk: "відплата", ar: "انتقام", ka: "შურისძიება", fr: "représaille" },
  { level: "C1", es: "respaldo", en: "backing", uk: "підтримка", ar: "دعم", ka: "მხარდაჭერა", fr: "appui" },
  { level: "C1", es: "subvención", en: "subsidy", uk: "субсидія", ar: "إعانة", ka: "სუბსიდია", fr: "subvention", category: "work" },
  { level: "C1", es: "tasa", en: "rate", uk: "ставка", ar: "معدل", ka: "განაკვეთი", fr: "taux" },
  { level: "C1", es: "umbral", en: "threshold", uk: "поріг", ar: "عتبة", ka: "ზღურბლი", fr: "seuil" },
  { level: "C1", es: "viabilidad", en: "feasibility", uk: "здійсненність", ar: "جدوى", ka: "განხორციელებადობა", fr: "faisabilité" },
  { level: "C1", es: "escatimar", en: "to skimp", uk: "скупитися", ar: "يبخل", ka: "ძუნწობა", fr: "lésiner" },
  { level: "C1", es: "vulnerar", en: "to infringe", uk: "порушувати", ar: "ينتهك", ka: "დარღვევა", fr: "enfreindre" },
  { level: "C1", es: "mitigar", en: "to mitigate", uk: "полегшувати", ar: "يخفف", ka: "შერბილება", fr: "atténuer" },
  { level: "C1", es: "prescindir", en: "to dispense", uk: "обходитися", ar: "يستغني", ka: "უგულებელყოფა", fr: "se passer" },
  { level: "C1", es: "corroborar", en: "to corroborate", uk: "підтверджувати", ar: "يؤكد", ka: "დადასტურება", fr: "corroborer" },
  { level: "C1", es: "subsanar", en: "to rectify", uk: "виправляти", ar: "يصحح", ka: "გამოსწორება", fr: "rectifier" },
  { level: "C1", es: "imputar", en: "to impute", uk: "інкримінувати", ar: "ينسب", ka: "ბრალდება", fr: "imputer" },
  { level: "C1", es: "dilucidar", en: "to elucidate", uk: "роз'яснювати", ar: "يوضح", ka: "გარკვევა", fr: "élucider" },
  { level: "C1", es: "exacerbar", en: "to exacerbate", uk: "загострювати", ar: "يفاقم", ka: "გამწვავება", fr: "exacerber" },
  { level: "C1", es: "mermar", en: "to deplete", uk: "виснажувати", ar: "يستنزف", ka: "შემცირება", fr: "épuiser" },
  { level: "C1", es: "dirimir", en: "to resolve", uk: "вирішувати", ar: "يسوي", ka: "გადაწყვეტა", fr: "résoudre" },
  { level: "C1", es: "soslayar", en: "to bypass", uk: "оминати", ar: "يتجنب", ka: "გვერდის ავლა", fr: "contourner" },
  { level: "C1", es: "reanudar", en: "to resume", uk: "відновлювати", ar: "يستأنف", ka: "განახლება", fr: "reprendre" },
  { level: "C1", es: "sucumbir", en: "to succumb", uk: "піддаватися", ar: "يخضع", ka: "დანებება", fr: "succomber" },
  { level: "C1", es: "acaparar", en: "to monopolize", uk: "монополізувати", ar: "يحتكر", ka: "მონოპოლიზება", fr: "accaparer" },
  { level: "C1", es: "infundir", en: "to instill", uk: "навіювати", ar: "يغرس", ka: "შთაგონება", fr: "inculquer" },
  { level: "C1", es: "propugnar", en: "to advocate", uk: "відстоювати", ar: "يدافع", ka: "დაცვა", fr: "prôner" },
  { level: "C1", es: "repercutir", en: "to reverberate", uk: "відбиватися", ar: "ينعكس", ka: "ასახვა", fr: "répercuter" },
  { level: "C1", es: "amainar", en: "to subside", uk: "стихати", ar: "يهدأ", ka: "ჩადგომა", fr: "s'apaiser" },
  { level: "C1", es: "argüir", en: "to argue", uk: "аргументувати", ar: "يجادل", ka: "არგუმენტირება", fr: "arguer" },
  { level: "C1", es: "discernir", en: "to discern", uk: "розрізняти", ar: "يميز", ka: "გარჩევა", fr: "discerner" },
  { level: "C1", es: "coartar", en: "to restrict", uk: "обмежувати", ar: "يقيد", ka: "შეზღუდვა", fr: "restreindre" },
  { level: "C1", es: "erradicar", en: "to eradicate", uk: "викорінювати", ar: "يستأصل", ka: "აღმოფხვრა", fr: "éradiquer" },
  { level: "C1", es: "proliferar", en: "to proliferate", uk: "розростатися", ar: "يتكاثر", ka: "გამრავლება", fr: "proliférer" },
  { level: "C1", es: "menoscabar", en: "to undermine", uk: "підривати", ar: "يقوض", ka: "შელახვა", fr: "miner" },
  { level: "C1", es: "indagar", en: "to inquire", uk: "розслідувати", ar: "يحقق", ka: "გამოძიება", fr: "enquêter" },
  { level: "C1", es: "eximir", en: "to exempt", uk: "звільняти", ar: "يعفي", ka: "განთავისუფლება", fr: "exempter" },
  { level: "C1", es: "desvincular", en: "to detach", uk: "відділяти", ar: "يفصل", ka: "გამოყოფა", fr: "détacher" },
  { level: "C1", es: "optimizar", en: "to optimize", uk: "оптимізувати", ar: "يحسن", ka: "ოპტიმიზაცია", fr: "optimiser" },
  { level: "C1", es: "acentuar", en: "to accentuate", uk: "акцентувати", ar: "يبرز", ka: "გამოკვეთა", fr: "accentuer" },
  { level: "C1", es: "eludir", en: "to evade", uk: "ухилятися", ar: "يتهرب", ka: "არიდება", fr: "éluder" },
  { level: "C1", es: "perjudicial", en: "detrimental", uk: "згубний", ar: "ضار", ka: "საზიანო", fr: "préjudiciable" },
  { level: "C1", es: "ineludible", en: "unavoidable", uk: "неминучий", ar: "حتمي", ka: "გარდაუვალი", fr: "incontournable" },
  { level: "C1", es: "recíproco", en: "reciprocal", uk: "взаємний", ar: "متبادل", ka: "ორმხრივი", fr: "réciproque" },
  { level: "C1", es: "vigente", en: "valid", uk: "чинний", ar: "ساري", ka: "მოქმედი", fr: "applicable" },
  { level: "C1", es: "factible", en: "feasible", uk: "здійсненний", ar: "قابل للتنفيذ", ka: "შესაძლებელი", fr: "faisable" },
  { level: "C1", es: "incipiente", en: "incipient", uk: "початковий", ar: "ناشئ", ka: "საწყისი", fr: "naissant" },
  { level: "C1", es: "paulatino", en: "gradual", uk: "поступовий", ar: "تدريجي", ka: "თანდათანობითი", fr: "progressif" },
  { level: "C1", es: "profuso", en: "profuse", uk: "рясний", ar: "غزير", ka: "უხვი", fr: "profus" },
  { level: "C1", es: "reacio", en: "reluctant", uk: "неохочий", ar: "ممانع", ka: "მორიდებული", fr: "réticent" },
  { level: "C1", es: "redundante", en: "redundant", uk: "надлишковий", ar: "فائض", ka: "ჭარბი", fr: "redondant" },
  { level: "C1", es: "rezagado", en: "lagging", uk: "відстаючий", ar: "متخلف", ka: "ჩამორჩენილი", fr: "retardataire" },
  { level: "C1", es: "somero", en: "superficial", uk: "поверховий", ar: "سطحي", ka: "ზედაპირული", fr: "sommaire" },
  { level: "C1", es: "unánime", en: "unanimous", uk: "одностайний", ar: "إجماعي", ka: "ერთსულოვანი", fr: "unanime" },
  { level: "C1", es: "vulnerable", en: "vulnerable", uk: "незахищений", ar: "عرضة للخطر", ka: "მოწყვლადი", fr: "vulnérable" },
  { level: "C1", es: "esporádico", en: "sporadic", uk: "спорадичний", ar: "متقطع", ka: "სპორადული", fr: "sporadique" },
  { level: "C1", es: "imperecedero", en: "imperishable", uk: "нетлінний", ar: "خالد", ka: "უხრწნელი", fr: "impérissable" },
  // ---- C2 ----
  { level: "C2", es: "abstruso", en: "abstruse", uk: "туманний", ar: "مبهم", ka: "ბუნდოვანი", fr: "abstrus" },
  { level: "C2", es: "recóndito", en: "hidden", uk: "прихований", ar: "خفي", ka: "დაფარული", fr: "caché" },
  { level: "C2", es: "quimérico", en: "fanciful", uk: "химерний", ar: "خيالي", ka: "ილუზორული", fr: "chimérique" },
  { level: "C2", es: "lánguido", en: "languid", uk: "млявий", ar: "فاتر", ka: "მოდუნებული", fr: "langoureux" },
  { level: "C2", es: "lúgubre", en: "gloomy", uk: "похмурий", ar: "كئيب", ka: "პირქუში", fr: "lugubre" },
  { level: "C2", es: "pétreo", en: "stony", uk: "кам'яний", ar: "حجري", ka: "ქვისებრი", fr: "pierreux" },
  { level: "C2", es: "impávido", en: "fearless", uk: "безстрашний", ar: "جسور", ka: "შეუშინებელი", fr: "intrépide" },
  { level: "C2", es: "inefable", en: "ineffable", uk: "невимовний", ar: "لا يوصف", ka: "გამოუთქმელი", fr: "ineffable" },
  { level: "C2", es: "longevo", en: "long-lived", uk: "довговічний", ar: "طويل العمر", ka: "დღეგრძელი", fr: "vivace" },
  { level: "C2", es: "fatuo", en: "fatuous", uk: "пихатий", ar: "مغرور", ka: "ამპარტავანი", fr: "fat" },
  { level: "C2", es: "pusilánime", en: "fainthearted", uk: "боязкий", ar: "جبان", ka: "მშიშარა", fr: "pusillanime" },
  { level: "C2", es: "vetusto", en: "antiquated", uk: "старезний", ar: "عتيق", ka: "ძველისძველი", fr: "vétuste" },
  { level: "C2", es: "acérrimo", en: "staunch", uk: "запеклий", ar: "شرس", ka: "მგზნებარე", fr: "acharné" },
  { level: "C2", es: "ecuánime", en: "even-tempered", uk: "врівноважений", ar: "متزن", ka: "დაბალანსებული", fr: "pondéré" },
  { level: "C2", es: "díscolo", en: "unruly", uk: "непокірний", ar: "متمرد", ka: "ურჩი", fr: "indocile" },
  { level: "C2", es: "exánime", en: "lifeless", uk: "бездиханний", ar: "بلا حياة", ka: "უსულო", fr: "inanimé" },
  { level: "C2", es: "quimera", en: "chimera", uk: "химера", ar: "وهم", ka: "ქიმერა", fr: "chimère" },
  { level: "C2", es: "ápice", en: "apex", uk: "вершина", ar: "ذروة", ka: "მწვერვალი", fr: "apogée" },
  { level: "C2", es: "vorágine", en: "maelstrom", uk: "вир", ar: "دوامة", ka: "მორევი", fr: "tourbillon" },
  { level: "C2", es: "epifanía", en: "epiphany", uk: "прозріння", ar: "تجلٍّ", ka: "გამოცხადება", fr: "épiphanie" },
  { level: "C2", es: "abismo", en: "abyss", uk: "безодня", ar: "هاوية", ka: "უფსკრული", fr: "abîme" },
  { level: "C2", es: "penumbra", en: "penumbra", uk: "напівтемрява", ar: "شبه ظلام", ka: "ნახევარბნელი", fr: "pénombre" },
  { level: "C2", es: "vislumbre", en: "glimpse", uk: "проблиск", ar: "لمحة", ka: "ციმციმი", fr: "lueur" },
  { level: "C2", es: "añoranza", en: "longing", uk: "туга", ar: "شوق", ka: "სევდა", fr: "mélancolie" },
  { level: "C2", es: "nostalgia", en: "nostalgia", uk: "ностальгія", ar: "حنين", ka: "ნოსტალგია", fr: "nostalgie" },
  { level: "C2", es: "desazón", en: "unease", uk: "тривога", ar: "انزعاج", ka: "წუხილი", fr: "malaise" },
  { level: "C2", es: "desasosiego", en: "restlessness", uk: "неспокій", ar: "قلق", ka: "მოუსვენრობა", fr: "agitation" },
  { level: "C2", es: "congoja", en: "anguish", uk: "страждання", ar: "كرب", ka: "ტანჯვა", fr: "angoisse" },
  { level: "C2", es: "desconsuelo", en: "desolation", uk: "відчай", ar: "يأس", ka: "სასოწარკვეთა", fr: "désolation" },
  { level: "C2", es: "desidia", en: "negligence", uk: "недбалість", ar: "إهمال", ka: "დაუდევრობა", fr: "négligence" },
  { level: "C2", es: "indolencia", en: "indolence", uk: "лінощі", ar: "كسل", ka: "ზარმაცობა", fr: "indolence" },
  { level: "C2", es: "parsimonia", en: "calmness", uk: "неквапливість", ar: "أناة", ka: "სიმშვიდე", fr: "flegme" },
  { level: "C2", es: "sosiego", en: "tranquility", uk: "спокій", ar: "سكينة", ka: "სიწყნარე", fr: "quiétude" },
  { level: "C2", es: "algarabía", en: "hubbub", uk: "галас", ar: "ضجيج", ka: "ხმაური", fr: "vacarme" },
  { level: "C2", es: "bullicio", en: "bustle", uk: "метушня", ar: "صخب", ka: "აურზაური", fr: "brouhaha" },
  { level: "C2", es: "estruendo", en: "roar", uk: "гуркіт", ar: "دوي", ka: "გრიალი", fr: "fracas" },
  { level: "C2", es: "quietud", en: "stillness", uk: "тиша", ar: "سكون", ka: "სიჩუმე", fr: "immobilité" },
  { level: "C2", es: "languidez", en: "languor", uk: "млявість", ar: "فتور", ka: "მოდუნება", fr: "langueur" },
  { level: "C2", es: "exuberancia", en: "exuberance", uk: "пишність", ar: "فيض", ka: "აყვავება", fr: "exubérance" },
  { level: "C2", es: "desmesura", en: "excess", uk: "надмірність", ar: "إفراط", ka: "გადამეტება", fr: "démesure" },
  { level: "C2", es: "desenfreno", en: "abandon", uk: "нестримність", ar: "انفلات", ka: "თავშეუკავებლობა", fr: "débordement" },
  { level: "C2", es: "templanza", en: "temperance", uk: "поміркованість", ar: "اعتدال", ka: "თავშეკავება", fr: "tempérance" },
  { level: "C2", es: "sobriedad", en: "sobriety", uk: "тверезість", ar: "رزانة", ka: "სიფხიზლე", fr: "sobriété" },
  { level: "C2", es: "suntuosidad", en: "sumptuousness", uk: "пишнота", ar: "فخامة", ka: "ბრწყინვალება", fr: "somptuosité" },
  { level: "C2", es: "ostentación", en: "ostentation", uk: "хизування", ar: "استعراض", ka: "მოჩვენებითობა", fr: "ostentation" },
  { level: "C2", es: "opulencia", en: "opulence", uk: "розкіш", ar: "بذخ", ka: "ფუფუნება", fr: "opulence" },
  { level: "C2", es: "escasez", en: "scarcity", uk: "нестача", ar: "ندرة", ka: "სიმცირე", fr: "pénurie" },
  { level: "C2", es: "penuria", en: "penury", uk: "злидні", ar: "عوز", ka: "გაჭირვება", fr: "dénuement" },
  { level: "C2", es: "abundancia", en: "abundance", uk: "достаток", ar: "وفرة", ka: "სიმრავლე", fr: "abondance" },
  { level: "C2", es: "parquedad", en: "frugality", uk: "стриманість", ar: "شح", ka: "ეკონომიურობა", fr: "parcimonie" },
  { level: "C2", es: "clemencia", en: "clemency", uk: "милосердя", ar: "رحمة", ka: "წყალობა", fr: "clémence" },
  { level: "C2", es: "indulgencia", en: "indulgence", uk: "поблажливість", ar: "تسامح", ka: "შემწყნარებლობა", fr: "indulgence" },
  { level: "C2", es: "severidad", en: "severity", uk: "суворість", ar: "صرامة", ka: "სიმკაცრე", fr: "sévérité" },
  { level: "C2", es: "rigidez", en: "rigidity", uk: "жорсткість", ar: "جمود", ka: "სიმტკიცე", fr: "rigidité" },
  { level: "C2", es: "flaqueza", en: "frailty", uk: "слабкість", ar: "ضعف", ka: "სისუსტე", fr: "faiblesse" },
  { level: "C2", es: "entereza", en: "fortitude", uk: "витримка", ar: "صمود", ka: "მედგრობა", fr: "fermeté" },
  { level: "C2", es: "ocaso", en: "sunset", uk: "захід", ar: "غروب", ka: "დაისი", fr: "couchant" },
  { level: "C2", es: "alba", en: "dawn", uk: "світанок", ar: "فجر", ka: "გარიჟრაჟი", fr: "aube" },
  { level: "C2", es: "crepúsculo", en: "twilight", uk: "сутінки", ar: "شفق", ka: "ბინდი", fr: "crépuscule" },
  { level: "C2", es: "bruma", en: "mist", uk: "імла", ar: "ضباب", ka: "ნისლი", fr: "brume" },
  { level: "C2", es: "rocío", en: "dew", uk: "роса", ar: "ندى", ka: "ცვარი", fr: "rosée" },
  { level: "C2", es: "escarcha", en: "frost", uk: "іній", ar: "صقيع", ka: "ჭირხლი", fr: "givre" },
  { level: "C2", es: "tempestad", en: "tempest", uk: "негода", ar: "زوبعة", ka: "შტორმი", fr: "orage" },
  { level: "C2", es: "torbellino", en: "whirlwind", uk: "вихор", ar: "إعصار", ka: "გრიგალი", fr: "tornade" },
  { level: "C2", es: "ráfaga", en: "gust", uk: "порив", ar: "هبة ريح", ka: "მოქროლვა", fr: "rafale" },
  { level: "C2", es: "oleaje", en: "swell", uk: "хвилювання", ar: "تموج", ka: "ტალღოვანება", fr: "houle" },
  { level: "C2", es: "marea", en: "tide", uk: "приплив", ar: "مد", ka: "მოქცევა", fr: "marée" },
  { level: "C2", es: "inmensidad", en: "immensity", uk: "безмежність", ar: "شساعة", ka: "უსაზღვროობა", fr: "immensité" },
  { level: "C2", es: "eternidad", en: "eternity", uk: "вічність", ar: "أبدية", ka: "მარადისობა", fr: "éternité" },
  { level: "C2", es: "instante", en: "instant", uk: "мить", ar: "لحظة", ka: "წამი", fr: "instant" },
  { level: "C2", es: "transitoriedad", en: "transience", uk: "минущість", ar: "زوال", ka: "წარმავლობა", fr: "fugacité" },
  { level: "C2", es: "finitud", en: "finitude", uk: "скінченність", ar: "محدودية", ka: "სასრულობა", fr: "finitude" },
  { level: "C2", es: "infinitud", en: "infinity", uk: "нескінченність", ar: "لانهاية", ka: "უსასრულობა", fr: "infinité" },
  { level: "C2", es: "vacuidad", en: "vacuity", uk: "порожнеча", ar: "فراغ", ka: "სიცარიელე", fr: "vacuité" },
  { level: "C2", es: "plenitud", en: "plenitude", uk: "повнота", ar: "اكتمال", ka: "სისრულე", fr: "plénitude" },
  { level: "C2", es: "desolación", en: "devastation", uk: "спустошення", ar: "خراب", ka: "გავერანება", fr: "dévastation" },
  { level: "C2", es: "soledad", en: "solitude", uk: "самотність", ar: "وحدة", ka: "მარტოობა", fr: "solitude" },
  { level: "C2", es: "reclusión", en: "seclusion", uk: "усамітнення", ar: "عزلة", ka: "განმარტოება", fr: "réclusion" },
  { level: "C2", es: "destierro", en: "banishment", uk: "вигнання", ar: "نفي", ka: "გადასახლება", fr: "bannissement" },
  { level: "C2", es: "exilio", en: "exile", uk: "заслання", ar: "منفى", ka: "გაძევება", fr: "exil" },
  { level: "C2", es: "peregrinaje", en: "pilgrimage", uk: "паломництво", ar: "حج", ka: "მომლოცველობა", fr: "pèlerinage", category: "travel" },
  { level: "C2", es: "travesía", en: "crossing", uk: "подорож", ar: "عبور", ka: "მოგზაურობა", fr: "traversée", category: "travel" },
  { level: "C2", es: "odisea", en: "odyssey", uk: "одіссея", ar: "أوديسة", ka: "ოდისეა", fr: "odyssée", category: "travel" },
  { level: "C2", es: "epopeya", en: "epic", uk: "епопея", ar: "ملحمة", ka: "ეპოპეა", fr: "épopée" },
  { level: "C2", es: "gesta", en: "heroic deed", uk: "діяння", ar: "مأثرة", ka: "გმირული საქმე", fr: "geste" },
  { level: "C2", es: "hazaña", en: "feat", uk: "подвиг", ar: "بطولة", ka: "გმირობა", fr: "exploit" },
  { level: "C2", es: "proeza", en: "prowess", uk: "звитяга", ar: "براعة", ka: "სიმარჯვე", fr: "prouesse" },
  { level: "C2", es: "heroicidad", en: "heroism", uk: "героїзм", ar: "شهامة", ka: "გმირული ხასიათი", fr: "héroïsme" },
  { level: "C2", es: "cobardía", en: "cowardice", uk: "боягузтво", ar: "جبن", ka: "სიმხდალე", fr: "lâcheté" },
  { level: "C2", es: "villanía", en: "villainy", uk: "підлість", ar: "خسة", ka: "სისაძაგლე", fr: "vilenie" },
  { level: "C2", es: "infamia", en: "infamy", uk: "ганьба", ar: "شنار", ka: "სირცხვილი", fr: "infamie" },
  { level: "C2", es: "ignominia", en: "ignominy", uk: "неслава", ar: "فضيحة", ka: "შერცხვენა", fr: "ignominie" },
  { level: "C2", es: "deshonra", en: "dishonor", uk: "безчестя", ar: "عار", ka: "უპატივცემულობა", fr: "déshonneur" },
  { level: "C2", es: "redención", en: "redemption", uk: "відкуплення", ar: "فداء", ka: "გამოსყიდვა", fr: "rédemption" },
  { level: "C2", es: "expiación", en: "atonement", uk: "спокута", ar: "تكفير", ka: "შენანება", fr: "expiation" },
  { level: "C2", es: "absolución", en: "absolution", uk: "відпущення", ar: "غفران", ka: "შენდობა", fr: "absolution" },
  { level: "C2", es: "condena", en: "condemnation", uk: "засудження", ar: "إدانة", ka: "მსჯავრდება", fr: "condamnation" },
  { level: "C2", es: "castigo", en: "punishment", uk: "покарання", ar: "عقاب", ka: "სასჯელი", fr: "punition" },
  { level: "C2", es: "venganza", en: "revenge", uk: "помста", ar: "انتقام", ka: "შურისძიება", fr: "vengeance" },
  { level: "C2", es: "rencor", en: "resentment", uk: "злоба", ar: "ضغينة", ka: "წყენა", fr: "rancune" },
  { level: "C2", es: "desdén", en: "disdain", uk: "зневага", ar: "ازدراء", ka: "ზიზღი", fr: "dédain" },
  { level: "C2", es: "desprecio", en: "contempt", uk: "презирство", ar: "احتقار", ka: "მოძულება", fr: "mépris" },
  { level: "C2", es: "reverencia", en: "reverence", uk: "благоговіння", ar: "إجلال", ka: "მოწიწება", fr: "révérence" },
  { level: "C2", es: "veneración", en: "veneration", uk: "поклоніння", ar: "تبجيل", ka: "თაყვანისცემა", fr: "vénération" },
  { level: "C2", es: "devoción", en: "devotion", uk: "відданість", ar: "تفانٍ", ka: "ერთგულება", fr: "dévotion" },
  { level: "C2", es: "fervor", en: "fervor", uk: "запал", ar: "حماس", ka: "მხურვალება", fr: "ferveur" },
  { level: "C2", es: "máxime", en: "especially", uk: "особливо", ar: "لا سيما", ka: "განსაკუთრებით", fr: "surtout" },
  { level: "C2", es: "entrambos", en: "both", uk: "обидва", ar: "كلاهما", ka: "ორივე", fr: "tous deux" },
  { level: "C2", es: "sendos", en: "respective", uk: "відповідні", ar: "لكل منهما", ka: "თითო-თითო", fr: "respectifs" },
  { level: "C2", es: "antaño", en: "in days gone by", uk: "колись давно", ar: "في الماضي البعيد", ka: "წარსულში", fr: "jadis" },
  { level: "C2", es: "hogaño", en: "nowadays", uk: "нині", ar: "في هذا الزمان", ka: "დღეს-დღეობით", fr: "de nos jours" },
  { level: "C2", es: "nadita", en: "not at all", uk: "анітрохи", ar: "على الإطلاق", ka: "სულაც არა", fr: "pas du tout" },
  { level: "A2", es: "castillo", en: "castle", uk: "замок", ar: "قلعة", ka: "ციხე", fr: "château" },
  { level: "A2", es: "palacio", en: "palace", uk: "палац", ar: "قصر", ka: "სასახლე", fr: "palais" },
  { level: "A2", es: "torre", en: "tower", uk: "вежа", ar: "برج", ka: "კოშკი", fr: "tour" },
  { level: "B1", es: "muralla", en: "city wall", uk: "фортечна стіна", ar: "سور", ka: "გალავანი", fr: "rempart" },
  { level: "B1", es: "foso", en: "moat", uk: "рів", ar: "خندق", ka: "თხრილი", fr: "fossé" },
  { level: "A2", es: "refugio", en: "shelter", uk: "притулок", ar: "ملجأ", ka: "თავშესაფარი", fr: "refuge" },
  { level: "B1", es: "choza", en: "hut", uk: "хатина", ar: "كوخ", ka: "ქოხი", fr: "hutte" },
  { level: "B1", es: "cúpula", en: "dome", uk: "купол", ar: "قبة", ka: "გუმბათი", fr: "dôme" },
  { level: "B1", es: "fachada", en: "facade", uk: "фасад", ar: "واجهة", ka: "ფასადი", fr: "façade" },
  { level: "A2", es: "sótano", en: "basement", uk: "підвал", ar: "قبو", ka: "სარდაფი", fr: "sous-sol" },
  { level: "A2", es: "ático", en: "attic", uk: "горище", ar: "عليّة", ka: "სხვენი", fr: "grenier" },
  { level: "A1", es: "garaje", en: "garage", uk: "гараж", ar: "مرآب", ka: "გარაჟი", fr: "garage" },
  { level: "A2", es: "chimenea", en: "chimney", uk: "димар", ar: "مدخنة", ka: "ბუხარი", fr: "cheminée" },
  { level: "A2", es: "cojín", en: "cushion", uk: "подушка", ar: "وسادة", ka: "ბალიში", fr: "coussin" },
  { level: "A1", es: "sábana", en: "bedsheet", uk: "простирадло", ar: "ملاءة", ka: "ზეწარი", fr: "drap" },
  { level: "A1", es: "manta", en: "blanket", uk: "ковдра", ar: "بطانية", ka: "საბანი", fr: "couverture" },
  { level: "A2", es: "aguja", en: "needle", uk: "голка", ar: "إبرة", ka: "ნემსი", fr: "aiguille" },
  { level: "A2", es: "hilo", en: "thread", uk: "нитка", ar: "خيط", ka: "ძაფი", fr: "fil" },
  { level: "B1", es: "tejido", en: "fabric", uk: "тканина", ar: "نسيج", ka: "ქსოვილი", fr: "tissu" },
  { level: "A2", es: "lana", en: "wool", uk: "вовна", ar: "صوف", ka: "მატყლი", fr: "laine" },
  { level: "A2", es: "algodón", en: "cotton", uk: "бавовна", ar: "قطن", ka: "ბამბა", fr: "coton" },
  { level: "B1", es: "seda", en: "silk", uk: "шовк", ar: "حرير", ka: "აბრეშუმი", fr: "soie" },
  { level: "A2", es: "cuero", en: "leather", uk: "шкіра", ar: "جلد", ka: "ტყავი", fr: "cuir" },
  { level: "A2", es: "metal", en: "metal", uk: "метал", ar: "معدن", ka: "ლითონი", fr: "métal" },
  { level: "A2", es: "hierro", en: "iron", uk: "залізо", ar: "حديد", ka: "რკინა", fr: "fer" },
  { level: "B1", es: "acero", en: "steel", uk: "сталь", ar: "فولاذ", ka: "ფოლადი", fr: "acier" },
  { level: "B1", es: "cobre", en: "copper", uk: "мідь", ar: "نحاس", ka: "სპილენძი", fr: "cuivre" },
  { level: "A1", es: "oro", en: "gold", uk: "золото", ar: "ذهب", ka: "ოქრო", fr: "or" },
  { level: "A1", es: "plata", en: "silver", uk: "срібло", ar: "فضة", ka: "ვერცხლი", fr: "argent (métal)" },
  { level: "B1", es: "bronce", en: "bronze", uk: "бронза", ar: "برونز", ka: "ბრინჯაო", fr: "bronze" },
  { level: "B1", es: "barro", en: "mud", uk: "багно", ar: "طين", ka: "ტალახი", fr: "boue" },
  { level: "B1", es: "arcilla", en: "clay", uk: "глина", ar: "غضار", ka: "თიხა", fr: "argile" },
  { level: "A2", es: "cristal", en: "crystal", uk: "кристал", ar: "بلور", ka: "ბროლი", fr: "cristal" },
  { level: "A2", es: "vidrio", en: "glass (material)", uk: "скло", ar: "زجاج", ka: "მინა", fr: "vitre" },
  { level: "A1", es: "plástico", en: "plastic", uk: "пластик", ar: "بلاستيك", ka: "პლასტმასი", fr: "plastique" },
  { level: "A2", es: "cartón", en: "cardboard", uk: "картон", ar: "كرتون", ka: "მუყაო", fr: "carton" },
  { level: "A1", es: "basura", en: "trash", uk: "сміття", ar: "قمامة", ka: "ნაგავი", fr: "ordures" },
  { level: "B1", es: "residuo", en: "waste", uk: "відходи", ar: "نفايات", ka: "ნარჩენები", fr: "déchet" },
  { level: "A2", es: "humo", en: "smoke", uk: "дим", ar: "دخان", ka: "კვამლი", fr: "fumée" },
  { level: "A2", es: "polvo", en: "dust", uk: "пил", ar: "غبار", ka: "მტვერი", fr: "poussière" },
  { level: "B1", es: "ceniza", en: "ash", uk: "попіл", ar: "رماد", ka: "ნაცარი", fr: "cendre" },
  { level: "B1", es: "chispa", en: "spark", uk: "іскра", ar: "شرارة", ka: "ნაპერწკალი", fr: "étincelle" },
  { level: "A2", es: "llama", en: "flame", uk: "полум'я", ar: "لهب", ka: "ალი", fr: "flamme" },
  { level: "A2", es: "carbón", en: "coal", uk: "вугілля", ar: "فحم", ka: "ნახშირი", fr: "charbon" },
  { level: "B1", es: "vapor", en: "steam", uk: "пара", ar: "بخار", ka: "ორთქლი", fr: "vapeur" },
  { level: "B1", es: "ventisca", en: "blizzard", uk: "хуртовина", ar: "عاصفة ثلجية", ka: "ქარბუქი", fr: "blizzard" },
  { level: "B1", es: "brisa", en: "breeze", uk: "бриз", ar: "نسيم", ka: "ნიავქარი", fr: "brise" },
  { level: "C1", es: "vendaval", en: "gale", uk: "буревій", ar: "عاصفة قوية", ka: "ქარიშხალი", fr: "bourrasque" },
  { level: "B1", es: "cumbre", en: "summit", uk: "вершина", ar: "قمة", ka: "მწვერვალი", fr: "sommet" },
  { level: "B1", es: "cima", en: "peak", uk: "пік", ar: "ذروة", ka: "წვერი", fr: "cime" },
  { level: "B1", es: "ladera", en: "hillside", uk: "схил", ar: "منحدر", ka: "ფერდობი", fr: "versant" },
  { level: "B1", es: "acantilado", en: "cliff", uk: "скеля", ar: "جرف", ka: "კლდე", fr: "falaise" },
  { level: "B2", es: "arrecife", en: "reef", uk: "риф", ar: "شعاب مرجانية", ka: "რიფი", fr: "récif" },
  { level: "B1", es: "pantano", en: "swamp", uk: "болото", ar: "مستنقع", ka: "ჭაობი", fr: "marais" },
  { level: "B1", es: "arroyo", en: "stream", uk: "струмок", ar: "جدول", ka: "ნაკადული", fr: "ruisseau" },
  { level: "B2", es: "manantial", en: "spring", uk: "джерело", ar: "نبع", ka: "წყარო", fr: "source" },
  { level: "A2", es: "cascada", en: "waterfall", uk: "водоспад", ar: "شلال", ka: "ჩანჩქერი", fr: "cascade" },
  { level: "A2", es: "pozo", en: "well", uk: "колодязь", ar: "بئر", ka: "ჭა", fr: "puits" },
  { level: "A2", es: "charco", en: "puddle", uk: "калюжа", ar: "بركة ماء", ka: "გუბე", fr: "flaque" },
  { level: "B2", es: "cauce", en: "riverbed", uk: "русло", ar: "مجرى النهر", ka: "კალაპოტი", fr: "lit de rivière" },
  { level: "B1", es: "caucho", en: "rubber", uk: "каучук", ar: "مطاط", ka: "კაუჩუკი", fr: "caoutchouc" },
  { level: "A2", es: "semilla", en: "seed", uk: "насінина", ar: "بذرة", ka: "თესლი", fr: "graine" },
  { level: "A2", es: "raíz", en: "root", uk: "корінь", ar: "جذر", ka: "ფესვი", fr: "racine" },
  { level: "B1", es: "tronco", en: "tree trunk", uk: "стовбур", ar: "جذع", ka: "ღერო", fr: "tronc" },
  { level: "A2", es: "rama", en: "branch", uk: "гілка", ar: "غصن", ka: "ტოტი", fr: "branche" },
  { level: "A1", es: "hoja", en: "leaf", uk: "листок", ar: "ورقة", ka: "ფოთოლი", fr: "feuille" },
  { level: "A2", es: "fruto", en: "crop", uk: "плід", ar: "ثمرة", ka: "ნაყოფი", fr: "récolte" },
  { level: "B1", es: "cáscara", en: "peel", uk: "шкірка", ar: "قشرة", ka: "ქერქი", fr: "écorce" },
  { level: "B1", es: "espina", en: "thorn", uk: "шип", ar: "شوكة", ka: "ეკალი", fr: "épine" },
  { level: "A2", es: "hierba", en: "grass", uk: "трава", ar: "عشب", ka: "ბალახი", fr: "herbe" },
  { level: "A2", es: "césped", en: "lawn", uk: "газон", ar: "مسطح أخضر", ka: "გაზონი", fr: "pelouse" },
  { level: "B1", es: "arbusto", en: "bush", uk: "кущ", ar: "شجيرة", ka: "ბუჩქი", fr: "buisson" },
  { level: "B1", es: "musgo", en: "moss", uk: "мох", ar: "طحلب", ka: "ხავსი", fr: "mousse" },
  { level: "B1", es: "alga", en: "algae", uk: "водорість", ar: "عشب بحري", ka: "წყალმცენარე", fr: "algue" },
  { level: "B1", es: "hongo", en: "mushroom", uk: "гриб", ar: "فطر", ka: "სოკო", fr: "champignon" },
  { level: "B1", es: "veneno", en: "poison", uk: "отрута", ar: "سم", ka: "შხამი", fr: "poison" },
  { level: "B1", es: "curación", en: "cure", uk: "зцілення", ar: "شفاء", ka: "განკურნება", fr: "guérison" },
  { level: "B1", es: "rescate", en: "rescue", uk: "порятунок", ar: "إنقاذ", ka: "გადარჩენა", fr: "sauvetage" },
  { level: "B1", es: "auxilio", en: "aid", uk: "допомога", ar: "مساعدة", ka: "დახმარება", fr: "secours" },
  { level: "B2", es: "asilo", en: "asylum", uk: "притулок", ar: "لجوء", ka: "თავშესაფარი", fr: "asile" },
  { level: "B2", es: "amparo", en: "protection", uk: "опіка", ar: "حماية", ka: "მფარველობა", fr: "protection" },
  { level: "B1", es: "rumbo", en: "course", uk: "курс", ar: "اتجاه", ka: "მიმართულება", fr: "cap" },
  { level: "A2", es: "huella", en: "footprint", uk: "слід", ar: "أثر", ka: "კვალი", fr: "empreinte" },
  { level: "B1", es: "rastro", en: "trail", uk: "слід", ar: "أثر", ka: "კვალი", fr: "trace" },
  { level: "A2", es: "señal", en: "signal", uk: "сигнал", ar: "إشارة", ka: "სიგნალი", fr: "signal" },
  { level: "B1", es: "abandonar", en: "to abandon", uk: "покидати", ar: "يتخلى عن", ka: "მიტოვება", fr: "abandonner" },
  { level: "B2", es: "abarcar", en: "to encompass", uk: "охоплювати", ar: "يشمل", ka: "მოცვა", fr: "englober" },
  { level: "B2", es: "abrumar", en: "to overwhelm", uk: "пригнічувати", ar: "يربك", ka: "გადატვირთვა", fr: "accabler" },
  { level: "B1", es: "absorber", en: "to absorb", uk: "поглинати", ar: "يمتص", ka: "შეწოვა", fr: "absorber" },
  { level: "A2", es: "aburrir", en: "to bore", uk: "набридати", ar: "يُمِلّ", ka: "მოწყენა", fr: "ennuyer" },
  { level: "B1", es: "acudir", en: "to go to", uk: "приходити", ar: "يحضر", ka: "მისვლა", fr: "se rendre" },
  { level: "B1", es: "acumular", en: "to accumulate", uk: "накопичувати", ar: "يراكم", ka: "დაგროვება", fr: "accumuler" },
  { level: "B1", es: "acusar", en: "to accuse", uk: "звинувачувати", ar: "يتهم", ka: "დადანაშაულება", fr: "accuser" },
  { level: "B1", es: "adaptar", en: "to adapt", uk: "адаптувати", ar: "يكيّف", ka: "ადაპტირება", fr: "adapter" },
  { level: "B1", es: "adivinar", en: "to guess", uk: "вгадувати", ar: "يخمن", ka: "გამოცნობა", fr: "deviner" },
  { level: "B1", es: "admitir", en: "to admit", uk: "визнавати", ar: "يعترف", ka: "აღიარება", fr: "admettre" },
  { level: "B1", es: "adquirir", en: "to acquire", uk: "набувати", ar: "يكتسب", ka: "შეძენა", fr: "acquérir" },
  { level: "B1", es: "advertir", en: "to warn", uk: "попереджати", ar: "يحذر", ka: "გაფრთხილება", fr: "avertir" },
  { level: "B1", es: "afectar", en: "to affect", uk: "впливати на", ar: "يؤثر على", ka: "გავლენის მოხდენა", fr: "affecter" },
  { level: "B1", es: "afirmar", en: "to state", uk: "стверджувати", ar: "يؤكد", ka: "დადასტურება", fr: "affirmer" },
  { level: "B1", es: "aguantar", en: "to endure", uk: "терпіти", ar: "يتحمل", ka: "თმენა", fr: "supporter" },
  { level: "B1", es: "agitar", en: "to shake", uk: "трясти", ar: "يهز", ka: "შერხევა", fr: "agiter" },
  { level: "B1", es: "agotar", en: "to exhaust", uk: "виснажувати", ar: "يستنفد", ka: "გამოფიტვა", fr: "épuiser" },
  { level: "B2", es: "agredir", en: "to assault", uk: "нападати", ar: "يعتدي على", ka: "თავდასხმა", fr: "agresser" },
  { level: "B1", es: "aislar", en: "to isolate", uk: "ізолювати", ar: "يعزل", ka: "იზოლირება", fr: "isoler" },
  { level: "B2", es: "alabar", en: "to praise", uk: "хвалити", ar: "يمدح", ka: "ქება", fr: "louer" },
  { level: "B2", es: "albergar", en: "to harbor", uk: "приютити", ar: "يأوي", ka: "შეფარება", fr: "héberger" },
  { level: "B2", es: "alentar", en: "to encourage", uk: "заохочувати", ar: "يشجع", ka: "წახალისება", fr: "encourager" },
  { level: "B1", es: "alimentar", en: "to feed", uk: "годувати", ar: "يُطعم", ka: "კვება", fr: "nourrir" },
  { level: "B1", es: "aliviar", en: "to relieve", uk: "полегшувати", ar: "يخفف", ka: "შემსუბუქება", fr: "soulager" },
  { level: "B1", es: "alterar", en: "to alter", uk: "змінювати", ar: "يغير", ka: "შეცვლა", fr: "altérer" },
  { level: "B2", es: "alumbrar", en: "to illuminate", uk: "освітлювати", ar: "يضيء", ka: "განათება", fr: "éclairer" },
  { level: "B2", es: "aludir", en: "to allude to", uk: "натякати", ar: "يلمح", ka: "მინიშნება", fr: "faire allusion" },
  { level: "C1", es: "amortiguar", en: "to cushion", uk: "пом'якшувати", ar: "يخفف من", ka: "შემსუბუქება", fr: "amortir" },
  { level: "B1", es: "ampliar", en: "to expand", uk: "розширювати", ar: "يوسع", ka: "გაფართოება", fr: "élargir" },
  { level: "B1", es: "analizar", en: "to analyze", uk: "аналізувати", ar: "يحلل", ka: "გაანალიზება", fr: "analyser" },
  { level: "B2", es: "anhelar", en: "to yearn for", uk: "прагнути", ar: "يتوق إلى", ka: "სწრაფვა", fr: "aspirer à" },
  { level: "B1", es: "animar", en: "to cheer up", uk: "підбадьорювати", ar: "يحمس", ka: "გამხნევება", fr: "motiver" },
  { level: "A2", es: "anotar", en: "to note down", uk: "записувати", ar: "يدوّن", ka: "ჩაწერა", fr: "noter" },
  { level: "B1", es: "anticipar", en: "to anticipate", uk: "передбачати", ar: "يتوقع", ka: "განჭვრეტა", fr: "anticiper" },
  { level: "B1", es: "anular", en: "to cancel", uk: "скасовувати", ar: "يلغي", ka: "გაუქმება", fr: "annuler" },
  { level: "C1", es: "apacentar", en: "to graze", uk: "пасти", ar: "يرعى", ka: "ძოვება", fr: "paître" },
  { level: "B2", es: "apelar", en: "to appeal", uk: "апелювати", ar: "يستأنف", ka: "გასაჩივრება", fr: "faire appel" },
  { level: "C1", es: "aplanar", en: "to flatten", uk: "вирівнювати", ar: "يسطّح", ka: "გასწორება", fr: "aplatir" },
  { level: "B1", es: "aplazar", en: "to postpone", uk: "відкладати", ar: "يؤجل", ka: "გადადება", fr: "reporter" },
  { level: "A2", es: "aplicar", en: "to apply", uk: "застосовувати", ar: "يطبق", ka: "გამოყენება", fr: "appliquer" },
  { level: "B2", es: "apoderarse", en: "to seize", uk: "захоплювати", ar: "يستولي على", ka: "დაუფლება", fr: "s'emparer" },
  { level: "B1", es: "apreciar", en: "to appreciate", uk: "цінувати", ar: "يقدر", ka: "დაფასება", fr: "apprécier" },
  { level: "A2", es: "apretar", en: "to squeeze", uk: "стискати", ar: "يضغط", ka: "მოჭერა", fr: "serrer" },
  { level: "B2", es: "apropiarse", en: "to appropriate", uk: "привласнювати", ar: "يختلس", ka: "მითვისება", fr: "s'approprier" },
  { level: "B1", es: "apostar", en: "to bet", uk: "закладатися", ar: "يراهن", ka: "ფსონის დადება", fr: "parier" },
  { level: "B2", es: "apurar", en: "to rush", uk: "поспішати", ar: "يستعجل", ka: "ჩქარობა", fr: "se dépêcher" },
  { level: "B1", es: "arriesgar", en: "to risk", uk: "ризикувати", ar: "يخاطر", ka: "რისკის გაწევა", fr: "risquer" },
  { level: "B1", es: "arruinar", en: "to ruin", uk: "руйнувати", ar: "يدمر", ka: "განადგურება", fr: "ruiner" },
  { level: "B2", es: "articular", en: "to articulate", uk: "чітко висловлювати", ar: "ينطق بوضوح", ka: "არტიკულირება", fr: "articuler" },
  { level: "B2", es: "asentar", en: "to settle", uk: "оселятися", ar: "يستقر", ka: "დამკვიდრება", fr: "s'établir" },
  { level: "B2", es: "asesorar", en: "to advise", uk: "консультувати", ar: "يقدم المشورة", ka: "კონსულტაციის გაწევა", fr: "conseiller" },
  { level: "B1", es: "asignar", en: "to assign", uk: "призначати", ar: "يخصص", ka: "მინიჭება", fr: "assigner" },
  { level: "B1", es: "simular", en: "to simulate", uk: "удавати", ar: "يحاكي", ka: "სიმულირება", fr: "simuler" },
  { level: "B2", es: "asimilar", en: "to assimilate", uk: "засвоювати", ar: "يستوعب", ka: "ათვისება", fr: "assimiler" },
  { level: "A2", es: "asistir", en: "to attend", uk: "відвідувати", ar: "يحضر", ka: "დასწრება", fr: "assister" },
  { level: "B1", es: "asociar", en: "to associate", uk: "асоціювати", ar: "يربط", ka: "ასოცირება", fr: "associer" },
  { level: "B1", es: "asumir", en: "to assume", uk: "брати на себе", ar: "يتولى", ka: "თავის თავზე აღება", fr: "assumer" },
  { level: "A1", es: "atar", en: "to tie", uk: "зав'язувати", ar: "يربط", ka: "შეკვრა", fr: "attacher" },
  { level: "A2", es: "atacar", en: "to attack", uk: "атакувати", ar: "يهاجم", ka: "თავდასხმა", fr: "attaquer" },
  { level: "C1", es: "atestar", en: "to cram", uk: "набивати", ar: "يحشو", ka: "გავსება", fr: "bourrer" },
  { level: "B1", es: "atraer", en: "to attract", uk: "приваблювати", ar: "يجذب", ka: "მოზიდვა", fr: "attirer" },
  { level: "A2", es: "atrapar", en: "to catch", uk: "ловити", ar: "يمسك بـ", ka: "დაჭერა", fr: "attraper" },
  { level: "B2", es: "atribuir", en: "to attribute", uk: "приписувати", ar: "ينسب إلى", ka: "მიწერა", fr: "attribuer" },
  { level: "C1", es: "augurar", en: "to foretell", uk: "передвіщати", ar: "يتنبأ بـ", ka: "წინასწარმეტყველება", fr: "augurer" },
  { level: "B1", es: "autorizar", en: "to authorize", uk: "дозволяти", ar: "يأذن بـ", ka: "ნებართვის მიცემა", fr: "autoriser" },
  { level: "B1", es: "averiguar", en: "to find out", uk: "з'ясовувати", ar: "يكتشف", ka: "გარკვევა", fr: "découvrir" },
  { level: "B2", es: "avalar", en: "to endorse", uk: "поручатися за", ar: "يضمن", ka: "თავდებობა", fr: "cautionner" },
  { level: "B1", es: "avergonzar", en: "to embarrass", uk: "соромити", ar: "يخجل", ka: "შერცხვენა", fr: "embarrasser" },
  { level: "B2", es: "azotar", en: "to whip", uk: "шмагати", ar: "يجلد", ka: "გვემა", fr: "fouetter" },
  { level: "B1", es: "absurdo", en: "absurd", uk: "абсурдний", ar: "عبثي", ka: "აბსურდული", fr: "absurde" },
  { level: "B1", es: "abundante", en: "abundant", uk: "рясний", ar: "وفير", ka: "უხვი", fr: "abondant" },
  { level: "B1", es: "accesible", en: "accessible", uk: "доступний", ar: "متاح", ka: "ხელმისაწვდომი", fr: "accessible" },
  { level: "B2", es: "aceitoso", en: "oily", uk: "масляний", ar: "زيتي", ka: "ცხიმიანი", fr: "huileux" },
  { level: "A2", es: "activo", en: "active", uk: "активний", ar: "نشيط", ka: "აქტიური", fr: "actif" },
  { level: "A2", es: "actual", en: "current", uk: "поточний", ar: "حالي", ka: "მიმდინარე", fr: "actuel" },
  { level: "B2", es: "adverso", en: "adverse", uk: "несприятливий", ar: "معاكس", ka: "არახელსაყრელი", fr: "défavorable" },
  { level: "C1", es: "afable", en: "affable", uk: "привітний", ar: "ودود", ka: "ალერსიანი", fr: "affable" },
  { level: "B1", es: "afectuoso", en: "affectionate", uk: "ласкавий", ar: "عطوف", ka: "სათბო", fr: "affectueux" },
  { level: "B1", es: "ágil", en: "agile", uk: "спритний", ar: "رشيق", ka: "მარდი", fr: "agile" },
  { level: "B2", es: "agobiante", en: "overwhelming", uk: "виснажливий", ar: "مرهق", ka: "დამქანცველი", fr: "accablant" },
  { level: "B1", es: "agotador", en: "exhausting", uk: "стомливий", ar: "متعب", ka: "დამღლელი", fr: "épuisant" },
  { level: "A2", es: "agresivo", en: "aggressive", uk: "агресивний", ar: "عدواني", ka: "აგრესიული", fr: "agressif" },
  { level: "B1", es: "agridulce", en: "bittersweet", uk: "кисло-солодкий", ar: "حلو مر", ka: "მწარე-ტკბილი", fr: "aigre-doux" },
  { level: "B1", es: "alarmante", en: "alarming", uk: "тривожний", ar: "مقلق", ka: "საგანგაშო", fr: "alarmant" },
  { level: "A1", es: "alegre", en: "cheerful", uk: "веселий", ar: "مرح", ka: "მხიარული", fr: "joyeux" },
  { level: "B2", es: "aleatorio", en: "random", uk: "випадковий", ar: "عشوائي", ka: "შემთხვევითი", fr: "aléatoire" },
  { level: "B1", es: "alternativo", en: "alternative", uk: "альтернативний", ar: "اختياري", ka: "ალტერნატიული", fr: "alternatif" },
  { level: "C1", es: "altivo", en: "haughty", uk: "пихатий", ar: "متعجرف", ka: "ამპარტავანი", fr: "hautain" },
  { level: "B1", es: "ambicioso", en: "ambitious", uk: "амбітний", ar: "طموح", ka: "ამბიციური", fr: "ambitieux" },
  { level: "B1", es: "ameno", en: "enjoyable", uk: "приємний", ar: "ممتع", ka: "სასიამოვნო", fr: "agréable" },
  { level: "A2", es: "amoroso", en: "loving", uk: "люблячий", ar: "محب", ka: "მოსიყვარულე", fr: "aimant" },
  { level: "B2", es: "analítico", en: "analytical", uk: "аналітичний", ar: "تحليلي", ka: "ანალიტიკური", fr: "analytique" },
  { level: "B1", es: "anónimo", en: "anonymous", uk: "анонімний", ar: "مجهول", ka: "ანონიმური", fr: "anonyme" },
  { level: "B1", es: "anormal", en: "abnormal", uk: "ненормальний", ar: "غير طبيعي", ka: "არანორმალური", fr: "anormal" },
  { level: "A2", es: "antipático", en: "unfriendly", uk: "неприємний", ar: "غير ودود", ka: "უსიმპათიო", fr: "antipathique" },
  { level: "B1", es: "anual", en: "annual", uk: "щорічний", ar: "سنوي", ka: "წლიური", fr: "annuel" },
  { level: "B1", es: "apasionado", en: "passionate", uk: "пристрасний", ar: "شغوف", ka: "გატაცებული", fr: "passionné" },
  { level: "B2", es: "apático", en: "apathetic", uk: "апатичний", ar: "لا مبالٍ", ka: "აპათიური", fr: "apathique" },
  { level: "B1", es: "apropiado", en: "appropriate", uk: "доречний", ar: "مناسب", ka: "შესაფერისი", fr: "approprié" },
  { level: "B2", es: "arbitrario", en: "arbitrary", uk: "довільний", ar: "تعسفي", ka: "თვითნებური", fr: "arbitraire" },
  { level: "B1", es: "ardiente", en: "burning", uk: "палкий", ar: "متقد", ka: "მგზნებარე", fr: "ardent" },
  { level: "B1", es: "árido", en: "arid", uk: "посушливий", ar: "قاحل", ka: "გამომშრალი", fr: "aride" },
  { level: "B2", es: "armónico", en: "harmonious", uk: "гармонійний", ar: "متناغم", ka: "ჰარმონიული", fr: "harmonieux" },
  { level: "A2", es: "artificial", en: "artificial", uk: "штучний", ar: "اصطناعي", ka: "ხელოვნური", fr: "artificiel" },
  { level: "A2", es: "artístico", en: "artistic", uk: "мистецький", ar: "فني", ka: "მხატვრული", fr: "artistique" },
  { level: "B1", es: "asombroso", en: "astonishing", uk: "дивовижний", ar: "مذهل", ka: "საოცარი", fr: "étonnant" },
  { level: "B1", es: "astuto", en: "cunning", uk: "хитрий", ar: "ماكر", ka: "მზაკვრული", fr: "rusé" },
  { level: "C1", es: "atrofiado", en: "atrophied", uk: "атрофований", ar: "ضامر", ka: "ატროფირებული", fr: "atrophié", category: "medicine" },
  { level: "B1", es: "auténtico", en: "authentic", uk: "справжній", ar: "أصيل", ka: "ავთენტური", fr: "authentique" },
  { level: "B2", es: "autoritario", en: "authoritarian", uk: "авторитарний", ar: "استبدادي", ka: "ავტორიტარული", fr: "autoritaire" },
  { level: "B1", es: "avaro", en: "miserly", uk: "скупий", ar: "بخيل", ka: "ძუნწი", fr: "avare" },
  { level: "B2", es: "banal", en: "banal", uk: "банальний", ar: "مبتذل", ka: "ბანალური", fr: "banal" },
  { level: "A2", es: "básico", en: "basic", uk: "базовий", ar: "أساسي", ka: "საბაზისო", fr: "basique" },
  { level: "C1", es: "benéfico", en: "beneficial", uk: "благодійний", ar: "نافع", ka: "კეთილისმყოფელი", fr: "bénéfique" },
  { level: "C1", es: "benévolo", en: "benevolent", uk: "доброзичливий", ar: "خيّر", ka: "ქველმოქმედი", fr: "bienveillant" },
  { level: "C1", es: "bizarro", en: "brave", uk: "доблесний", ar: "باسل", ka: "გმირული", fr: "vaillant" },
  { level: "B2", es: "blanquecino", en: "whitish", uk: "білуватий", ar: "مائل للبياض", ka: "თეთრისებრი", fr: "blanchâtre" },
  { level: "B1", es: "bondadoso", en: "kind-hearted", uk: "добрий", ar: "طيب القلب", ka: "კეთილი", fr: "bon" },
  { level: "C1", es: "boreal", en: "northern", uk: "північний", ar: "شمالي", ka: "ჩრდილოური", fr: "boréal" },
  { level: "C1", es: "brumoso", en: "misty", uk: "туманний", ar: "ضبابي", ka: "ნისლიანი", fr: "brumeux" },
  { level: "B1", es: "brutal", en: "brutal", uk: "жорстокий", ar: "وحشي", ka: "სასტიკი", fr: "brutal" },
  { level: "C1", es: "bucólico", en: "bucolic", uk: "ідилічний", ar: "ريفي", ka: "პასტორალური", fr: "bucolique" },
  { level: "C1", es: "burdo", en: "crude", uk: "грубий", ar: "فظ", ka: "უხეში", fr: "grossier" },
  { level: "B2", es: "burocrático", en: "bureaucratic", uk: "бюрократичний", ar: "بيروقراطي", ka: "ბიუროკრატიული", fr: "bureaucratique" },
  { level: "C1", es: "caduco", en: "obsolete", uk: "застарілий", ar: "بائد", ka: "მოძველებული", fr: "caduc" },
  { level: "A2", es: "caluroso", en: "warm", uk: "теплий", ar: "حار", ka: "თბილი", fr: "chaleureux" },
  { level: "C1", es: "cándido", en: "naive", uk: "простодушний", ar: "بريء", ka: "წრფელგულა", fr: "candide" },
  { level: "B1", es: "caprichoso", en: "capricious", uk: "примхливий", ar: "متقلب المزاج", ka: "კაპრიზული", fr: "capricieux" },
  { level: "A2", es: "característico", en: "characteristic", uk: "характерний", ar: "مميز", ka: "დამახასიათებელი", fr: "caractéristique" },
  { level: "B1", es: "cauteloso", en: "cautious", uk: "обачний", ar: "حصيف", ka: "წინდახედული", fr: "circonspect" },
  { level: "B1", es: "célebre", en: "famous", uk: "знаменитий", ar: "مشهور", ka: "ცნობილი", fr: "célèbre" },
  { level: "A2", es: "celeste", en: "celestial", uk: "небесний", ar: "سماوي", ka: "ციური", fr: "céleste" },
  { level: "B1", es: "certero", en: "accurate", uk: "влучний", ar: "دقيق", ka: "ზუსტი", fr: "précis" },
  { level: "B2", es: "cíclico", en: "cyclical", uk: "циклічний", ar: "دوري", ka: "ციკლური", fr: "cyclique" },
  { level: "B1", es: "cilíndrico", en: "cylindrical", uk: "циліндричний", ar: "أسطواني", ka: "ცილინდრული", fr: "cylindrique" },
  { level: "A2", es: "aún", en: "still", uk: "все ще", ar: "لا يزال", ka: "ჯერ კიდევ", fr: "encore" },
  { level: "A2", es: "todavía", en: "yet", uk: "досі", ar: "حتى الآن", ka: "ამ დრომდე", fr: "à ce jour" },
  { level: "A1", es: "ahí", en: "there", uk: "там", ar: "هناك", ka: "იქ", fr: "là" },
  { level: "A2", es: "acá", en: "here", uk: "тут", ar: "هنا", ka: "აქ", fr: "ici" },
  { level: "C2", es: "acullá", en: "yonder", uk: "он там", ar: "هنالك", ka: "იმ მხარეს", fr: "là-bas" },
  { level: "C1", es: "doquiera", en: "anywhere", uk: "хоч куди", ar: "حيثما", ka: "სადაც უნდა იყოს", fr: "n'importe où" },
  { level: "A2", es: "adonde", en: "to where", uk: "куди", ar: "إلى أين", ka: "საითკენ", fr: "où" },
  { level: "C1", es: "adondequiera", en: "to wherever", uk: "куди б не", ar: "إلى أينما", ka: "საითაც არ უნდა იყოს", fr: "vers où que ce soit" },
  { level: "C2", es: "doquier", en: "everywhere", uk: "повсюди", ar: "في كل مكان", ka: "ყველგან", fr: "partout" },
  { level: "B1", es: "casualmente", en: "coincidentally", uk: "випадково", ar: "بالصدفة", ka: "შემთხვევით", fr: "par hasard" },
  { level: "B1", es: "desgraciadamente", en: "unfortunately", uk: "на жаль", ar: "لسوء الحظ", ka: "სამწუხაროდ", fr: "malheureusement" },
  { level: "B2", es: "milagrosamente", en: "miraculously", uk: "чудом", ar: "بأعجوبة", ka: "სასწაულებრივად", fr: "miraculeusement" },
  { level: "B2", es: "sorpresivamente", en: "surprisingly", uk: "несподівано", ar: "بشكل مفاجئ", ka: "მოულოდნელად", fr: "de manière surprenante" },
  { level: "B2", es: "indudablemente", en: "undoubtedly", uk: "безсумнівно", ar: "بلا شك", ka: "უეჭველად", fr: "indubitablement" },
  { level: "B2", es: "indiscutiblemente", en: "indisputably", uk: "безперечно", ar: "بلا جدال", ka: "უდავოდ", fr: "incontestablement" },
  { level: "B2", es: "innegablemente", en: "undeniably", uk: "незаперечно", ar: "بلا إنكار", ka: "შეუცილებლად", fr: "indéniablement" },
  { level: "B1", es: "inevitablemente", en: "inevitably", uk: "неминуче", ar: "حتمًا", ka: "გარდაუვალად", fr: "inévitablement" },
  { level: "B2", es: "involuntariamente", en: "involuntarily", uk: "мимоволі", ar: "عن غير قصد", ka: "უნებურად", fr: "involontairement" },
  { level: "B1", es: "intencionalmente", en: "intentionally", uk: "цілеспрямовано", ar: "عن قصد", ka: "წინასწარგანზრახულად", fr: "intentionnellement" },
  { level: "B1", es: "deliberadamente", en: "deliberately", uk: "свідомо", ar: "بتعمد", ka: "შეგნებულად", fr: "délibérément" },
  { level: "B1", es: "simultáneamente", en: "simultaneously", uk: "одночасно", ar: "بشكل متزامن", ka: "ერთდროულად", fr: "simultanément" },
  { level: "B1", es: "gradualmente", en: "little by little", uk: "поступово", ar: "تدريجيًا", ka: "თანდათან", fr: "petit à petit" },
  { level: "B1", es: "progresivamente", en: "progressively", uk: "поетапно", ar: "تصاعديًا", ka: "პროგრესულად", fr: "progressivement" },
  { level: "B1", es: "súbitamente", en: "suddenly", uk: "зненацька", ar: "بغتة", ka: "ერთბაშად", fr: "subitement" },
  { level: "B2", es: "inusualmente", en: "unusually", uk: "незвично", ar: "بشكل غير معتاد", ka: "უჩვეულოდ", fr: "inhabituellement" },
  { level: "B2", es: "sistemáticamente", en: "systematically", uk: "систематично", ar: "بشكل منهجي", ka: "სისტემატურად", fr: "systématiquement" },
  { level: "B1", es: "permanentemente", en: "permanently", uk: "назавжди", ar: "بشكل دائم", ka: "სამუდამოდ", fr: "en permanence" },
  { level: "B1", es: "temporalmente", en: "temporarily", uk: "тимчасово", ar: "مؤقتًا", ka: "დროებით", fr: "temporairement" },
  { level: "B2", es: "provisionalmente", en: "provisionally", uk: "умовно", ar: "بصفة مؤقتة", ka: "პირობითად", fr: "provisoirement" },
  { level: "B1", es: "eternamente", en: "eternally", uk: "вічно", ar: "أبديًا", ka: "მარადიულად", fr: "éternellement" },
  { level: "B2", es: "infinitamente", en: "infinitely", uk: "нескінченно", ar: "لا نهائيًا", ka: "უსასრულოდ", fr: "infiniment" },
  { level: "A2", es: "extremadamente", en: "extremely", uk: "надзвичайно", ar: "للغاية", ka: "უკიდურესად", fr: "extrêmement" },
  { level: "B1", es: "sumamente", en: "highly", uk: "вкрай", ar: "بالغ", ka: "უაღრესად", fr: "hautement" },
  { level: "C1", es: "sobremanera", en: "exceedingly", uk: "надміру", ar: "إلى حد بعيد", ka: "გადამეტებულად", fr: "excessivement" },
  { level: "B1", es: "excesivamente", en: "excessively", uk: "надмірно", ar: "بإفراط", ka: "გადაჭარბებით", fr: "de manière excessive" },
  { level: "B1", es: "notablemente", en: "notably", uk: "помітно", ar: "بشكل ملحوظ", ka: "შესამჩნევად", fr: "notablement" },
  { level: "B1", es: "considerablemente", en: "considerably", uk: "значно", ar: "بشكل كبير", ka: "მნიშვნელოვნად", fr: "considérablement" },
  { level: "B2", es: "sustancialmente", en: "substantially", uk: "суттєво", ar: "جوهريًا", ka: "არსებითად", fr: "substantiellement" },
  { level: "B1", es: "parcialmente", en: "partially", uk: "частково", ar: "جزئيًا", ka: "ნაწილობრივ", fr: "partiellement" },
  { level: "A2", es: "completamente", en: "completely", uk: "цілком", ar: "بالكامل", ka: "სავსებით", fr: "complètement" },
  { level: "B2", es: "enteramente", en: "entirely", uk: "повністю", ar: "كليًا", ka: "მთლიანად", fr: "entièrement" },
  { level: "B1", es: "absolutamente", en: "absolutely", uk: "абсолютно", ar: "إطلاقًا", ka: "აბსოლუტურად", fr: "absolument" },
  { level: "B2", es: "rotundamente", en: "flatly", uk: "рішуче", ar: "بشكل قاطع", ka: "კატეგორიულად", fr: "catégoriquement" },
  { level: "B2", es: "categóricamente", en: "categorically", uk: "категорично", ar: "بشكل حاسم", ka: "გადაწყვეტილებით", fr: "de manière catégorique" },
  { level: "C1", es: "tajantemente", en: "sharply", uk: "різко", ar: "بحدة", ka: "მკვეთრად", fr: "de façon tranchante" },
  { level: "B1", es: "estrictamente", en: "strictly", uk: "строго", ar: "بصرامة", ka: "მკაცრად", fr: "strictement" },
  { level: "B2", es: "rigurosamente", en: "rigorously", uk: "ретельно", ar: "بدقة", ka: "სიზუსტით", fr: "rigoureusement" },
  { level: "B1", es: "literalmente", en: "literally", uk: "буквально", ar: "حرفيًا", ka: "სიტყვასიტყვით", fr: "littéralement" },
  { level: "B2", es: "figuradamente", en: "figuratively", uk: "образно", ar: "مجازيًا", ka: "ხატოვნად", fr: "figurativement" },
  { level: "B1", es: "simbólicamente", en: "symbolically", uk: "символічно", ar: "رمزيًا", ka: "სიმბოლურად", fr: "symboliquement" },
  { level: "B2", es: "metafóricamente", en: "metaphorically", uk: "метафорично", ar: "استعاريًا", ka: "მეტაფორულად", fr: "métaphoriquement" },
  { level: "B1", es: "irónicamente", en: "ironically", uk: "іронічно", ar: "بسخرية", ka: "ირონიულად", fr: "ironiquement" },
  { level: "B2", es: "sarcásticamente", en: "sarcastically", uk: "саркастично", ar: "بتهكم", ka: "სარკასტულად", fr: "sarcastiquement" },
  { level: "B1", es: "curiosamente", en: "curiously", uk: "цікаво", ar: "بفضول", ka: "საინტერესოდ", fr: "curieusement" },
  { level: "B1", es: "extrañamente", en: "strangely", uk: "дивно", ar: "بغرابة", ka: "უცნაურად", fr: "étrangement" },
  { level: "B1", es: "raramente", en: "rarely", uk: "рідко", ar: "نادرًا", ka: "იშვიათად", fr: "rarement" },
  { level: "B2", es: "escasamente", en: "scarcely", uk: "ледве", ar: "بالكاد", ka: "ძლივს", fr: "à peine" },
  { level: "B1", es: "difícilmente", en: "hardly", uk: "навряд чи", ar: "بصعوبة", ka: "ძნელად", fr: "difficilement" },
  { level: "A2", es: "fácilmente", en: "easily", uk: "легко", ar: "بسهولة", ka: "ადვილად", fr: "facilement" },
  { level: "A2", es: "exactamente", en: "exactly", uk: "точно", ar: "بالضبط", ka: "ზუსტად", fr: "exactement" },
  { level: "B1", es: "inventario", en: "inventory", uk: "інвентар", ar: "جرد", ka: "ინვენტარი", fr: "inventaire" },
  { level: "B1", es: "protocolo", en: "protocol", uk: "протокол", ar: "بروتوكول", ka: "პროტოკოლი", fr: "protocole" },
  { level: "B1", es: "expediente", en: "file (record)", uk: "справа", ar: "ملف قضية", ka: "საქმე", fr: "dossier" },
  { level: "B2", es: "archipiélago", en: "archipelago", uk: "архіпелаг", ar: "أرخبيل", ka: "არქიპელაგი", fr: "archipel" },
  { level: "B1", es: "península", en: "peninsula", uk: "півострів", ar: "شبه جزيرة", ka: "ნახევარკუნძული", fr: "péninsule" },
  { level: "B2", es: "istmo", en: "isthmus", uk: "перешийок", ar: "برزخ", ka: "ისთმუსი", fr: "isthme" },
  { level: "B1", es: "glaciar", en: "glacier", uk: "льодовик", ar: "نهر جليدي", ka: "მყინვარი", fr: "glacier" },
  { level: "B1", es: "tundra", en: "tundra", uk: "тундра", ar: "تندرا", ka: "ტუნდრა", fr: "toundra" },
  { level: "B1", es: "sabana", en: "savanna", uk: "савана", ar: "سافانا", ka: "სავანა", fr: "savane" },
  { level: "B1", es: "estepa", en: "steppe", uk: "степ", ar: "سهوب", ka: "სტეპი", fr: "steppe" },
  { level: "A2", es: "geografía", en: "geography", uk: "географія", ar: "جغرافيا", ka: "გეოგრაფია", fr: "géographie" },
  { level: "B2", es: "relieve", en: "relief (landform)", uk: "рельєф", ar: "تضاريس", ka: "რელიეფი", fr: "relief" },
  { level: "B1", es: "meseta", en: "plateau", uk: "плато", ar: "هضبة", ka: "პლატო", fr: "plateau" },
  { level: "B1", es: "llanura", en: "plain", uk: "рівнина", ar: "سهل", ka: "დაბლობი", fr: "plaine" },
  { level: "B2", es: "vertiente", en: "watershed", uk: "водозбір", ar: "حوض تصريف", ka: "წყალგამყოფი", fr: "bassin versant" },
  { level: "B1", es: "cuenca", en: "river basin", uk: "басейн", ar: "حوض", ka: "აუზი", fr: "bassin" },
  { level: "B2", es: "afluente", en: "tributary", uk: "притока", ar: "رافد", ka: "შენაკადი", fr: "affluent" },
  { level: "B1", es: "delta", en: "delta", uk: "дельта", ar: "دلتا", ka: "დელტა", fr: "delta" },
  { level: "B2", es: "estuario", en: "estuary", uk: "гирло", ar: "مصب", ka: "შესართავი", fr: "estuaire" },
  { level: "B2", es: "acueducto", en: "aqueduct", uk: "акведук", ar: "قناة مائية", ka: "წყალსადენი", fr: "aqueduc" },
  { level: "B1", es: "embalse", en: "reservoir", uk: "водосховище", ar: "خزان مياه", ka: "წყალსაცავი", fr: "réservoir" },
  { level: "B1", es: "represa", en: "dam", uk: "гребля", ar: "سد", ka: "კაშხალი", fr: "barrage" },
  { level: "B1", es: "cantera", en: "quarry", uk: "кар'єр", ar: "محجر", ka: "კარიერი", fr: "carrière" },
  { level: "A2", es: "mina", en: "mine", uk: "шахта", ar: "منجم", ka: "მაღარო", fr: "mine" },
  { level: "B2", es: "yacimiento", en: "deposit (mineral)", uk: "родовище", ar: "رواسب", ka: "საბადო", fr: "gisement" },
  { level: "B1", es: "perforación", en: "drilling", uk: "буріння", ar: "حفر", ka: "ბურღვა", fr: "forage" },
  { level: "A2", es: "excavación", en: "excavation", uk: "розкопки", ar: "حفريات", ka: "გათხრები", fr: "excavation" },
  { level: "B1", es: "trinchera", en: "trench", uk: "траншея", ar: "متراس", ka: "სანგარი", fr: "tranchée" },
  { level: "B1", es: "búnker", en: "bunker", uk: "бункер", ar: "مخبأ", ka: "ბუნკერი", fr: "bunker" },
  { level: "B1", es: "cimiento", en: "foundation", uk: "фундамент", ar: "أساس", ka: "საძირკველი", fr: "fondation" },
  { level: "A2", es: "estructura", en: "structure", uk: "структура", ar: "هيكل", ka: "სტრუქტურა", fr: "structure" },
  { level: "B1", es: "andamio", en: "scaffolding", uk: "риштування", ar: "سقالة", ka: "ხარაჩო", fr: "échafaudage" },
  { level: "A2", es: "grúa", en: "crane (machine)", uk: "кран", ar: "رافعة", ka: "კრანი", fr: "grue" },
  { level: "B2", es: "engranaje", en: "gear", uk: "шестерня", ar: "ترس", ka: "კბილანა", fr: "engrenage" },
  { level: "B1", es: "palanca", en: "lever", uk: "важіль", ar: "رافعة ذراع", ka: "ბერკეტი", fr: "levier" },
  { level: "B1", es: "polea", en: "pulley", uk: "шків", ar: "بكرة", ka: "ბლოკი", fr: "poulie" },
  { level: "B1", es: "pistón", en: "piston", uk: "поршень", ar: "مكبس", ka: "დგუში", fr: "piston" },
  { level: "B1", es: "turbina", en: "turbine", uk: "турбіна", ar: "توربين", ka: "ტურბინა", fr: "turbine" },
  { level: "B1", es: "generador", en: "generator", uk: "генератор", ar: "مولد", ka: "გენერატორი", fr: "générateur" },
  { level: "B1", es: "transformador", en: "transformer", uk: "трансформатор", ar: "محول", ka: "ტრანსფორმატორი", fr: "transformateur" },
  { level: "B1", es: "circuito", en: "circuit", uk: "коло", ar: "دائرة كهربائية", ka: "წრედი", fr: "circuit" },
  { level: "B1", es: "fusible", en: "fuse", uk: "запобіжник", ar: "فيوز", ka: "დამცავი", fr: "fusible" },
  { level: "A2", es: "interruptor", en: "switch", uk: "вимикач", ar: "مفتاح كهربائي", ka: "გამომრთველი", fr: "interrupteur" },
  { level: "A2", es: "enchufe", en: "outlet", uk: "розетка", ar: "مقبس", ka: "როზეტი", fr: "prise" },
  { level: "A2", es: "bombilla", en: "light bulb", uk: "лампочка", ar: "لمبة", ka: "ნათურა", fr: "ampoule" },
  { level: "A2", es: "farola", en: "streetlamp", uk: "ліхтар", ar: "عمود إنارة", ka: "ქუჩის ფარანი", fr: "réverbère" },
  { level: "A2", es: "linterna", en: "flashlight", uk: "ліхтарик", ar: "مصباح يدوي", ka: "ხელის ფარანი", fr: "lampe de poche" },
  { level: "B1", es: "reflector", en: "spotlight", uk: "прожектор", ar: "كشاف ضوئي", ka: "პროჟექტორი", fr: "projecteur" },
  { level: "A2", es: "altavoz", en: "speaker (audio)", uk: "динамік", ar: "مكبر صوت", ka: "დინამიკი", fr: "haut-parleur" },
  { level: "A2", es: "micrófono", en: "microphone", uk: "мікрофон", ar: "ميكروفون", ka: "მიკროფონი", fr: "microphone" },
  { level: "A2", es: "auricular", en: "earpiece", uk: "навушник", ar: "سماعة أذن", ka: "ყურსასმენი", fr: "écouteur" },
  { level: "A2", es: "teclado", en: "keyboard", uk: "клавіатура", ar: "لوحة مفاتيح", ka: "კლავიატურა", fr: "clavier" },
  { level: "A2", es: "mando", en: "remote control", uk: "пульт", ar: "جهاز تحكم عن بعد", ka: "პულტი", fr: "télécommande" },
  { level: "B1", es: "algoritmo", en: "algorithm", uk: "алгоритм", ar: "خوارزمية", ka: "ალგორითმი", fr: "algorithme" },
  { level: "A2", es: "código", en: "code", uk: "код", ar: "شفرة", ka: "კოდი", fr: "code" },
  { level: "A2", es: "programa", en: "program", uk: "програма", ar: "برنامج", ka: "პროგრამა", fr: "programme" },
  { level: "A2", es: "dato", en: "data (piece of)", uk: "дані", ar: "بيانات", ka: "მონაცემი", fr: "donnée" },
  { level: "B1", es: "servidor", en: "server", uk: "сервер", ar: "خادم", ka: "სერვერი", fr: "serveur" },
  { level: "B1", es: "enlace", en: "link", uk: "посилання", ar: "رابط", ka: "ბმული", fr: "lien" },
  { level: "A2", es: "sistema", en: "system", uk: "система", ar: "نظام", ka: "სისტემა", fr: "système" },
  { level: "A2", es: "función", en: "function", uk: "функція", ar: "وظيفة", ka: "ფუნქცია", fr: "fonction" },
  { level: "B1", es: "variable", en: "variable", uk: "змінна", ar: "متغير", ka: "ცვლადი", fr: "variable" },
  { level: "B1", es: "constante", en: "constant", uk: "константа", ar: "ثابت", ka: "მუდმივა", fr: "constante" },
  { level: "B1", es: "ecuación", en: "equation", uk: "рівняння", ar: "معادلة", ka: "განტოლება", fr: "équation" },
  { level: "A2", es: "fórmula", en: "formula", uk: "формула", ar: "صيغة", ka: "ფორმულა", fr: "formule" },
  { level: "B1", es: "teorema", en: "theorem", uk: "теорема", ar: "مبرهنة", ka: "თეორემა", fr: "théorème" },
  { level: "B2", es: "axioma", en: "axiom", uk: "аксіома", ar: "بديهية", ka: "აქსიომა", fr: "axiome" },
  { level: "B1", es: "tesis", en: "thesis", uk: "теза", ar: "أطروحة", ka: "თეზისი", fr: "thèse" },
  { level: "B2", es: "síntesis", en: "synthesis", uk: "синтез", ar: "توليف", ka: "სინთეზი", fr: "synthèse" },
  { level: "B1", es: "premisa", en: "premise", uk: "передумова", ar: "مقدمة منطقية", ka: "წანამძღვარი", fr: "prémisse" },
  { level: "B1", es: "postura", en: "stance", uk: "позиція", ar: "موقف", ka: "პოზიცია", fr: "position" },
  { level: "B1", es: "criterio", en: "criterion", uk: "критерій", ar: "معيار", ka: "კრიტერიუმი", fr: "critère" },
  { level: "B2", es: "fallo", en: "ruling", uk: "постанова", ar: "قرار قضائي", ka: "სასამართლო გადაწყვეტა", fr: "jugement" },
  { level: "A2", es: "multa", en: "fine", uk: "штраф", ar: "غرامة", ka: "ჯარიმა", fr: "amende" },
  { level: "B1", es: "infracción", en: "infraction", uk: "порушення", ar: "مخالفة", ka: "წესის დარღვევა", fr: "infraction" },
  { level: "A2", es: "crimen", en: "serious crime", uk: "тяжкий злочин", ar: "جريمة خطيرة", ka: "მძიმე დანაშაული", fr: "crime" },
  { level: "B1", es: "acusado", en: "defendant", uk: "обвинувачений", ar: "متهم", ka: "ბრალდებული", fr: "accusé" },
  { level: "B1", es: "fiscal", en: "prosecutor", uk: "прокурор", ar: "مدعٍ عام", ka: "პროკურორი", fr: "procureur" },
  { level: "B1", es: "jurado", en: "jury", uk: "присяжні", ar: "هيئة محلفين", ka: "ჟიური", fr: "jury" },
  { level: "B1", es: "pleito", en: "lawsuit", uk: "судова тяжба", ar: "قضية", ka: "სასამართლო დავა", fr: "litige" },
  { level: "B1", es: "demanda", en: "claim", uk: "позов", ar: "دعوى", ka: "სარჩელი", fr: "action en justice" },
  { level: "B2", es: "querella", en: "formal complaint", uk: "судова скарга", ar: "شكوى قضائية", ka: "სასამართლო საჩივარი", fr: "plainte pénale" },
  { level: "B1", es: "apelación", en: "appeal", uk: "апеляція", ar: "استئناف", ka: "გასაჩივრება", fr: "recours" },
  { level: "B2", es: "fianza", en: "bail", uk: "застава", ar: "كفالة", ka: "გირაო", fr: "caution" },
  { level: "B2", es: "indulto", en: "pardon", uk: "помилування", ar: "عفو", ka: "შეწყალება", fr: "grâce" },
  { level: "B2", es: "amnistía", en: "amnesty", uk: "амністія", ar: "عفو عام", ka: "ამნისტია", fr: "amnistie" },
  { level: "B1", es: "acatar", en: "to abide by", uk: "дотримуватися", ar: "يمتثل لـ", ka: "მორჩილება", fr: "respecter" },
  { level: "B1", es: "infringir", en: "to infringe", uk: "порушувати", ar: "ينتهك", ka: "წესის დაუცველობა", fr: "enfreindre" },
  { level: "B2", es: "transgredir", en: "to transgress", uk: "переступати", ar: "يتجاوز", ka: "გადაცილება", fr: "transgresser" },
  { level: "B2", es: "promulgar", en: "to enact", uk: "запроваджувати", ar: "يسن قانونًا", ka: "გამოცემა", fr: "promulguer" },
  { level: "B2", es: "derogar", en: "to repeal", uk: "відміняти", ar: "يبطل", ka: "გაუქმება", fr: "abroger" },
  { level: "B1", es: "ratificar", en: "to ratify", uk: "ратифікувати", ar: "يصادق على", ka: "რატიფიცირება", fr: "ratifier" },
  { level: "B1", es: "rectificar", en: "to rectify", uk: "виправляти", ar: "يصحح", ka: "გასწორება", fr: "rectifier" },
  { level: "B2", es: "enmendar", en: "to amend", uk: "вносити поправки", ar: "يعدل", ka: "შესწორების შეტანა", fr: "amender" },
  { level: "B1", es: "certificar", en: "to certify", uk: "засвідчувати", ar: "يشهد بصحة", ka: "სერტიფიცირება", fr: "certifier" },
  { level: "B2", es: "autenticar", en: "to authenticate", uk: "підтверджувати справжність", ar: "يوثق", ka: "ავთენტიფიკაცია", fr: "authentifier" },
  { level: "B1", es: "falsificar", en: "to falsify", uk: "підробляти", ar: "يزور", ka: "გაყალბება", fr: "falsifier" },
  { level: "B2", es: "plagiar", en: "to plagiarize", uk: "плагіатити", ar: "ينتحل", ka: "პლაგიატის ჩადენა", fr: "plagier" },
  { level: "B2", es: "distorsionar", en: "to distort", uk: "спотворювати", ar: "يشوه", ka: "დამახინჯება", fr: "déformer" },
  { level: "C1", es: "tergiversar", en: "to twist (facts)", uk: "перекручувати", ar: "يحرف", ka: "დამახინჯება", fr: "dénaturer" },
  { level: "B1", es: "manipular", en: "to manipulate", uk: "маніпулювати", ar: "يتلاعب بـ", ka: "მანიპულირება", fr: "manipuler" },
  { level: "A2", es: "influir", en: "to influence", uk: "мати вплив", ar: "له تأثير", ka: "გავლენის ქონა", fr: "influencer" },
  { level: "B1", es: "persuadir", en: "to persuade", uk: "переконувати", ar: "يقنع", ka: "დარწმუნება", fr: "persuader" },
  { level: "B2", es: "disuadir", en: "to dissuade", uk: "відмовляти від", ar: "يثني عن", ka: "გადათქმევინება", fr: "dissuader" },
  { level: "B1", es: "incitar", en: "to incite", uk: "підбурювати", ar: "يحرض", ka: "წაქეზება", fr: "inciter" },
  { level: "A2", es: "provocar", en: "to provoke", uk: "провокувати", ar: "يستفز", ka: "პროვოცირება", fr: "provoquer" },
  { level: "B2", es: "instigar", en: "to instigate", uk: "спонукати", ar: "يؤلب", ka: "აქეზება", fr: "instiguer" },
  { level: "B1", es: "reprimir", en: "to repress", uk: "придушувати", ar: "يقمع", ka: "ჩახშობა", fr: "réprimer" },
  { level: "B1", es: "oprimir", en: "to oppress", uk: "гнобити", ar: "يضطهد", ka: "ჩაგვრა", fr: "opprimer" },
  { level: "B1", es: "someter", en: "to subject (to)", uk: "підкоряти", ar: "يُخضع", ka: "დაქვემდებარება", fr: "soumettre" },
  { level: "B2", es: "doblegar", en: "to bend (will)", uk: "зламати волю", ar: "يُذلل", ka: "ნების გატეხვა", fr: "faire plier" },
  { level: "A2", es: "ceder", en: "to yield", uk: "поступатися", ar: "يتنازل", ka: "დათმობა", fr: "céder" },
  { level: "C1", es: "claudicar", en: "to capitulate", uk: "капітулювати", ar: "يستسلم", ka: "კაპიტულაცია", fr: "capituler" },
  { level: "B1", es: "renunciar", en: "to renounce", uk: "відмовлятися від", ar: "يتنازل عن", ka: "უარის თქმა", fr: "renoncer" },
  { level: "B1", es: "dimitir", en: "to resign", uk: "подавати у відставку", ar: "يستقيل", ka: "გადადგომა", fr: "démissionner" },
  { level: "B2", es: "abdicar", en: "to abdicate", uk: "зрікатися престолу", ar: "يتنازل عن العرش", ka: "ტახტზე უარის თქმა", fr: "abdiquer" },
  { level: "B2", es: "destituir", en: "to remove from office", uk: "усувати з посади", ar: "يعزل", ka: "თანამდებობიდან გადაყენება", fr: "destituer" },
  { level: "B1", es: "expulsar", en: "to expel", uk: "виганяти", ar: "يطرد", ka: "გაძევება", fr: "expulser" },
  { level: "B2", es: "desterrar", en: "to banish", uk: "засилати", ar: "ينفي", ka: "გადასახლება", fr: "bannir" },
  { level: "B2", es: "exiliar", en: "to exile", uk: "відправляти у вигнання", ar: "يرحل إلى المنفى", ka: "იძულებით გადასახლება", fr: "exiler" },
  { level: "B2", es: "repatriar", en: "to repatriate", uk: "репатріювати", ar: "يعيد إلى الوطن", ka: "რეპატრიაცია", fr: "rapatrier" },
  { level: "A2", es: "emigrar", en: "to emigrate", uk: "емігрувати", ar: "يهاجر", ka: "ემიგრაცია", fr: "émigrer" },
  { level: "A2", es: "inmigrar", en: "to immigrate", uk: "імігрувати", ar: "يهاجر إلى", ka: "იმიგრაცია", fr: "immigrer" },
  { level: "B2", es: "peregrinar", en: "to go on a pilgrimage", uk: "здійснювати паломництво", ar: "يحج", ka: "მოლოცვა", fr: "faire un pèlerinage" },
  { level: "B1", es: "deambular", en: "to wander", uk: "блукати", ar: "يتجول بلا هدف", ka: "უმიზნოდ სიარული", fr: "déambuler" },
  { level: "A2", es: "vagar", en: "to roam", uk: "бродити", ar: "يهيم", ka: "წანწალი", fr: "errer" },
  { level: "B2", es: "merodear", en: "to prowl", uk: "никати", ar: "يتسكع", ka: "ტრიალი", fr: "rôder" },
  { level: "B1", es: "patrullar", en: "to patrol", uk: "патрулювати", ar: "يقوم بدورية", ka: "პატრულირება", fr: "patrouiller" },
  { level: "A2", es: "vigilar", en: "to monitor", uk: "наглядати", ar: "يراقب", ka: "თვალყურის დევნება", fr: "surveiller" },
  { level: "B1", es: "custodiar", en: "to guard", uk: "охороняти", ar: "يحرس", ka: "დაცვა", fr: "garder" },
  { level: "B2", es: "salvaguardar", en: "to safeguard", uk: "убезпечувати", ar: "يصون", ka: "დაცვის უზრუნველყოფა", fr: "sauvegarder" },
  { level: "B2", es: "blindar", en: "to armor", uk: "бронювати", ar: "يدرع", ka: "ჯავშნით დაცვა", fr: "blinder" },
  { level: "B1", es: "reforzar", en: "to reinforce", uk: "посилювати", ar: "يعزز", ka: "გაძლიერება", fr: "renforcer" },
  { level: "B1", es: "consolidar", en: "to consolidate", uk: "зміцнювати", ar: "يوطد", ka: "განმტკიცება", fr: "consolider" },
  { level: "B2", es: "afianzar", en: "to strengthen", uk: "закріплювати", ar: "يدعم", ka: "გამყარება", fr: "affermir" },
  { level: "B2", es: "cimentar", en: "to cement (figurative)", uk: "закладати основу", ar: "يؤسس", ka: "საფუძვლის ჩაყრა", fr: "cimenter" },
  { level: "B2", es: "erigir", en: "to erect", uk: "зводити", ar: "يشيد", ka: "აღმართვა", fr: "ériger" },
  { level: "B1", es: "edificar", en: "to build", uk: "будувати", ar: "يبني", ka: "აშენება", fr: "édifier" },
  { level: "B1", es: "demoler", en: "to demolish", uk: "зносити", ar: "يهدم", ka: "ნგრევა", fr: "démolir" },
  { level: "B1", es: "derribar", en: "to knock down", uk: "валити", ar: "يسقط", ka: "დამხობა", fr: "abattre" },
  { level: "B2", es: "colapsar", en: "to collapse", uk: "руйнуватися", ar: "ينهار", ka: "ჩამონგრევა", fr: "s'effondrer" },
  { level: "B2", es: "desmoronar", en: "to crumble", uk: "розсипатися", ar: "يتفتت", ka: "დაშლა", fr: "s'effriter" },
  { level: "B2", es: "desintegrar", en: "to disintegrate", uk: "розпадатися", ar: "يتفكك", ka: "დეზინტეგრაცია", fr: "désintégrer" },
  { level: "B1", es: "disolver", en: "to dissolve", uk: "розчиняти", ar: "يذيب", ka: "გახსნა", fr: "dissoudre" },
  { level: "B1", es: "evaporar", en: "to evaporate", uk: "випаровувати", ar: "يتبخر", ka: "აორთქლება", fr: "évaporer" },
  { level: "B1", es: "condensar", en: "to condense", uk: "конденсувати", ar: "يتكاثف", ka: "კონდენსაცია", fr: "condenser" },
  { level: "C1", es: "petrificar", en: "to petrify", uk: "скам'яніти", ar: "يتحجر", ka: "გაქვავება", fr: "pétrifier" },
  { level: "A2", es: "congelar", en: "to freeze", uk: "заморожувати", ar: "يجمد", ka: "გაყინვა", fr: "geler" },
  { level: "A2", es: "derretir", en: "to melt", uk: "топити", ar: "يذيب", ka: "დნობა", fr: "fondre" },
  { level: "B1", es: "fundir", en: "to smelt", uk: "плавити", ar: "يصهر", ka: "შედნობა", fr: "faire fondre" },
  { level: "B2", es: "disipar", en: "to dissipate", uk: "розсіювати", ar: "يبدد", ka: "გაფანტვა", fr: "dissiper" },
  { level: "B1", es: "esparcir", en: "to scatter", uk: "розкидати", ar: "ينثر", ka: "მიმოფანტვა", fr: "éparpiller" },
  { level: "B2", es: "diseminar", en: "to disseminate", uk: "розповсюджувати", ar: "ينشر", ka: "გავრცელება", fr: "disséminer" },
  { level: "B1", es: "propagar", en: "to propagate", uk: "поширювати", ar: "يعمم", ka: "გავრცობა", fr: "propager" },
  { level: "B1", es: "difundir", en: "to broadcast", uk: "оприлюднювати", ar: "يذيع", ka: "მაუწყებლობა", fr: "diffuser" },
  { level: "B1", es: "divulgar", en: "to divulge", uk: "розкривати", ar: "يفشي", ka: "გამჟღავნება", fr: "divulguer" },
  { level: "B1", es: "minucioso", en: "meticulous", uk: "детальний", ar: "دقيق للغاية", ka: "საფუძვლიანი", fr: "minutieux" },
  { level: "B1", es: "metódico", en: "methodical", uk: "методичний", ar: "منهجي", ka: "მეთოდური", fr: "méthodique" },
  { level: "B1", es: "meticuloso", en: "painstaking", uk: "прискіпливий", ar: "حريص على التفاصيل", ka: "ზედმიწევნითი", fr: "méticuleux" },
  { level: "B2", es: "escrupuloso", en: "scrupulous", uk: "скрупульозний", ar: "نزيه تمامًا", ka: "კეთილსინდისიერი", fr: "scrupuleux" },
  { level: "B1", es: "impecable", en: "impeccable", uk: "бездоганний", ar: "لا تشوبه شائبة", ka: "უზადო", fr: "impeccable" },
  { level: "B2", es: "intachable", en: "irreproachable", uk: "незаплямований", ar: "لا غبار عليه", ka: "უცოდველი", fr: "irréprochable" },
  { level: "A2", es: "ejemplar", en: "exemplary", uk: "зразковий", ar: "مثالي", ka: "სანიმუშო", fr: "exemplaire" },
  { level: "B2", es: "modélico", en: "model", uk: "показовий", ar: "نموذجي", ka: "მოდელური", fr: "modèle" },
  { level: "B2", es: "nefasto", en: "disastrous (ominous)", uk: "згубний", ar: "مشؤوم", ka: "საბედისწერო", fr: "néfaste" },
  { level: "B1", es: "desastroso", en: "disastrous", uk: "жахливий", ar: "فادح", ka: "საშინელი", fr: "désastreux" },
  { level: "B1", es: "catastrófico", en: "catastrophic", uk: "катастрофічний", ar: "كارثي", ka: "კატასტროფული", fr: "catastrophique" },
  { level: "A2", es: "trágico", en: "tragic", uk: "трагічний", ar: "مأساوي", ka: "ტრაგიკული", fr: "tragique" },
  { level: "A2", es: "dramático", en: "dramatic", uk: "драматичний", ar: "درامي", ka: "დრამატული", fr: "dramatique" },
  { level: "B1", es: "patético", en: "pathetic", uk: "жалюгідний", ar: "مثير للشفقة", ka: "საცოდავი", fr: "pathétique" },
  { level: "B1", es: "hilarante", en: "hilarious", uk: "кумедний", ar: "مضحك جدًا", ka: "სასაცილო", fr: "hilarant" },
  { level: "A2", es: "cómico", en: "comic", uk: "комічний", ar: "هزلي", ka: "კომიკური", fr: "comique" },
  { level: "B1", es: "satírico", en: "satirical", uk: "сатиричний", ar: "ساخر", ka: "სატირული", fr: "satirique" },
  { level: "B2", es: "sarcástico", en: "sarcastic", uk: "саркастичний", ar: "لاذع السخرية", ka: "სარკასტული", fr: "sarcastique" },
  { level: "B2", es: "mordaz", en: "biting (caustic)", uk: "їдкий", ar: "حاد", ka: "მჭრელი", fr: "mordant" },
  { level: "B1", es: "incisivo", en: "incisive", uk: "гострий", ar: "حاد الفكر", ka: "ბასრი", fr: "incisif" },
  { level: "B2", es: "punzante", en: "sharp (piercing)", uk: "колючий", ar: "حارق", ka: "წვეტიანი", fr: "cinglant" },
  { level: "B1", es: "penetrante", en: "penetrating", uk: "проникливий", ar: "ثاقب", ka: "შემჭრელი", fr: "pénétrant" },
  { level: "A2", es: "sutil", en: "subtle", uk: "тонкий", ar: "خفي", ka: "დახვეწილი", fr: "subtil" },
  { level: "B2", es: "imperceptible", en: "imperceptible", uk: "непомітний", ar: "غير محسوس", ka: "შეუმჩნეველი", fr: "imperceptible" },
  { level: "B2", es: "ostentoso", en: "ostentatious", uk: "показний", ar: "استعراضي", ka: "მოჩვენებითი", fr: "ostentatoire" },
  { level: "B1", es: "vistoso", en: "showy", uk: "яскравий", ar: "لافت للنظر", ka: "თვალშისაცემი", fr: "voyant" },
  { level: "B1", es: "extravagante", en: "extravagant", uk: "екстравагантний", ar: "متكلف", ka: "ექსტრავაგანტული", fr: "extravagant" },
  { level: "C1", es: "estrafalario", en: "outlandish", uk: "дивакуватий", ar: "غريب الشكل", ka: "უცნაური", fr: "farfelu" },
  { level: "B1", es: "excéntrico", en: "eccentric", uk: "ексцентричний", ar: "غريب الأطوار", ka: "ექსცენტრიული", fr: "excentrique" },
  { level: "B2", es: "insólito", en: "unusual (striking)", uk: "незвичний", ar: "غير مألوف", ka: "იშვიათი", fr: "insolite" },
  { level: "A2", es: "inusual", en: "unusual", uk: "нетиповий", ar: "غير معتاد", ka: "უჩვეულო", fr: "inhabituel" },
  { level: "B1", es: "atípico", en: "atypical", uk: "атиповий", ar: "غير نمطي", ka: "არატიპური", fr: "atypique" },
  { level: "B1", es: "singular", en: "singular (unique)", uk: "особливий", ar: "فريد", ka: "განსაკუთრებული", fr: "singulier" },
  { level: "B1", es: "peculiar", en: "peculiar", uk: "своєрідний", ar: "خاص", ka: "თავისებური", fr: "particulier" },
  { level: "B1", es: "inherente", en: "inherent", uk: "притаманний", ar: "متأصل", ka: "დამახასიათებელი", fr: "inhérent" },
  { level: "C1", es: "extrínseco", en: "extrinsic", uk: "зовнішній", ar: "خارجي", ka: "გარეგანი", fr: "extrinsèque" },
  { level: "C1", es: "tangencial", en: "tangential", uk: "дотичний", ar: "هامشي", ka: "მხებითი", fr: "tangentiel" },
  { level: "B1", es: "periférico", en: "peripheral", uk: "периферійний", ar: "محيطي", ka: "პერიფერიული", fr: "périphérique" },
  { level: "B2", es: "colateral", en: "collateral (side)", uk: "побічний", ar: "جانبي", ka: "გვერდითი", fr: "collatéral" },
  { level: "B2", es: "sincrónico", en: "synchronous", uk: "синхронний", ar: "متزامن", ka: "სინქრონული", fr: "synchrone" },
  { level: "B2", es: "asincrónico", en: "asynchronous", uk: "асинхронний", ar: "غير متزامن", ka: "ასინქრონული", fr: "asynchrone" },
  { level: "C1", es: "anacrónico", en: "anachronistic", uk: "анахронічний", ar: "شاذ زمنيًا", ka: "ანაქრონული", fr: "anachronique" },
  { level: "B2", es: "obsoleto", en: "obsolete", uk: "застарілий", ar: "عفا عليه الزمن", ka: "მოძველებული", fr: "obsolète" },
  { level: "B2", es: "arcaico", en: "archaic", uk: "архаїчний", ar: "قديم الطراز", ka: "არქაული", fr: "archaïque" },
  { level: "B1", es: "rudimentario", en: "rudimentary", uk: "примітивний", ar: "بدائي", ka: "პრიმიტიული", fr: "rudimentaire" },
  { level: "A2", es: "sofisticado", en: "sophisticated", uk: "витончений", ar: "متطور", ka: "სოფისტიკირებული", fr: "sophistiqué" },
  { level: "B2", es: "vanguardista", en: "avant-garde", uk: "авангардний", ar: "طليعي", ka: "ავანგარდული", fr: "avant-gardiste" },
  { level: "A2", es: "pionero", en: "pioneering", uk: "новаторський", ar: "رائد", ka: "პიონერული", fr: "pionnier" },
  { level: "B1", es: "novedoso", en: "novel (new)", uk: "новітній", ar: "مبتكر", ka: "ახლებური", fr: "novateur" },
  { level: "B2", es: "inédito", en: "unprecedented", uk: "невиданий", ar: "غير مسبوق", ka: "უპრეცედენტო", fr: "inédit" },
  { level: "C1", es: "inaudito", en: "unheard-of", uk: "нечуваний", ar: "غير مسموع به", ka: "არასდროს გაგონილი", fr: "inouï" },
  { level: "A2", es: "fabuloso", en: "fabulous", uk: "казковий", ar: "رائع", ka: "ზღაპრული", fr: "fabuleux" },
  { level: "B2", es: "prodigioso", en: "prodigious", uk: "надзвичайний", ar: "عجيب", ka: "საკვირველი", fr: "prodigieux" },
  { level: "B1", es: "fenomenal", en: "phenomenal", uk: "феноменальний", ar: "خارق للعادة", ka: "ფენომენალური", fr: "phénoménal" },
  { level: "B1", es: "formidable", en: "formidable", uk: "потужний", ar: "هائل", ka: "შთამბეჭდავი", fr: "formidable" },
  { level: "B1", es: "colosal", en: "colossal", uk: "колосальний", ar: "هائل الحجم", ka: "კოლოსალური", fr: "colossal" },
  { level: "B2", es: "monumental", en: "monumental", uk: "монументальний", ar: "ضخم جدًا", ka: "მონუმენტური", fr: "monumental" },
  { level: "B2", es: "titánico", en: "titanic", uk: "титанічний", ar: "جبار", ka: "ტიტანური", fr: "titanesque" },
  { level: "A2", es: "gigantesco", en: "gigantic", uk: "гігантський", ar: "عملاق", ka: "გიგანტური", fr: "gigantesque" },
  { level: "A2", es: "minúsculo", en: "tiny", uk: "крихітний", ar: "صغير جدًا", ka: "წვრილი", fr: "minuscule" },
  { level: "B1", es: "microscópico", en: "microscopic", uk: "мікроскопічний", ar: "مجهري", ka: "მიკროსკოპული", fr: "microscopique" },
  { level: "C1", es: "nanométrico", en: "nanometric", uk: "нанометровий", ar: "بمقياس النانو", ka: "ნანომეტრული", fr: "nanométrique" },
  { level: "B1", es: "ilimitado", en: "unlimited", uk: "необмежений", ar: "غير محدود", ka: "შეუზღუდავი", fr: "illimité" },
  { level: "B2", es: "incalculable", en: "incalculable", uk: "незліченний", ar: "لا يُحصى", ka: "გამოუთვლელი", fr: "incalculable" },
  { level: "B2", es: "inestimable", en: "inestimable", uk: "неоціненний", ar: "لا يُقدَّر بثمن", ka: "ფასდაუდებელი", fr: "inestimable" },
  { level: "C1", es: "insondable", en: "unfathomable", uk: "незбагненний", ar: "لا يُسبر غوره", ka: "გამოუცნობი", fr: "insondable" },
  { level: "C2", es: "indefectiblemente", en: "unfailingly", uk: "неодмінно", ar: "لا محالة", ka: "შეუცვლელად", fr: "immanquablement" },
  { level: "C1", es: "inexorablemente", en: "inexorably", uk: "невблаганно", ar: "بلا هوادة", ka: "შეუბრალებლად", fr: "inexorablement" },
  { level: "C1", es: "irremediablemente", en: "irremediably", uk: "безнадійно", ar: "بلا رجعة", ka: "გამოუსწორებლად", fr: "irrémédiablement" },
  { level: "C1", es: "irrevocablemente", en: "irrevocably", uk: "безповоротно", ar: "بشكل لا رجعة فيه", ka: "შეუქცევლად", fr: "irrévocablement" },
  { level: "C1", es: "ineludiblemente", en: "unavoidably", uk: "невідворотно", ar: "لا مفر منه", ka: "აუცილებლად", fr: "inéluctablement" },
  { level: "B2", es: "impunemente", en: "with impunity", uk: "безкарно", ar: "بلا عقاب", ka: "დაუსჯელად", fr: "impunément" },
  { level: "B1", es: "inadvertidamente", en: "inadvertently", uk: "ненавмисно", ar: "دون انتباه", ka: "შეუმჩნევლად", fr: "par inadvertance" },
  { level: "B2", es: "notoriamente", en: "notoriously", uk: "явно", ar: "على نحو مشهود", ka: "ცნობილად", fr: "notoirement" },
  { level: "C2", es: "palmariamente", en: "manifestly (rare)", uk: "явним чином", ar: "بجلاء", ka: "ცხადად", fr: "à l'évidence" },
  { level: "B2", es: "ostensiblemente", en: "ostensibly", uk: "вочевидь", ar: "ظاهريًا", ka: "მოჩვენებით", fr: "ostensiblement" },
  { level: "B2", es: "manifiestamente", en: "manifestly", uk: "очевидним чином", ar: "بوضوح تام", ka: "ცხადად", fr: "manifestement" },
  { level: "B1", es: "implícitamente", en: "implicitly", uk: "неявно", ar: "ضمنيًا", ka: "ირიბად", fr: "implicitement" },
  { level: "B2", es: "tácitamente", en: "tacitly", uk: "мовчазно", ar: "بصمت", ka: "ჩუმად", fr: "tacitement" },
  { level: "B1", es: "explícitamente", en: "explicitly", uk: "виразно", ar: "بوضوح صريح", ka: "გარკვევით", fr: "explicitement" },
  { level: "B1", es: "expresamente", en: "expressly", uk: "недвозначно", ar: "بشكل صريح", ka: "ნათლად", fr: "expressément" },
  { level: "B1", es: "a propósito", en: "on purpose", uk: "з наміром", ar: "بقصد", ka: "მიზნით", fr: "volontairement" },
  { level: "B1", es: "espontáneamente", en: "spontaneously", uk: "спонтанно", ar: "بعفوية", ka: "სპონტანურად", fr: "spontanément" },
  { level: "B1", es: "impulsivamente", en: "impulsively", uk: "імпульсивно", ar: "باندفاع", ka: "იმპულსურად", fr: "impulsivement" },
  { level: "B1", es: "intuitivamente", en: "intuitively", uk: "інтуїтивно", ar: "بالحدس", ka: "ინტუიციურად", fr: "intuitivement" },
  { level: "B1", es: "instintivamente", en: "instinctively", uk: "інстинктивно", ar: "غريزيًا", ka: "ინსტინქტურად", fr: "instinctivement" },
  { level: "B1", es: "racionalmente", en: "rationally", uk: "раціонально", ar: "عقلانيًا", ka: "რაციონალურად", fr: "rationnellement" },
  { level: "B1", es: "lógicamente", en: "logically", uk: "логічно", ar: "منطقيًا", ka: "ლოგიკურად", fr: "logiquement" },
  { level: "B2", es: "incoherentemente", en: "incoherently", uk: "беззв'язно", ar: "بشكل غير مترابط", ka: "შეუსაბამოდ", fr: "incohéremment" },
  { level: "B1", es: "absurdamente", en: "absurdly", uk: "абсурдно", ar: "بشكل عبثي", ka: "აბსურდულად", fr: "absurdement" },
  { level: "B1", es: "ridículamente", en: "ridiculously", uk: "смішно", ar: "بشكل سخيف", ka: "სასაცილოდ", fr: "ridiculement" },
  { level: "C1", es: "desmedidamente", en: "inordinately", uk: "непомірно", ar: "بإفراط شديد", ka: "ზომაზე მეტად", fr: "démesurément" },
  { level: "B1", es: "moderadamente", en: "moderately", uk: "помірно", ar: "باعتدال", ka: "ზომიერად", fr: "modérément" },
  { level: "B2", es: "escalonadamente", en: "in stages", uk: "ступенево", ar: "على مراحل", ka: "ეტაპობრივად", fr: "par étapes" },
  { level: "B1", es: "sucesivamente", en: "successively", uk: "послідовно", ar: "تباعًا", ka: "თანმიმდევრობით", fr: "successivement" },
  { level: "B2", es: "alternativamente", en: "alternately", uk: "почергово", ar: "بالتناوب", ka: "მონაცვლეობით", fr: "alternativement" },
  { level: "B1", es: "mutuamente", en: "mutually", uk: "взаємно", ar: "بشكل متبادل", ka: "ორმხრივად", fr: "mutuellement" },
  { level: "B2", es: "recíprocamente", en: "reciprocally", uk: "обопільно", ar: "بالمثل", ka: "საპასუხოდ", fr: "réciproquement" },
  { level: "B1", es: "conjuntamente", en: "jointly", uk: "спільно", ar: "بشكل مشترك", ka: "ერთობლივად", fr: "conjointement" },
  { level: "B1", es: "colectivamente", en: "collectively", uk: "колективно", ar: "بشكل جماعي", ka: "კოლექტიურად", fr: "collectivement" },
  { level: "A2", es: "individualmente", en: "individually", uk: "індивідуально", ar: "بشكل فردي", ka: "ინდივიდუალურად", fr: "individuellement" },
  { level: "B1", es: "respectivamente", en: "respectively", uk: "відповідно", ar: "على التوالي", ka: "შესაბამისად", fr: "respectivement" },
  { level: "B2", es: "correspondientemente", en: "correspondingly", uk: "відповідним чином", ar: "تبعًا لذلك", ka: "შესატყვისად", fr: "de manière correspondante" },
  { level: "B1", es: "proporcionalmente", en: "proportionally", uk: "пропорційно", ar: "بشكل متناسب", ka: "პროპორციულად", fr: "proportionnellement" },
  { level: "B2", es: "equitativamente", en: "equitably", uk: "справедливо", ar: "بإنصاف", ka: "სამართლიანად", fr: "équitablement" },
  { level: "B1", es: "unánimemente", en: "unanimously", uk: "одностайно", ar: "بالإجماع", ka: "ერთხმად", fr: "unanimement" },
  { level: "B1", es: "relativamente", en: "relatively", uk: "відносно", ar: "نسبيًا", ka: "შედარებით", fr: "relativement" },
  { level: "B2", es: "comparativamente", en: "comparatively", uk: "порівняно", ar: "مقارنةً", ka: "შედარებისას", fr: "comparativement" },
  { level: "B2", es: "preferentemente", en: "preferably", uk: "переважно", ar: "تفضيليًا", ka: "უპირატესად", fr: "préférentiellement" },
  { level: "C1", es: "prioritariamente", en: "as a priority", uk: "першочергово", ar: "على سبيل الأولوية", ka: "პრიორიტეტულად", fr: "prioritairement" },
  { level: "B1", es: "esencialmente", en: "essentially", uk: "сутнісно", ar: "جوهريًا", ka: "არსებითად", fr: "essentiellement" },
  { level: "B1", es: "fundamentalmente", en: "fundamentally", uk: "фундаментально", ar: "في الأساس", ka: "ფუძემდებლურად", fr: "fondamentalement" },
  { level: "B1", es: "auténticamente", en: "authentically", uk: "по-справжньому", ar: "بشكل أصيل", ka: "ავთენტურად", fr: "authentiquement" },
  { level: "B2", es: "genuinamente", en: "genuinely", uk: "по-справжньому", ar: "بشكل حقيقي", ka: "ნამდვილად", fr: "véritablement" },
  { level: "B1", es: "fielmente", en: "faithfully", uk: "вірно", ar: "بإخلاص", ka: "ერთგულად", fr: "fidèlement" },
  { level: "B2", es: "grosso modo", en: "roughly speaking", uk: "грубо кажучи", ar: "بشكل تقريبي", ka: "უხეშად რომ ვთქვათ", fr: "grosso modo" },
  { level: "B2", es: "a priori", en: "a priori", uk: "апріорі", ar: "بداهةً", ka: "აპრიორი", fr: "a priori" },
  { level: "B2", es: "a posteriori", en: "a posteriori", uk: "апостеріорі", ar: "بعديًا", ka: "აპოსტერიორი", fr: "a posteriori" },
  { level: "B1", es: "de facto", en: "de facto", uk: "де-факто", ar: "بحكم الأمر الواقع", ka: "დე ფაქტო", fr: "de facto" },
  { level: "B2", es: "de jure", en: "de jure", uk: "де-юре", ar: "بحكم القانون", ka: "დე იურე", fr: "de jure" },
  { level: "B1", es: "en efecto", en: "indeed", uk: "дійсно", ar: "بالفعل", ka: "მართლაც", fr: "en effet" },
  { level: "A2", es: "sin embargo", en: "however", uk: "проте", ar: "لكن", ka: "თუმცა", fr: "cependant" },
  { level: "B1", es: "no obstante", en: "nevertheless", uk: "незважаючи на це", ar: "مع ذلك", ka: "მიუხედავად ამისა", fr: "néanmoins" },
  { level: "B1", es: "por consiguiente", en: "consequently", uk: "отже", ar: "بالتالي", ka: "აქედან გამომდინარე", fr: "par conséquent" },
  { level: "B2", es: "por ende", en: "hence", uk: "тому", ar: "لذلك", ka: "ამიტომ", fr: "de ce fait" },
  { level: "A2", es: "en cambio", en: "on the other hand", uk: "натомість", ar: "في المقابل", ka: "სამაგიეროდ", fr: "en revanche" },
  { level: "A2", es: "faro", en: "lighthouse", uk: "маяк", ar: "منارة", ka: "შუქურა", fr: "phare" },
  { level: "A2", es: "ancla", en: "anchor", uk: "якір", ar: "مرساة", ka: "ღუზა", fr: "ancre" },
  { level: "B1", es: "timón", en: "helm", uk: "стерно", ar: "دفة", ka: "სამართველო", fr: "gouvernail" },
  { level: "A2", es: "vela", en: "sail", uk: "вітрило", ar: "شراع", ka: "იალქანი", fr: "voile" },
  { level: "B1", es: "cubierta", en: "deck", uk: "палуба", ar: "سطح السفينة", ka: "გემბანი", fr: "pont" },
  { level: "A2", es: "cohete", en: "rocket", uk: "ракета", ar: "صاروخ", ka: "რაკეტა", fr: "fusée" },
  { level: "A2", es: "satélite", en: "satellite", uk: "супутник", ar: "قمر صناعي", ka: "თანამგზავრი", fr: "satellite" },
  { level: "B1", es: "órbita", en: "orbit", uk: "орбіта", ar: "مدار", ka: "ორბიტა", fr: "orbite" },
  { level: "A2", es: "galaxia", en: "galaxy", uk: "галактика", ar: "مجرة", ka: "გალაქტიკა", fr: "galaxie" },
  { level: "B1", es: "meteoro", en: "meteor", uk: "метеор", ar: "شهاب", ka: "მეტეორი", fr: "météore" },
  { level: "A2", es: "cometa", en: "comet", uk: "комета", ar: "مذنّب", ka: "კომეტა", fr: "comète" },
  { level: "B1", es: "eclipse", en: "eclipse", uk: "затемнення", ar: "كسوف", ka: "დაბნელება", fr: "éclipse" },
  { level: "B1", es: "cráter", en: "crater", uk: "кратер", ar: "فوهة", ka: "კრატერი", fr: "cratère" },
  { level: "A2", es: "volcán", en: "volcano", uk: "вулкан", ar: "بركان", ka: "ვულკანი", fr: "volcan" },
  { level: "B1", es: "magma", en: "magma", uk: "магма", ar: "صهارة", ka: "მაგმა", fr: "magma" },
  { level: "A2", es: "lava", en: "lava", uk: "лава", ar: "حمم بركانية", ka: "ლავა", fr: "lave" },
  { level: "B1", es: "sismo", en: "earthquake", uk: "землетрус", ar: "زلزال", ka: "მიწისძვრა", fr: "séisme" },
  { level: "B1", es: "avalancha", en: "avalanche", uk: "лавина", ar: "انهيار جليدي", ka: "ზვავი", fr: "avalanche" },
  { level: "B1", es: "inundación", en: "flood", uk: "повінь", ar: "فيضان", ka: "წყალდიდობა", fr: "inondation" },
  { level: "B1", es: "sequía", en: "drought", uk: "посуха", ar: "جفاف", ka: "გვალვა", fr: "sécheresse" },
  { level: "B1", es: "plaga", en: "pest infestation", uk: "навала", ar: "آفة", ka: "ჭირი", fr: "fléau" },
  { level: "B1", es: "epidemia", en: "epidemic", uk: "епідемія", ar: "وباء", ka: "ეპიდემია", fr: "épidémie" },
  { level: "B1", es: "contagio", en: "contagion", uk: "зараження", ar: "عدوى", ka: "გადამდებლობა", fr: "contagion" },
  { level: "B1", es: "brote", en: "outbreak", uk: "спалах", ar: "تفشي", ka: "გავრცელება", fr: "flambée" },
  { level: "A2", es: "dosis", en: "dose", uk: "доза", ar: "جرعة", ka: "დოზა", fr: "dose" },
  { level: "A2", es: "laboratorio", en: "laboratory", uk: "лабораторія", ar: "مختبر", ka: "ლაბორატორია", fr: "laboratoire" },
  { level: "A2", es: "experimento", en: "experiment", uk: "експеримент", ar: "تجربة", ka: "ექსპერიმენტი", fr: "expérimentation" },
  { level: "B1", es: "patente", en: "patent", uk: "патент", ar: "براءة اختراع", ka: "პატენტი", fr: "brevet" },
  { level: "B1", es: "hallazgo", en: "finding", uk: "знахідка", ar: "عثور", ka: "პოვნა", fr: "trouvaille" },
  { level: "B1", es: "enigma", en: "enigma", uk: "загадка", ar: "لغز", ka: "გამოცანა", fr: "énigme" },
  { level: "B2", es: "utopía", en: "utopia", uk: "утопія", ar: "يوتوبيا", ka: "უტოპია", fr: "utopie" },
  { level: "B2", es: "balbucear", en: "to babble", uk: "белькотіти", ar: "يتلعثم", ka: "ბურტყუნი", fr: "balbutier" },
  { level: "B1", es: "susurrar", en: "to whisper", uk: "шепотіти", ar: "يهمس", ka: "ჩურჩული", fr: "chuchoter" },
  { level: "A2", es: "gritar", en: "to shout", uk: "кричати", ar: "يصرخ", ka: "ყვირილი", fr: "crier" },
  { level: "B1", es: "exclamar", en: "to exclaim", uk: "вигукувати", ar: "يهتف", ka: "შეძახილი", fr: "s'exclamer" },
  { level: "B1", es: "murmurar", en: "to murmur", uk: "бурмотіти", ar: "يدمدم", ka: "ბუტბუტი", fr: "murmurer" },
  { level: "C1", es: "musitar", en: "to mutter", uk: "шепотіти собі під ніс", ar: "يتمتم", ka: "საკუთარ თავზე ლაპარაკი", fr: "marmonner" },
  { level: "B1", es: "tartamudear", en: "to stutter", uk: "заїкатися", ar: "يتأتئ", ka: "ენის დაბმა", fr: "bégayer" },
  { level: "A2", es: "charlar", en: "to chat", uk: "базікати", ar: "يثرثر", ka: "ლაქლაქი", fr: "bavarder" },
  { level: "A2", es: "platicar", en: "to talk", uk: "розмовляти", ar: "يتحدث", ka: "საუბარი", fr: "discuter" },
  { level: "B1", es: "conversar", en: "to converse", uk: "спілкуватися", ar: "يتحادث", ka: "მოსაუბრება", fr: "converser" },
  { level: "B1", es: "debatir", en: "to debate", uk: "дебатувати", ar: "يتناظر", ka: "კამათი", fr: "débattre" },
  { level: "B1", es: "argumentar", en: "to argue a case", uk: "аргументувати", ar: "يجادل", ka: "არგუმენტირება", fr: "argumenter" },
  { level: "B1", es: "razonar", en: "to reason", uk: "міркувати", ar: "يُعلل", ka: "მსჯელობა", fr: "raisonner" },
  { level: "B1", es: "deducir", en: "to deduce", uk: "виводити", ar: "يستنتج", ka: "გამოტანა", fr: "déduire" },
  { level: "B1", es: "inferir", en: "to infer", uk: "виснувати", ar: "يستنبط", ka: "დასკვნის გამოტანა", fr: "inférer" },
  { level: "B2", es: "conjeturar", en: "to conjecture", uk: "припускати", ar: "يحزر", ka: "ვარაუდის გამოთქმა", fr: "conjecturer" },
  { level: "B1", es: "especular", en: "to speculate", uk: "спекулювати", ar: "يتكهن", ka: "სპეკულირება", fr: "spéculer" },
  { level: "B1", es: "contemplar", en: "to contemplate", uk: "споглядати", ar: "يتمعن", ka: "ჭვრეტა", fr: "contempler" },
  { level: "A2", es: "meditar", en: "to meditate", uk: "медитувати", ar: "يتأمل", ka: "მედიტაცია", fr: "méditer" },
  { level: "B1", es: "reflexionar", en: "to reflect", uk: "розмірковувати", ar: "يتدبر", ka: "დაფიქრება", fr: "réfléchir" },
  { level: "C1", es: "cavilar", en: "to brood", uk: "роздумувати", ar: "يفكر مليًا", ka: "ფიქრი", fr: "ruminer" },
  { level: "B2", es: "ponderar", en: "to weigh (options)", uk: "зважувати", ar: "يزن", ka: "აწონვა", fr: "peser" },
  { level: "A2", es: "evaluar", en: "to evaluate", uk: "оцінювати", ar: "يقيّم", ka: "შეფასების გაკეთება", fr: "évaluer" },
  { level: "B1", es: "estimar", en: "to estimate", uk: "прикидати", ar: "يقدّر تقريبيًا", ka: "გათვლა", fr: "estimer" },
  { level: "A2", es: "calcular", en: "to calculate", uk: "рахувати", ar: "يحسب", ka: "გამოთვლა", fr: "calculer" },
  { level: "B2", es: "computar", en: "to compute", uk: "обчислювати", ar: "يحسب آليًا", ka: "დათვლა", fr: "traiter" },
  { level: "B1", es: "pronosticar", en: "to forecast", uk: "прогнозувати", ar: "يتكهن بـ", ka: "პროგნოზირება", fr: "pronostiquer" },
  { level: "B1", es: "predecir", en: "to predict", uk: "пророкувати", ar: "يتوقع حدوث", ka: "წინასწარ თქმა", fr: "prédire" },
  { level: "B2", es: "presagiar", en: "to presage", uk: "віщувати", ar: "ينذر بـ", ka: "მოასწავება", fr: "présager" },
  { level: "B1", es: "intuir", en: "to sense intuitively", uk: "відчувати інтуїтивно", ar: "يحدس", ka: "ინტუიციურად გრძნობა", fr: "pressentir" },
  { level: "C1", es: "locuaz", en: "talkative", uk: "балакучий", ar: "ثرثار", ka: "ლაპარაკიანი", fr: "loquace" },
  { level: "B1", es: "tenaz", en: "tenacious", uk: "завзятий", ar: "مثابر", ka: "გამძლე", fr: "tenace" },
  { level: "B1", es: "perseverante", en: "perseverant", uk: "наполегливий", ar: "دؤوب", ka: "დაუღალავი", fr: "persévérant" },
  { level: "B2", es: "insaciable", en: "insatiable", uk: "ненаситний", ar: "لا يشبع", ka: "უძღები", fr: "insatiable" },
  { level: "B1", es: "voraz", en: "voracious", uk: "прожерливий", ar: "شره", ka: "გაუმაძღარი", fr: "vorace" },
  { level: "B2", es: "indomable", en: "untamable", uk: "нескорений", ar: "جامح", ka: "მოუთვინიერებელი", fr: "indomptable" },
  { level: "A2", es: "rebelde", en: "rebellious", uk: "бунтівний", ar: "متمرد", ka: "ამბოხებული", fr: "rebelle" },
  { level: "B1", es: "sumiso", en: "submissive", uk: "покірний", ar: "خاضع", ka: "დამორჩილებული", fr: "soumis" },
  { level: "A2", es: "obediente", en: "obedient", uk: "слухняний", ar: "مطيع", ka: "მორჩილი", fr: "obéissant" },
  { level: "B1", es: "dócil", en: "docile", uk: "покладистий", ar: "وديع", ka: "დამჯერი", fr: "docile" },
  { level: "B1", es: "obstinado", en: "obstinate", uk: "затятий", ar: "متصلب الرأي", ka: "თავნება", fr: "obstiné" },
  { level: "B1", es: "fugaz", en: "fleeting", uk: "швидкоплинний", ar: "عابر", ka: "წარმავალი", fr: "fugace" },
  { level: "B1", es: "perenne", en: "perennial", uk: "багаторічний", ar: "معمر", ka: "მრავალწლიანი", fr: "pérenne" },
  { level: "B1", es: "duradero", en: "lasting", uk: "тривалий", ar: "دائم", ka: "ხანგრძლივი", fr: "durable" },
  { level: "B1", es: "instantáneo", en: "instantaneous", uk: "миттєвий", ar: "فوري", ka: "მყისიერი", fr: "instantané" },
  { level: "B1", es: "espontáneo", en: "spontaneous", uk: "спонтанний", ar: "عفوي", ka: "სპონტანური", fr: "spontané" },
  { level: "B1", es: "impulsivo", en: "impulsive", uk: "імпульсивний", ar: "متهور", ka: "იმპულსური", fr: "impulsif" },
  { level: "B2", es: "reflexivo", en: "reflective", uk: "вдумливий", ar: "متأمل", ka: "ჩაფიქრებული", fr: "réfléchi" },
  { level: "B1", es: "prudente", en: "prudent", uk: "розсудливий", ar: "رزين", ka: "ზომიერი", fr: "avisé" },
  { level: "B1", es: "francamente", en: "frankly", uk: "прямо", ar: "بصراحة", ka: "პირდაპირ", fr: "franchement" },
  { level: "B1", es: "honestamente", en: "honestly", uk: "чесно", ar: "بأمانة", ka: "პატიოსნად", fr: "honnêtement" },
  { level: "B1", es: "abiertamente", en: "openly", uk: "відкрито", ar: "علنًا", ka: "ღიად", fr: "ouvertement" },
  { level: "B1", es: "secretamente", en: "secretly", uk: "таємно", ar: "سرًا", ka: "ფარულად", fr: "secrètement" },
  { level: "B2", es: "sigilosamente", en: "stealthily", uk: "потайки", ar: "خلسة", ka: "მალულად", fr: "furtivement" },
  { level: "B1", es: "cautelosamente", en: "cautiously", uk: "з обережністю", ar: "بتحفظ", ka: "სიფრთხილით", fr: "prudemment" },
  { level: "B1", es: "apresuradamente", en: "hurriedly", uk: "поспішно", ar: "بعجالة", ka: "ჩქარობით", fr: "précipitamment" },
  { level: "B1", es: "velozmente", en: "swiftly", uk: "прудко", ar: "بسرعة فائقة", ka: "სისწრაფით", fr: "vélocement" },
  { level: "C1", es: "inopinadamente", en: "unexpectedly", uk: "несподівано", ar: "على حين غرة", ka: "მოულოდნელად", fr: "inopinément" },
  { level: "B1", es: "asombrosamente", en: "astonishingly", uk: "дивовижно", ar: "بشكل مذهل", ka: "საოცრად", fr: "étonnamment" },
  { level: "C2", es: "telúrico", en: "telluric", uk: "телуричний", ar: "أرضي", ka: "ტელურიული", fr: "tellurique" },
  { level: "C2", es: "consanguinidad", en: "consanguinity", uk: "кровне споріднення", ar: "قرابة الدم", ka: "სისხლით ნათესაობა", fr: "consanguinité", category: "family" },
  { level: "C2", es: "sibarita", en: "epicure", uk: "сибарит", ar: "ذواقة", ka: "გურმანი", fr: "sybarite", category: "food" },
  { level: "C2", es: "ubicuidad", en: "ubiquity", uk: "всюдисущість", ar: "وجود في كل مكان", ka: "ყველგანმყოფობა", fr: "ubiquité" },
  { level: "C2", es: "nepotismo", en: "nepotism", uk: "непотизм", ar: "محسوبية", ka: "ნეპოტიზმი", fr: "népotisme", category: "work" },
  { level: "C2", es: "iatrogénico", en: "iatrogenic", uk: "ятрогенний", ar: "علاجي المنشأ", ka: "იატროგენული", fr: "iatrogène", category: "medicine" },
  { level: "C2", es: "obsolescencia", en: "obsolescence", uk: "застарівання", ar: "تقادم", ka: "მოძველება", fr: "obsolescence" },
  { level: "C2", es: "ostracismo", en: "ostracism", uk: "остракізм", ar: "نبذ", ka: "ოსტრაკიზმი", fr: "ostracisme" },
  { level: "C2", es: "glotonería", en: "gluttony", uk: "ненажерливість", ar: "شراهة", ka: "სიხარბე", fr: "gloutonnerie", category: "food" },
  { level: "C2", es: "proletariado", en: "proletariat", uk: "пролетаріат", ar: "بروليتاريا", ka: "პროლეტარიატი", fr: "prolétariat", category: "work" },
  { level: "C2", es: "placebo", en: "placebo", uk: "плацебо", ar: "دواء وهمي", ka: "პლაცებო", fr: "placebo" },
  { level: "C2", es: "tecnócrata", en: "technocrat", uk: "технократ", ar: "تكنوقراط", ka: "ტექნოკრატი", fr: "technocrate", category: "work" },
  { level: "C2", es: "plutocracia", en: "plutocracy", uk: "плутократія", ar: "بلوتوقراطية", ka: "პლუტოკრატია", fr: "ploutocratie" },
  { level: "C2", es: "microcosmos", en: "microcosm", uk: "мікрокосм", ar: "عالم مصغر", ka: "მიკროკოსმოსი", fr: "microcosme" },
  { level: "C2", es: "inanición", en: "starvation", uk: "голодування", ar: "تضور جوعاً", ka: "შიმშილი", fr: "inanition", category: "food" },
  { level: "C2", es: "transhumancia", en: "transhumance", uk: "трансгуманція", ar: "انتجاع", ka: "გადარეკვა", fr: "transhumance", category: "travel" },
  { level: "C2", es: "sindicato", en: "union", uk: "профспілка", ar: "نقابة", ka: "სინდიკატი", fr: "syndicat", category: "work" },
  { level: "C2", es: "profilaxis", en: "prophylaxis", uk: "профілактика", ar: "وقاية", ka: "პროფილაქტიკა", fr: "prophylaxie", category: "medicine" },

  { level: "C2", es: "escarpado", en: "steep", uk: "скелястий", ar: "منحدر", ka: "ციცაბო", fr: "escarpé" },
  { level: "C2", es: "pernicioso", en: "pernicious", uk: "згубний", ar: "مضر", ka: "მავნე", fr: "pernicieux" },
  { level: "C2", es: "espurio", en: "spurious", uk: "фальшивий", ar: "زائف", ka: "ყალბი", fr: "spurious" },
  { level: "C2", es: "ignominioso", en: "ignominious", uk: "ганебний", ar: "مشين", ka: "სირცხვილის", fr: "ignominieux" },
  { level: "C2", es: "inane", en: "pointless", uk: "пустий", ar: "تاافه", ka: "უაზრო", fr: "inane" },
  { level: "C2", es: "protervia", en: "perversity", uk: "зухвалість", ar: "عناد", ka: "თავხედობა", fr: "perversité" },
  { level: "C2", es: "acendrado", en: "pure", uk: "бездоганний", ar: "نقي", ka: "სუფთა", fr: "pur" },
  { level: "C2", es: "procrastinador", en: "procrastinator", uk: "прокрастинатор", ar: "مماطل", ka: "პროკრასტინატორი", fr: "procrastinateur" },
  { level: "C2", es: "nictálope", en: "nyctalope", uk: "нікталоп", ar: "أعمى", ka: "ნიქტალოპი", fr: "nyctalope" },
  { level: "C2", es: "peripatético", en: "peripatetic", uk: "мандрівний", ar: "جوال", ka: "მოხეტიალე", fr: "péripatéticien" },
  { level: "C2", es: "atrabiliario", en: "grumpy", uk: "жовчний", ar: "متقلب", ka: "ბრაზიანი", fr: "atrabilaire" },
  { level: "C2", es: "melifluo", en: "mellifluous", uk: "мелодійний", ar: "معسول", ka: "მელოდიური", fr: "méliflu" },
  { level: "C2", es: "sempiterno", en: "eternal", uk: "вічний", ar: "سرمدي", ka: "მარადიული", fr: "sempiternel" },
  { level: "C2", es: "exégesis", en: "exegesis", uk: "екзегеза", ar: "تفسير", ka: "ეგზეგეტიკა", fr: "exégèse" },
  { level: "C2", es: "lapidario", en: "lapidary", uk: "лапідарний", ar: "موجز", ka: "ლაპიდარული", fr: "lapidaire" },
  { level: "C2", es: "inescrutable", en: "inscrutable", uk: "незбагненний", ar: "غامض", ka: "ამოუცნობი", fr: "inscrutable" },
  { level: "C2", es: "anacoreta", en: "anchorite", uk: "анахорет", ar: "ناسك", ka: "განდეგილი", fr: "anachorète" },
  { level: "C2", es: "apócrifo", en: "apocryphal", uk: "апокрифічний", ar: "مكحول", ka: "აპოკრიფული", fr: "apocryphe" },
  { level: "C2", es: "asaz", en: "enough", uk: "досить", ar: "جدا", ka: "საკმარისად", fr: "assez" },
  { level: "C2", es: "bisoñé", en: "toupee", uk: "тупе", ar: "باروكة", ka: "პარიკი", fr: "toupet" },
  { level: "C2", es: "cacumen", en: "wit", uk: "кмітливість", ar: "ذكاء", ka: "ნიჭი", fr: "perspicacité" },
  { level: "C2", es: "circunspecto", en: "circumspect", uk: "обачний", ar: "حذر", ka: "ფრთხილი", fr: "circonspect" },
  { level: "C2", es: "clepsidra", en: "clepsydra", uk: "клепсидра", ar: "ساعةماء", ka: "კლეფსიდრა", fr: "clepsydre" },
  { level: "C2", es: "coágulo", en: "clot", uk: "згусток", ar: "جلطة", ka: "კოლტა", fr: "caillot", category: "medicine" },
  { level: "C2", es: "conminación", en: "threat", uk: "погроза", ar: "تهديد", ka: "მუქარა", fr: "commination" },
  { level: "C2", es: "consustancial", en: "consubstantial", uk: "консутсенаційний", ar: "جوهري", ka: "არსობრივი", fr: "consubstantiel" },
  { level: "C2", es: "crepuscular", en: "crepuscular", uk: "сутінковий", ar: "غسقي", ka: "შებინდებული", fr: "crépusculaire" },
  { level: "C2", es: "cruento", en: "bloody", uk: "кривавий", ar: "دموي", ka: "სისხლიანი", fr: "cruent" },
  { level: "C2", es: "depauperar", en: "impoverish", uk: "знедолювати", ar: "فقر", ka: "გაღარიბება", fr: "appauvrir" },
  { level: "C2", es: "derrotero", en: "course", uk: "курс", ar: "مسار", ka: "კურსი", fr: "cap" },
  { level: "C2", es: "desgañitarse", en: "shout", uk: "надриватися", ar: "صرخ", ka: "ყვირილი", fr: "s'égosiller" },
  { level: "C2", es: "diafanidad", en: "diaphaneity", uk: "прозорість", ar: "شفافية", ka: "გამჭვირვალობა", fr: "diaphanéité" },
  { level: "C2", es: "dispendio", en: "lavishness", uk: "марнотратство", ar: "تبذير", ka: "ფლანგვა", fr: "gaspillage" },
  { level: "C2", es: "ebúrneo", en: "eburnean", uk: "слоновоїкістки", ar: "عاجي", ka: "ძვლის", fr: "éburnéen" },
  { level: "C2", es: "égida", en: "aegis", uk: "егіда", ar: "رعاية", ka: "მფარველობა", fr: "égide" },
  { level: "C2", es: "embuste", en: "hoax", uk: "обман", ar: "خدعة", ka: "მოტყუება", fr: "boniment" },
  { level: "C2", es: "enclenque", en: "feeble", uk: "кволий", ar: "ضعيف", ka: "სუსტი", fr: "chétif" },
  { level: "C2", es: "endémico", en: "endemic", uk: "ендемічний", ar: "متوطن", ka: "ენდემური", fr: "endémique", category: "medicine" },
  { level: "C2", es: "enfático", en: "emphatic", uk: "емфатичний", ar: "مؤكد", ka: "მტკიცე", fr: "emphatique" },
  { level: "C2", es: "enhiesto", en: "erect", uk: "прямостоячий", ar: "منتصب", ka: "აწეული", fr: "droit" },
  { level: "C2", es: "enófilo", en: "oenophile", uk: "енофіл", ar: "متذوقخمور", ka: "ვინოფილი", fr: "oenophile" },
  { level: "C2", es: "esmirriado", en: "scrawny", uk: "худий", ar: "هزيل", ka: "გამხდარი", fr: "mâché" },
  { level: "C2", es: "esperpéntico", en: "grotesque", uk: "гротескний", ar: "مشوه", ka: "გროტესკული", fr: "grotesque" },
  { level: "C2", es: "esquenofobia", en: "fear", uk: "фобія", ar: "رهاب", ka: "ფობია", fr: "phobie" },
  { level: "C2", es: "estólido", en: "foolish", uk: "тупий", ar: "بليد", ka: "სულელი", fr: "stupide" },
  { level: "C2", es: "etéreo", en: "ethereal", uk: "ефірний", ar: "أثيري", ka: "ეთერული", fr: "éthéré" },
  { level: "C2", es: "exangüe", en: "bloodless", uk: "знекровлений", ar: "نازف", ka: "სისხლსაცლელი", fr: "exsangue" },
  { level: "C2", es: "excelsitud", en: "loftiness", uk: "велич", ar: "سمو", ka: "სიმაღლე", fr: "grandeur" },
  { level: "C2", es: "exequias", en: "obsequies", uk: "похорон", ar: "جنازة", ka: "დაკრძალვა", fr: "obsèques" },
  { level: "C2", es: "exorable", en: "exorable", uk: "схильний", ar: "لين", ka: "დათმობადი", fr: "exorable" },
  { level: "C2", es: "exótico", en: "exotic", uk: "екзотичний", ar: "غريب", ka: "ეგზოტიკური", fr: "exotique" },
  { level: "C2", es: "facsímil", en: "facsimile", uk: "факсиміле", ar: "نسخة", ka: "ფაქსმილი", fr: "fac-similé" },
  { level: "C2", es: "abulia", en: "apathy", uk: "абулія", ar: "لامبالاة", ka: "აბულია", fr: "aboulie" },
  { level: "C2", es: "abotargamiento", en: "swelling", uk: "набряклість", ar: "تورم", ka: "შეშუპება", fr: "boursouflure" },
  { level: "C2", es: "aciago", en: "fateful", uk: "фатальний", ar: "مشؤوم", ka: "საბედისწერო", fr: "fatidique" },
  { level: "C2", es: "adalid", en: "champion", uk: "поборник", ar: "بطل", ka: "წინამძღოლი", fr: "champion" },
  { level: "C2", es: "adlátere", en: "minion", uk: "поплічник", ar: "تابع", ka: "ხელქვეითი", fr: "acolyte" },
  { level: "C2", es: "afasia", en: "aphasia", uk: "афазія", ar: "حبسة", ka: "აფაზია", fr: "aphasie", category: "medicine" },
  { level: "C2", es: "aforismo", en: "aphorism", uk: "афоризм", ar: "حكمة", ka: "აფორიზმი", fr: "aphorisme" },
  { level: "C2", es: "alienación", en: "alienation", uk: "відчуження", ar: "اغتراب", ka: "გაუცხოება", fr: "aliénation" },
  { level: "C2", es: "amalgama", en: "amalgam", uk: "амальгама", ar: "ملغم", ka: "ამალგამა", fr: "amalgame" },
  { level: "C2", es: "anacoluto", en: "anacoluthon", uk: "анаколуф", ar: "تفكك", ka: "ანაკოლუთი", fr: "anacoluthe" },
  { level: "C2", es: "anacronismo", en: "anachronism", uk: "анахронізм", ar: "مفارقة", ka: "ანაქრონიზმი", fr: "anachronisme" },
  { level: "C2", es: "anamnesis", en: "anamnesis", uk: "анамнез", ar: "سوابق", ka: "ანამნეზი", fr: "anamnèse", category: "medicine" },
  { level: "C2", es: "anatema", en: "anathema", uk: "анафема", ar: "لعنة", ka: "ანათემა", fr: "anathème" },
  { level: "C2", es: "andamiaje", en: "scaffolding", uk: "риштування", ar: "سقالة", ka: "ხარაჩო", fr: "échafaudage" },
  { level: "C2", es: "anfractuoso", en: "anfractuous", uk: "звивистий", ar: "متعرج", ka: "დაკლაკნილი", fr: "anfractueux" },
  { level: "C2", es: "animadversión", en: "animadversion", uk: "ворожість", ar: "عداء", ka: "მტრობა", fr: "animadversion" },
  { level: "C2", es: "anodino", en: "anodyne", uk: "анодинний", ar: "مسكن", ka: "უწყინარი", fr: "anodin" },
  { level: "C2", es: "antinomia", en: "antinomy", uk: "антиномія", ar: "تناقض", ka: "ანტინომია", fr: "antinomie" },
  { level: "C2", es: "antropocentrismo", en: "anthropocentrism", uk: "антропоцентризм", ar: "مركزية", ka: "ანთროპოცენტრიზმი", fr: "anthropocentrisme" },
  { level: "C2", es: "apodíctico", en: "apodictic", uk: "аподиктичний", ar: "قطعي", ka: "აპოდიქტური", fr: "apodictique" },
  { level: "C2", es: "apología", en: "apology", uk: "апологія", ar: "دفاع", ka: "აპოლოგია", fr: "apologie" },
  { level: "C2", es: "apoteosis", en: "apotheosis", uk: "апофеоз", ar: "تأليه", ka: "აპოთეოზი", fr: "apothéose" },
  { level: "C2", es: "arquetipo", en: "archetype", uk: "архетип", ar: "نموذج", ka: "არქეტიპი", fr: "archétype" },
  { level: "C2", es: "arrebato", en: "outburst", uk: "спалах", ar: "فورة", ka: "აფეთქება", fr: "emportement" },
  { level: "C2", es: "ascetismo", en: "asceticism", uk: "аскетизм", ar: "زهد", ka: "ასკეტიზმი", fr: "ascétisme" },
  { level: "C2", es: "asepsia", en: "asepsis", uk: "асептика", ar: "تعقيم", ka: "ასეპტიკა", fr: "asepsie", category: "medicine" },
  { level: "C2", es: "aseveración", en: "assertion", uk: "твердження", ar: "تأكيد", ka: "მტკიცება", fr: "assertion" },
  { level: "C2", es: "ataraxia", en: "ataraxia", uk: "атараксія", ar: "طمأنينة", ka: "ატარაქსია", fr: "ataraxie" },
  { level: "C2", es: "atavismo", en: "atavism", uk: "атавізм", ar: "رجعية", ka: "ატავიზმი", fr: "atavisme" },
  { level: "C2", es: "bagatela", en: "bagatelle", uk: "дрібниця", ar: "تفاهة", ka: "წვრილმანი", fr: "bagatelle" },
  { level: "C2", es: "baladronada", en: "boast", uk: "хвастощі", ar: "تبجح", ka: "ტრაბახი", fr: "fanfaronnade" },
  { level: "C2", es: "báratro", en: "hell", uk: "пекло", ar: "جحيم", ka: "ჯოჯოხეთი", fr: "barathre" },
  { level: "C2", es: "barrunto", en: "suspicion", uk: "підозра", ar: "ظن", ka: "ეჭვი", fr: "pressentiment" },
  { level: "C2", es: "beligerancia", en: "belligerence", uk: "войовничість", ar: "عدوانية", ka: "მებრძოლობა", fr: "belligérance" },
  { level: "C2", es: "bicefalia", en: "bicephaly", uk: "двоголовість", ar: "برأسين", ka: "ორთავიანობა", fr: "bicéphalie" },
  { level: "C2", es: "bifurcación", en: "bifurcation", uk: "біфуркація", ar: "تشعب", ka: "ბიფურკაცია", fr: "bifurcation" },
  { level: "C2", es: "biodisponibilidad", en: "bioavailability", uk: "біодоступність", ar: "التوافر الحيوي", ka: "ბიოშეღწევადობა", fr: "biodisponibilité" },
  { level: "C2", es: "bonhomía", en: "affability", uk: "добродушність", ar: "دماثة", ka: "კეთილგანწყობა", fr: "bonhomie" },
  { level: "C2", es: "cacofonía", en: "cacophony", uk: "какофонія", ar: "تنافر", ka: "კაკოფონია", fr: "cacophonie" },
  { level: "C2", es: "cadalso", en: "scaffold", uk: "ешафот", ar: "مقصلة", ka: "ეშაფოტი", fr: "échafaud" },
  { level: "C2", es: "caducidad", en: "expiry", uk: "закінчення", ar: "انقضاء", ka: "ვადაგასულობა", fr: "caducité" },
  { level: "C2", es: "camastrón", en: "cunning", uk: "хитрун", ar: "ماكر", ka: "ცბიერი", fr: "finaud" },
  { level: "C2", es: "canonjía", en: "sinecure", uk: "синекура", ar: "منصب", ka: "სინეკურა", fr: "sinécure" },
  { level: "C2", es: "capcioso", en: "captious", uk: "причепливий", ar: "مخادع", ka: "მზაკვრული", fr: "captieux" },
  { level: "C2", es: "casuística", en: "casuistry", uk: "казуїстика", ar: "دراسة", ka: "კაზუისტიკა", fr: "casuistique" },
  { level: "C2", es: "catarsis", en: "catharsis", uk: "катарсис", ar: "تطهير", ka: "კათარზისი", fr: "catharsis" },
  { level: "C2", es: "cenáculo", en: "cenacle", uk: "гурток", ar: "علية", ka: "წრე", fr: "cénacle" },
  { level: "C2", es: "cerval", en: "extreme", uk: "панічний", ar: "شديد", ka: "უკიდურესი", fr: "cerval" },
  { level: "C2", es: "chabacano", en: "tasteless", uk: "несмачний", ar: "مبتذل", ka: "უგემოვნო", fr: "vulgaire" },
  { level: "C2", es: "chovinismo", en: "chauvinism", uk: "шовінізм", ar: "شوفينية", ka: "შოვინიზმი", fr: "chauvinisme" },
  { level: "C2", es: "cicatero", en: "stingy", uk: "скупий", ar: "بخيل", ka: "ძუნწი", fr: "mesquin" },
  { level: "C2", es: "cisma", en: "schism", uk: "розкол", ar: "انشقاق", ka: "სქიზმა", fr: "schisme" },
  { level: "C2", es: "claudicación", en: "claudication", uk: "кульгавість", ar: "عرج", ka: "კოჭლობა", fr: "claudication" },
  { level: "C2", es: "coacción", en: "coercion", uk: "примус", ar: "إكراه", ka: "იძულება", fr: "coercition" },
  { level: "C2", es: "coalescencia", en: "coalescence", uk: "коалесценція", ar: "التحام", ka: "კოალესცენცია", fr: "coalescence" },
  { level: "C2", es: "cohecho", en: "bribery", uk: "хабарництво", ar: "رشوة", ka: "მექრთამეობა", fr: "subornation" },
  { level: "C2", es: "colofón", en: "colophon", uk: "колофон", ar: "خاتمة", ka: "კოლოფონი", fr: "colophon" },
  { level: "C2", es: "concomitante", en: "concomitant", uk: "супутній", ar: "مصاحب", ka: "თანმხლები", fr: "concomitant" },
  { level: "C2", es: "concupiscencia", en: "concupiscence", uk: "хіть", ar: "شهوة", ka: "ვნება", fr: "concupiscence" },
  { level: "C2", es: "connivencia", en: "connivance", uk: "потурання", ar: "تواطؤ", ka: "შეთქმულება", fr: "connivence" },
  { level: "C2", es: "contingencia", en: "contingency", uk: "контингенція", ar: "طوارئ", ka: "კონტინგენტობა", fr: "contingence" },
  { level: "C2", es: "contubernio", en: "conspiracy", uk: "змова", ar: "مؤامرة", ka: "გარიგება", fr: "contubernium" },
  { level: "C2", es: "corolario", en: "corollary", uk: "наслідок", ar: "نتيجة", ka: "კოროლარიუმი", fr: "corollaire" },
  { level: "C2", es: "criptografía", en: "cryptography", uk: "криптографія", ar: "تشفير", ka: "კრიპტოგრაფია", fr: "cryptographie" },
  { level: "C2", es: "crisol", en: "crucible", uk: "тигель", ar: "بوتقة", ka: "სადნობი", fr: "creuset" },
  { level: "C2", es: "dactiloscopia", en: "dactyloscopy", uk: "дактилоскопія", ar: "بصمات", ka: "დაქტილოსკოპია", fr: "dactyloscopie" },
  { level: "C2", es: "decantación", en: "decantation", uk: "декантація", ar: "تصفية", ka: "დეკანტაცია", fr: "décantation" },
  { level: "C2", es: "deconstrucción", en: "deconstruction", uk: "деконструкція", ar: "تفكيك", ka: "დეკონსტრუქცია", fr: "déconstruction" },
  { level: "C2", es: "demiurgo", en: "demiurge", uk: "деміург", ar: "صانع", ka: "დემიურგი", fr: "démiurge" },
  { level: "C2", es: "denuesto", en: "insult", uk: "образа", ar: "شتيمة", ka: "შეურაცხყოფა", fr: "injure" },
  { level: "C2", es: "deontología", en: "deontology", uk: "деонтологія", ar: "آداب", ka: "დეონტოლოგია", fr: "déontologie" },
  { level: "C2", es: "desafección", en: "disaffection", uk: "невдоволення", ar: "استياء", ka: "უკმაყოფილება", fr: "désaffection" },
  { level: "C2", es: "desatino", en: "folly", uk: "безглуздя", ar: "حماقة", ka: "უგუნურება", fr: "sottise" },
  { level: "C2", es: "desavenencia", en: "disagreement", uk: "розбіжність", ar: "خلاف", ka: "უთანხმოება", fr: "désaccord" },
  { level: "C2", es: "desfalco", en: "embezzlement", uk: "розтрата", ar: "اختلاس", ka: "მითვისება", fr: "détournement" },
  { level: "C2", es: "desmitificación", en: "demystification", uk: "демістифікація", ar: "توضيح", ka: "დემისტიფიკაცია", fr: "démystification" },
  { level: "C2", es: "despotismo", en: "despotism", uk: "деспотизм", ar: "استبداد", ka: "დესპოტიზმი", fr: "despotisme" },
  { level: "C2", es: "detrimento", en: "detriment", uk: "шкода", ar: "ضرر", ka: "ზიანი", fr: "détriment" },
  { level: "C2", es: "dialéctica", en: "dialectics", uk: "діалектика", ar: "جدلية", ka: "დიალექტიკა", fr: "dialectique", category: "education" },
  { level: "C2", es: "diatriba", en: "diatribe", uk: "діатриба", ar: "هجوم", ka: "დიატრიბა", fr: "diatribe" },
  { level: "C2", es: "diletantismo", en: "dilettantism", uk: "дилетантство", ar: "هواية", ka: "დილეტანტიზმი", fr: "dilettantisme" },
  { level: "C2", es: "disquisición", en: "disquisition", uk: "міркування", ar: "بحث", ka: "დისკუსია", fr: "disquisition" },
  { level: "C2", es: "dogmatismo", en: "dogmatism", uk: "догматизм", ar: "تعصب", ka: "დოგმატიზმი", fr: "dogmatisme" },
  { level: "C2", es: "draconiano", en: "draconian", uk: "драконівський", ar: "صارم", ka: "დრაკონული", fr: "draconien" },
  { level: "C2", es: "dualismo", en: "dualism", uk: "дуалізм", ar: "ثنائية", ka: "დუალიზმი", fr: "dualisme" },
  { level: "C2", es: "eclecticismo", en: "eclecticism", uk: "еклектизм", ar: "انتقائية", ka: "ეკლექტიზმი", fr: "éclectisme" },
  { level: "C2", es: "eclosión", en: "emergence", uk: "поява", ar: "بزوغ", ka: "წარმოშობა", fr: "éclosion" },
  { level: "C2", es: "ecuanimidad", en: "equanimity", uk: "холоднокровність", ar: "هدوء", ka: "სიდინჯე", fr: "équanimité" },
  { level: "C2", es: "edicto", en: "edict", uk: "едикт", ar: "مرسوم", ka: "ედიქტი", fr: "édit" },
  { level: "C2", es: "efigie", en: "effigy", uk: "опудало", ar: "تمثال", ka: "გამოსახულება", fr: "effigie" },
  { level: "C2", es: "efluvio", en: "effluvium", uk: "випаровування", ar: "انبعاث", ka: "გამონაყოფი", fr: "effluve" },
  { level: "C2", es: "égloga", en: "eclogue", uk: "еклога", ar: "قصيدة", ka: "ეკლოგა", fr: "églogue" },
  { level: "C2", es: "elocución", en: "elocution", uk: "дикція", ar: "إلقاء", ka: "ელოკუცია", fr: "élocution" },
  { level: "C2", es: "embaucador", en: "trickster", uk: "шахрай", ar: "محتال", ka: "თაღლითი", fr: "trompeur" },
  { level: "C2", es: "embolia", en: "embolism", uk: "емболія", ar: "انسداد", ka: "ემბოლია", fr: "embolie", category: "medicine" },
  { level: "C2", es: "emético", en: "emetic", uk: "блювотний", ar: "مقيئ", ka: "პირსაღები", fr: "émétique", category: "medicine" },
  { level: "C2", es: "empírico", en: "empirical", uk: "емпіричний", ar: "تجريبي", ka: "ემპირიული", fr: "empirique" },
  { level: "C2", es: "emporio", en: "emporium", uk: "емпорій", ar: "متجر", ka: "ემპორიუმი", fr: "emporium" },
  { level: "C2", es: "endogamia", en: "endogamy", uk: "ендогамія", ar: "زواج", ka: "ენდოგამია", fr: "endogamie" },
  { level: "C2", es: "ensimismamiento", en: "selfabsorption", uk: "самозаглиблення", ar: "انطواء", ka: "ჩაფიქრება", fr: "recueillement" },
  { level: "C2", es: "entelequia", en: "entelechy", uk: "ентелехія", ar: "كمال", ka: "ენტელექია", fr: "entéléchie" },
  { level: "C2", es: "entropía", en: "entropy", uk: "ентропія", ar: "إنتروبيا", ka: "ენტროპია", fr: "entropie" },
  { level: "C2", es: "epifenómeno", en: "epiphenomenon", uk: "епіфеномен", ar: "ظاهرة", ka: "ეპიფენომენი", fr: "épiphénomène" },
  { level: "C2", es: "epígrafe", en: "epigraph", uk: "епіграф", ar: "نقش", ka: "ეპიგრაფი", fr: "épigraphe" },
  { level: "C2", es: "epistemología", en: "epistemology", uk: "епістемологія", ar: "معرفية", ka: "ეპისტემოლოგია", fr: "épistémologie", category: "education" },
  { level: "C2", es: "epitafio", en: "epitaph", uk: "епітафія", ar: "ضريح", ka: "ეპიტაფია", fr: "épitaphe" },
  { level: "C2", es: "epíteto", en: "epithet", uk: "епітет", ar: "نعت", ka: "ეპითეტი", fr: "épithète" },
  { level: "C2", es: "escarnio", en: "derision", uk: "глузування", ar: "سخرية", ka: "დაცინვა", fr: "dérision" },
  { level: "C2", es: "escatología", en: "eschatology", uk: "есхатологія", ar: "أخرويات", ka: "ესქატოლოგია", fr: "eschatologie" },
  { level: "C2", es: "escolástica", en: "scholasticism", uk: "схоластика", ar: "مدرسية", ka: "სქოლასტიკა", fr: "scolastique", category: "education" },
  { level: "C2", es: "esoterismo", en: "esotericism", uk: "езотерика", ar: "باطنية", ka: "ეზოთერიზმი", fr: "ésotérisme" },
  { level: "C2", es: "espasmo", en: "spasm", uk: "спазм", ar: "تشنج", ka: "სპაზმი", fr: "spasme", category: "medicine" },
  { level: "C2", es: "espejismo", en: "mirage", uk: "міраж", ar: "سراب", ka: "მირაჟი", fr: "mirage" },
  { level: "C2", es: "estocástico", en: "stochastic", uk: "стохастичний", ar: "تصادفي", ka: "სტოქასტური", fr: "stochastique" },
  { level: "C2", es: "estoicismo", en: "stoicism", uk: "стоїцизм", ar: "رواقية", ka: "სტოიციზმი", fr: "stoïcisme" },
  { level: "C2", es: "estratagema", en: "stratagem", uk: "хитрість", ar: "حيلة", ka: "სტრატაგემა", fr: "stratagème" },
  { level: "C2", es: "etimología", en: "etymology", uk: "етимологія", ar: "اشتقاق", ka: "ეტიმოლოგია", fr: "étymologie" },
  { level: "C2", es: "etnocentrismo", en: "ethnocentrism", uk: "етноцентризм", ar: "عرقية", ka: "ეთნოცენტრიზმი", fr: "ethnocentrisme" },
  { level: "C2", es: "eufemismo", en: "euphemism", uk: "евфемізм", ar: "تلطيف", ka: "ევფემიზმი", fr: "euphémisme" },
  { level: "C2", es: "euritmia", en: "eurythmy", uk: "евритмія", ar: "تناسق", ka: "ევრითმია", fr: "eurythmie" },
  { level: "C2", es: "eutanasia", en: "euthanasia", uk: "евтаназія", ar: "قتل", ka: "ევთანაზია", fr: "euthanasie", category: "medicine" },
  { level: "C2", es: "excomunión", en: "excommunication", uk: "відлучення", ar: "حرمان", ka: "განკვეთა", fr: "excommunication" },
  { level: "C2", es: "execrable", en: "execrable", uk: "огидний", ar: "مقيت", ka: "საძულველი", fr: "exécrable" },
  { level: "C2", es: "fisionomía", en: "physiognomy", uk: "фізіогноміка", ar: "فراسة", ka: "ფიზიოგნომიკა", fr: "physiognomonie" },
  { level: "C2", es: "exención", en: "exemption", uk: "звільнення", ar: "إعفاء", ka: "გათავისუფლება", fr: "exemption" },
  { level: "C2", es: "exhortación", en: "exhortation", uk: "заклик", ar: "وعظ", ka: "შეგონება", fr: "exhortation" },
  { level: "C2", es: "existencialismo", en: "existentialism", uk: "екзистенціалізм", ar: "وجودية", ka: "ეგზისტენციალიზმი", fr: "existentialisme" },
  { level: "C2", es: "expropiación", en: "expropriation", uk: "експропріація", ar: "مصادرة", ka: "ექსპროპრიაცია", fr: "expropriation" },
  { level: "C2", es: "extirpación", en: "extirpation", uk: "видалення", ar: "استئصال", ka: "ექსტირპაცია", fr: "extirpation" },
  { level: "C2", es: "extrapolación", en: "extrapolation", uk: "екстраполяція", ar: "استقراء", ka: "ექსტრაპოლაცია", fr: "extrapolation" },
  { level: "C2", es: "facción", en: "faction", uk: "фракція", ar: "فصيل", ka: "ფრაქცია", fr: "faction" },
  { level: "C2", es: "factótum", en: "factotum", uk: "фактотум", ar: "مدبر", ka: "ფაქტოტუმი", fr: "factotum" },
  { level: "C2", es: "falacia", en: "fallacy", uk: "помилка", ar: "مغالطة", ka: "ფალაცია", fr: "sophisme" },
  { level: "C2", es: "farmacopea", en: "pharmacopoeia", uk: "фармакопея", ar: "دستور", ka: "ფარმაკოპეა", fr: "pharmacopée", category: "medicine" },
  { level: "C2", es: "incoar", en: "to commence", uk: "розпочинати", ar: "يشرع", ka: "ინიცირება", fr: "intenter" },
  { level: "C2", es: "prevaricar", en: "to prevaricate", uk: "зловживати", ar: "يراوغ", ka: "გადაცდომა", fr: "prévariquer" },
  { level: "C2", es: "colegir", en: "to infer", uk: "висновувати", ar: "يستنتج", ka: "დასკვნა", fr: "inférer" },
  { level: "C2", es: "recusar", en: "to challenge", uk: "відводити", ar: "يعترض", ka: "აცილება", fr: "récuser" },
  { level: "C2", es: "vindicar", en: "to vindicate", uk: "відстоювати", ar: "يبرر", ka: "გამართლება", fr: "revendiquer" },
  { level: "C2", es: "vilipendiar", en: "to vilify", uk: "ганьбити", ar: "يذم", ka: "ლანძღვა", fr: "vilipender" },
  { level: "C2", es: "coadyuvar", en: "to assist", uk: "сприяти", ar: "يعاون", ka: "დახმარება", fr: "contribuer" },
  { level: "C2", es: "concatenar", en: "to concatenate", uk: "зчіплювати", ar: "يربط", ka: "დაკავშირება", fr: "concaténer" },
  { level: "C2", es: "escudriñar", en: "to scrutinize", uk: "досліджувати", ar: "يمحص", ka: "გამოკვლევა", fr: "scruter" },
  { level: "C2", es: "imbuir", en: "to imbue", uk: "просочувати", ar: "يشرب", ka: "შთაგონება", fr: "imprégner" },
  { level: "C2", es: "desentrañar", en: "to unravel", uk: "розгадувати", ar: "يفك", ka: "ამოხსნა", fr: "démêler" },
  { level: "C2", es: "cercenar", en: "to amputate", uk: "відтинати", ar: "يبتر", ka: "მოკვეთა", fr: "amputer" },
  { level: "C2", es: "estatuir", en: "to decree", uk: "постановляти", ar: "يسن", ka: "დადგენა", fr: "statuer" },
  { level: "C2", es: "subsumir", en: "to subsume", uk: "підводити", ar: "يدرج", ka: "ჩართვა", fr: "subsumer" },
  { level: "C2", es: "obnubilar", en: "to obfuscate", uk: "затьмарювати", ar: "يغشي", ka: "დაბინდვა", fr: "obnubiler" },
  { level: "C2", es: "soliviantar", en: "to rouse", uk: "збурювати", ar: "يثير", ka: "აღშფოთება", fr: "soulever" },
  { level: "C2", es: "amalgamar", en: "to amalgamate", uk: "змішувати", ar: "يدمج", ka: "შერწყმა", fr: "amalgamer" },
  { level: "C2", es: "defenestrar", en: "to defenestrate", uk: "викидати", ar: "يطرد", ka: "გადაყენება", fr: "défenestrer" },
  { level: "C2", es: "proscribir", en: "to proscribe", uk: "забороняти", ar: "يحظر", ka: "აკრძალვა", fr: "proscrire" },
  { level: "C2", es: "transmutar", en: "to transmute", uk: "перетворювати", ar: "يحول", ka: "გარდაქმნა", fr: "transmuter" },
  { level: "C2", es: "conculcar", en: "to infringe", uk: "порушувати", ar: "ينتهك", ka: "გათელვა", fr: "transgresser" },
  { level: "C2", es: "subrogar", en: "to subrogate", uk: "суброгувати", ar: "يحل", ka: "ჩანაცვლება", fr: "subroger" },
  { level: "C2", es: "enconar", en: "to inflame", uk: "розпалювати", ar: "يهيج", ka: "გამწვავება", fr: "envenimer" },
  { level: "C2", es: "lacerar", en: "to lacerate", uk: "шматувати", ar: "يمزق", ka: "დასახიჩრება", fr: "lacérer" },
  { level: "C2", es: "desfalcar", en: "to embezzle", uk: "розкрадати", ar: "يختلس", ka: "გაფლანგვა", fr: "détourner" },
  { level: "C2", es: "acrisolar", en: "to purify", uk: "очищати", ar: "ينقي", ka: "განწმენდა", fr: "épurer" },
  { level: "C2", es: "insuflar", en: "to insufflate", uk: "вдихати", ar: "ينفخ", ka: "შთაბერვა", fr: "insuffler" },
  { level: "C2", es: "polarizar", en: "to polarize", uk: "поляризувати", ar: "يستقطب", ka: "პოლარიზება", fr: "polariser" },
  { level: "C2", es: "catalizar", en: "to catalyze", uk: "каталізувати", ar: "يحفز", ka: "კატალიზება", fr: "catalyser" },
  { level: "C2", es: "hegemonizar", en: "to hegemonize", uk: "гегемонізувати", ar: "يهيمن", ka: "ჰეგემონიზება", fr: "hégémoniser" },
  { level: "C2", es: "enajenar", en: "to alienate", uk: "відчужувати", ar: "ينفر", ka: "გასხვისება", fr: "aliéner" },
  { level: "C2", es: "dimanar", en: "to emanate", uk: "походити", ar: "ينبع", ka: "მომდინარეობა", fr: "émaner" },
  { level: "C2", es: "subyugar", en: "to subjugate", uk: "підкорювати", ar: "يخضع", ka: "დამორჩილება", fr: "subjuguer" },
  { level: "C2", es: "interpelar", en: "to interpellate", uk: "інтерпелювати", ar: "يستجوب", ka: "გამოკითხვა", fr: "interpeller" },
  { level: "C2", es: "solapar", en: "to overlap", uk: "перекривати", ar: "يتداخل", ka: "გადაფარვა", fr: "chevaucher" },
  { level: "C2", es: "pergeñar", en: "to draft", uk: "накидати", ar: "يخطط", ka: "ესკიზირება", fr: "ébaucher" },
  { level: "C2", es: "inmanente", en: "immanent", uk: "іманентний", ar: "محايث", ka: "იმანენტური", fr: "immanent" },
  { level: "C2", es: "taumatúrgico", en: "thaumaturgic", uk: "чудотворний", ar: "سحري", ka: "სასწაულმოქმედი", fr: "thaumaturgique" },
  { level: "C2", es: "idiosincrásico", en: "idiosyncratic", uk: "ідіосинкратичний", ar: "مميز", ka: "იდიოსინკრატიული", fr: "idiosyncrasique" },
  { level: "C2", es: "deletéreo", en: "deleterious", uk: "шкідливий", ar: "مؤذ", ka: "მავნებელი", fr: "délétère" },
  { level: "C2", es: "solipsista", en: "solipsistic", uk: "соліпсистський", ar: "منغلق", ka: "სოლიფსისტური", fr: "solipsiste" },
  { level: "C2", es: "incoativo", en: "inchoative", uk: "інкоативний", ar: "ابتدائي", ka: "ინქოატიური", fr: "inchoatif" },
  { level: "C2", es: "numinoso", en: "numinous", uk: "нумінозний", ar: "روحي", ka: "ნუმინოზური", fr: "numineux" },
  { level: "C2", es: "perentorio", en: "peremptory", uk: "безапеляційний", ar: "قاطع", ka: "გადამწყვეტი", fr: "péremptoire" },
  { level: "C2", es: "inapelable", en: "unappealable", uk: "остаточний", ar: "مبرم", ka: "საბოლოო", fr: "inattaquable" },
  { level: "C2", es: "primigenio", en: "primal", uk: "первісний", ar: "أصلي", ka: "პირველყოფილი", fr: "originaire" },
  { level: "C2", es: "leonino", en: "leonine", uk: "грабіжницький", ar: "مجحف", ka: "უსამართლო", fr: "léonin" },
  { level: "C2", es: "heurístico", en: "heuristic", uk: "евристичний", ar: "استدلالي", ka: "ევრისტიკული", fr: "heuristique" },
  { level: "C2", es: "virulento", en: "virulent", uk: "вірулентний", ar: "خبيث", ka: "ვირულენტური", fr: "virulent" },
  { level: "C2", es: "impertérrito", en: "undaunted", uk: "незворушний", ar: "صامد", ka: "შეუდრეკელი", fr: "imperturbable" },
  { level: "C2", es: "fúlgido", en: "fulgid", uk: "сяючий", ar: "ساطع", ka: "მოკაშკაშე", fr: "fulgide" },
  { level: "C2", es: "misántropo", en: "misanthropic", uk: "мізантропічний", ar: "كاره", ka: "მიზანთროპიული", fr: "misanthrope" },
  // ---- Thematic: food ----
  { level: "A2", category: "food", es: "manzana", en: "apple", uk: "яблуко", ar: "تفاحة", ka: "ვაშლი", fr: "pomme" },
  { level: "A2", category: "food", es: "queso", en: "cheese", uk: "сир", ar: "جبن", ka: "ყველი", fr: "fromage" },
  { level: "A2", category: "food", es: "huevo", en: "egg", uk: "яйце", ar: "بيضة", ka: "კვერცხი", fr: "œuf" },
  { level: "A2", category: "food", es: "carne", en: "meat", uk: "м'ясо", ar: "لحم", ka: "ხორცი", fr: "viande" },
  { level: "A2", category: "food", es: "arroz", en: "rice", uk: "рис", ar: "أرز", ka: "ბრინჯი", fr: "riz" },
  { level: "A1", category: "food", es: "cebolla", en: "onion", uk: "цибуля", ar: "بصل", ka: "ხახვი", fr: "oignon" },
  { level: "A1", category: "food", es: "ajo", en: "garlic", uk: "часник", ar: "ثوم", ka: "ნიორი", fr: "ail" },
  { level: "A1", category: "food", es: "zanahoria", en: "carrot", uk: "морква", ar: "جزر", ka: "სტაფილო", fr: "carotte" },
  { level: "A2", category: "food", es: "marisco", en: "seafood", uk: "морепродукти", ar: "مأكولات بحرية", ka: "ზღვის პროდუქტები", fr: "fruits de mer" },
  { level: "A1", category: "food", es: "servilleta", en: "napkin", uk: "серветка", ar: "منديل", ka: "ხელსახოცი", fr: "serviette de table" },

  // ---- Thematic: travel ----
  { level: "A2", category: "travel", es: "pasaporte", en: "passport", uk: "паспорт", ar: "جواز سفر", ka: "პასპორტი", fr: "passeport" },
  { level: "A2", category: "travel", es: "maleta", en: "suitcase", uk: "валіза", ar: "حقيبة سفر", ka: "ჩემოდანი", fr: "valise" },
  { level: "A2", category: "travel", es: "billete", en: "ticket", uk: "квиток", ar: "تذكرة", ka: "ბილეთი", fr: "billet" },
  { level: "A2", category: "travel", es: "aeropuerto", en: "airport", uk: "аеропорт", ar: "مطار", ka: "აეროპორტი", fr: "aéroport" },
  { level: "A2", category: "travel", es: "hotel", en: "hotel", uk: "готель", ar: "فندق", ka: "სასტუმრო", fr: "hôtel" },
  { level: "A2", category: "travel", es: "vacaciones", en: "vacation", uk: "відпустка", ar: "عطلة", ka: "შვებულება", fr: "vacances" },
  { level: "A2", category: "travel", es: "turista", en: "tourist", uk: "турист", ar: "سائح", ka: "ტურისტი", fr: "touriste" },
  { level: "A2", category: "travel", es: "frontera", en: "border", uk: "кордон", ar: "حدود", ka: "საზღვარი", fr: "frontière" },
  { level: "A2", category: "travel", es: "equipaje", en: "luggage", uk: "багаж", ar: "أمتعة", ka: "ბარგი", fr: "bagages" },
  { level: "A2", category: "travel", es: "vuelo", en: "flight", uk: "рейс", ar: "رحلة جوية", ka: "ფრენა", fr: "vol" },
  { level: "B1", category: "travel", es: "alojamiento", en: "accommodation", uk: "проживання", ar: "إقامة", ka: "საცხოვრებელი", fr: "hébergement" },
  { level: "B1", category: "travel", es: "reserva", en: "reservation", uk: "бронювання", ar: "حجز", ka: "დაჯავშნა", fr: "réservation" },
  { level: "A2", category: "travel", es: "guía", en: "guide", uk: "гід", ar: "دليل", ka: "გიდი", fr: "guide" },
  { level: "A2", category: "travel", es: "destino", en: "destination", uk: "напрямок", ar: "وجهة", ka: "მიმართულება", fr: "destination" },
  { level: "A1", category: "travel", es: "mapa", en: "map", uk: "карта", ar: "خريطة", ka: "რუკა", fr: "carte" },
  { level: "A2", category: "travel", es: "ruta", en: "route", uk: "маршрут", ar: "مسار", ka: "მარშრუტი", fr: "itinéraire" },
  { level: "A2", category: "travel", es: "excursión", en: "excursion", uk: "екскурсія", ar: "جولة", ka: "ექსკურსია", fr: "excursion" },
  { level: "B1", category: "travel", es: "aduana", en: "customs", uk: "митниця", ar: "جمارك", ka: "საბაჟო", fr: "douane" },
  { level: "B1", category: "travel", es: "escala", en: "layover", uk: "пересадка", ar: "توقف", ka: "ტრანზიტი", fr: "escale" },
  { level: "B1", category: "travel", es: "crucero", en: "cruise", uk: "круїз", ar: "رحلة بحرية", ka: "კრუიზი", fr: "croisière" },
  { level: "A2", category: "travel", es: "recuerdo", en: "souvenir", uk: "сувенір", ar: "تذكار", ka: "სუვენირი", fr: "souvenir" },
  { level: "B1", category: "travel", es: "albergue", en: "hostel", uk: "хостел", ar: "نزل", ka: "ხოსტელი", fr: "auberge" },
  { level: "B1", category: "travel", es: "folleto", en: "brochure", uk: "брошура", ar: "كتيب", ka: "ბროშურა", fr: "brochure" },
  { level: "A2", category: "travel", es: "pasaje", en: "fare", uk: "проїзд", ar: "أجرة", ka: "გზავრობა", fr: "tarif" },
  { level: "B1", category: "travel", es: "maletero", en: "trunk", uk: "багажник", ar: "صندوق السيارة", ka: "საბარგული", fr: "coffre" },
  { level: "A2", category: "travel", es: "brújula", en: "compass", uk: "компас", ar: "بوصلة", ka: "კომპასი", fr: "boussole" },
  { level: "B1", category: "travel", es: "estancia", en: "stay", uk: "перебування", ar: "مكوث", ka: "ყოფნა", fr: "séjour" },
  { level: "B1", category: "travel", es: "embarque", en: "boarding", uk: "посадка", ar: "ركوب", ka: "ჩასხდომა", fr: "embarquement" },

  // ---- Thematic: work ----
  { level: "A2", category: "work", es: "trabajo", en: "job", uk: "робота", ar: "عمل", ka: "სამუშაო", fr: "travail" },
  { level: "A2", category: "work", es: "jefe", en: "boss", uk: "начальник", ar: "رئيس", ka: "უფროსი", fr: "patron" },
  { level: "A2", category: "work", es: "oficina", en: "office", uk: "офіс", ar: "مكتب", ka: "ოფისი", fr: "bureau" },
  { level: "B1", category: "work", es: "salario", en: "salary", uk: "зарплата", ar: "راتب", ka: "ხელფასი", fr: "salaire" },
  { level: "A2", category: "work", es: "empleado", en: "employee", uk: "працівник", ar: "موظف", ka: "თანამშრომელი", fr: "employé" },
  { level: "B1", category: "work", es: "reunión", en: "meeting", uk: "зустріч", ar: "اجتماع", ka: "შეხვედრა", fr: "réunion" },
  { level: "B1", category: "work", es: "entrevista", en: "interview", uk: "співбесіда", ar: "مقابلة", ka: "გასაუბრება", fr: "entretien" },
  { level: "B1", category: "work", es: "currículum", en: "resume", uk: "резюме", ar: "سيرة ذاتية", ka: "რეზიუმე", fr: "CV" },
  { level: "B1", category: "work", es: "contrato", en: "contract", uk: "контракт", ar: "عقد", ka: "კონტრაქტი", fr: "contrat" },
  { level: "A2", category: "work", es: "compañero", en: "companion", uk: "товариш", ar: "رفيق", ka: "თანაგუნდელი", fr: "camarade" },
  { level: "A2", category: "work", es: "cliente", en: "client", uk: "клієнт", ar: "عميل", ka: "კლიენტი", fr: "client" },
  { level: "B1", category: "work", es: "puesto", en: "position", uk: "посада", ar: "منصب", ka: "თანამდებობა", fr: "poste" },
  { level: "B1", category: "work", es: "proyecto", en: "project", uk: "проект", ar: "مشروع", ka: "პროექტი", fr: "projet" },
  { level: "B1", category: "work", es: "colega", en: "colleague", uk: "колега", ar: "زميل", ka: "კოლეგა", fr: "collègue" },
  { level: "B1", category: "work", es: "despido", en: "dismissal", uk: "звільнення", ar: "فصل", ka: "გათავისუფლება", fr: "licenciement" },
  { level: "B1", category: "work", es: "ascenso", en: "promotion", uk: "підвищення", ar: "ترقية", ka: "დაწინაურება", fr: "promotion" },
  { level: "B1", category: "work", es: "jornada", en: "workday", uk: "робочий день", ar: "يوم عمل", ka: "სამუშაო დღე", fr: "journée de travail" },
  { level: "A2", category: "work", es: "experiencia", en: "experience", uk: "досвід", ar: "خبرة", ka: "გამოცდილება", fr: "expérience" },
  { level: "A2", category: "work", es: "negocio", en: "business", uk: "бізнес", ar: "أعمال", ka: "ბიზნესი", fr: "affaires" },
  { level: "A2", category: "work", es: "profesión", en: "profession", uk: "професія", ar: "مهنة", ka: "პროფესია", fr: "profession" },
  { level: "B1", category: "work", es: "departamento", en: "department", uk: "відділ", ar: "قسم", ka: "დეპარტამენტი", fr: "département" },
  { level: "B1", category: "work", es: "huelga", en: "strike", uk: "страйк", ar: "إضراب", ka: "გაფიცვა", fr: "grève" },
  { level: "B1", category: "work", es: "firma", en: "signature", uk: "підпис", ar: "توقيع", ka: "ხელმოწერა", fr: "signature" },
  { level: "B1", category: "work", es: "jubilación", en: "retirement", uk: "пенсія", ar: "تقاعد", ka: "პენსია", fr: "retraite" },
  { level: "B1", category: "work", es: "solicitud", en: "application", uk: "заявка", ar: "طلب", ka: "განაცხადი", fr: "candidature" },

  // ---- Thematic: family (extra) ----
  { level: "A1", category: "family", es: "esposo", en: "husband", uk: "чоловік", ar: "زوج", ka: "ქმარი", fr: "mari" },
  { level: "A1", category: "family", es: "esposa", en: "wife", uk: "дружина", ar: "زوجة", ka: "ცოლი", fr: "femme" },
  { level: "A1", category: "family", es: "nieta", en: "granddaughter", uk: "онука", ar: "حفيدة", ka: "ქალი შვილიშვილი", fr: "petite-fille" },
  { level: "A1", category: "family", es: "sobrina", en: "niece", uk: "племінниця", ar: "ابنة أخ", ka: "დისწული", fr: "nièce" },
  { level: "A1", category: "family", es: "prima", en: "female cousin", uk: "двоюрідна сестра", ar: "ابنة عم", ka: "ქალი ბიძაშვილი", fr: "cousine" },
  { level: "B1", category: "family", es: "suegro", en: "father-in-law", uk: "тесть", ar: "حمو", ka: "მამამთილი", fr: "beau-père" },
  { level: "B1", category: "family", es: "suegra", en: "mother-in-law", uk: "теща", ar: "حماة", ka: "დედამთილი", fr: "belle-mère" },
  { level: "B1", category: "family", es: "yerno", en: "son-in-law", uk: "зять", ar: "صهر", ka: "სიძე", fr: "gendre" },
  { level: "B1", category: "family", es: "nuera", en: "daughter-in-law", uk: "невістка", ar: "كنة", ka: "რძალი", fr: "belle-fille" },
  { level: "B1", category: "family", es: "cuñado", en: "brother-in-law", uk: "шурин", ar: "سلف", ka: "მაზლი", fr: "beau-frère" },
  { level: "B1", category: "family", es: "cuñada", en: "sister-in-law", uk: "зовиця", ar: "سلفة", ka: "მული", fr: "belle-sœur" },
  { level: "A2", category: "family", es: "pariente", en: "relative", uk: "родич", ar: "قريب", ka: "ნათესავი", fr: "parent" },
  { level: "B1", category: "family", es: "tutor", en: "guardian", uk: "опікун", ar: "وصي", ka: "მეურვე", fr: "tuteur" },
  { level: "B1", category: "family", es: "padrino", en: "godfather", uk: "хрещений батько", ar: "عراب", ka: "ნათლია", fr: "parrain" },
  { level: "B1", category: "family", es: "madrina", en: "godmother", uk: "хрещена мати", ar: "عرابة", ka: "ნათლიდედა", fr: "marraine" },
  { level: "B1", category: "family", es: "progenitor", en: "parent", uk: "родитель", ar: "والد", ka: "მშობელი", fr: "géniteur" },
  { level: "A2", category: "family", es: "infancia", en: "childhood", uk: "дитинство", ar: "طفولة", ka: "ბავშვობა", fr: "enfance" },
  { level: "A2", category: "family", es: "hogar", en: "home", uk: "домівка", ar: "منزل", ka: "სახლი", fr: "foyer" },
  { level: "B1", category: "family", es: "linaje", en: "lineage", uk: "родовід", ar: "سلالة", ka: "საგვარეულო", fr: "lignée" },

  // ---- Thematic: shopping ----
  { level: "A2", category: "shopping", es: "tienda", en: "store", uk: "магазин", ar: "متجر", ka: "მაღაზია", fr: "magasin" },
  { level: "A1", category: "shopping", es: "dinero", en: "money", uk: "гроші", ar: "مال", ka: "ფული", fr: "argent" },
  { level: "A2", category: "shopping", es: "precio", en: "price", uk: "ціна", ar: "سعر", ka: "ფასი", fr: "prix" },
  { level: "B1", category: "shopping", es: "descuento", en: "discount", uk: "знижка", ar: "خصم", ka: "ფასდაკლება", fr: "réduction" },
  { level: "A2", category: "shopping", es: "recibo", en: "receipt", uk: "чек", ar: "إيصال", ka: "ქვითარი", fr: "reçu" },
  { level: "A2", category: "shopping", es: "talla", en: "size", uk: "розмір", ar: "مقاس", ka: "ზომა", fr: "taille" },
  { level: "A2", category: "shopping", es: "carrito", en: "shopping cart", uk: "візок", ar: "عربة تسوق", ka: "საყიდლების ურიკა", fr: "chariot" },
  { level: "A2", category: "shopping", es: "caja", en: "checkout", uk: "каса", ar: "صندوق", ka: "სალარო", fr: "caisse" },
  { level: "A2", category: "shopping", es: "compra", en: "purchase", uk: "покупка", ar: "شراء", ka: "შესყიდვა", fr: "achat" },
  { level: "A2", category: "shopping", es: "oferta", en: "offer", uk: "акція", ar: "عرض", ka: "შეთავაზება", fr: "offre" },
  { level: "A2", category: "shopping", es: "vendedor", en: "salesperson", uk: "продавець", ar: "بائع", ka: "გამყიდველი", fr: "vendeur" },
  { level: "A2", category: "shopping", es: "moneda", en: "currency", uk: "валюта", ar: "عملة", ka: "ვალუტა", fr: "monnaie" },
  { level: "B1", category: "shopping", es: "devolución", en: "return", uk: "повернення", ar: "إرجاع", ka: "დაბრუნება", fr: "retour" },
  { level: "B1", category: "shopping", es: "escaparate", en: "shop window", uk: "вітрина", ar: "واجهة المحل", ka: "ვიტრინა", fr: "vitrine" },
  { level: "A2", category: "shopping", es: "pasillo", en: "aisle", uk: "прохід", ar: "ممر", ka: "გასასვლელი", fr: "allée" },
  { level: "A2", category: "shopping", es: "producto", en: "product", uk: "продукт", ar: "منتج", ka: "პროდუქტი", fr: "produit" },
  { level: "A2", category: "shopping", es: "marca", en: "brand", uk: "бренд", ar: "علامة تجارية", ka: "ბრენდი", fr: "marque" },
  { level: "A2", category: "shopping", es: "monedero", en: "coin purse", uk: "гаманець для монет", ar: "محفظة نقود", ka: "მონეტების საფულე", fr: "porte-monnaie" },
  { level: "A2", category: "shopping", es: "cesto", en: "basket", uk: "кошик", ar: "سلة", ka: "კალათა", fr: "panier" },
  { level: "A2", category: "shopping", es: "etiqueta", en: "label", uk: "етикетка", ar: "ملصق", ka: "იარლიყი", fr: "étiquette" },
  { level: "B1", category: "shopping", es: "reembolso", en: "refund", uk: "відшкодування", ar: "استرداد", ka: "თანხის დაბრუნება", fr: "remboursement" },
  { level: "A2", category: "shopping", es: "mostrador", en: "counter", uk: "прилавок", ar: "منضدة", ka: "დახლი", fr: "comptoir" },
  { level: "A2", category: "shopping", es: "comprador", en: "buyer", uk: "покупець", ar: "مشترٍ", ka: "მყიდველი", fr: "acheteur" },

  // ---- Thematic: medicine ----
  { level: "A2", category: "medicine", es: "médico", en: "doctor", uk: "лікар", ar: "طبيب", ka: "ექიმი", fr: "médecin" },
  { level: "A2", category: "medicine", es: "hospital", en: "hospital", uk: "лікарня", ar: "مستشفى", ka: "საავადმყოფო", fr: "hôpital" },
  { level: "A2", category: "medicine", es: "medicina", en: "medicine", uk: "ліки", ar: "دواء", ka: "წამალი", fr: "médicament" },
  { level: "B1", category: "medicine", es: "enfermedad", en: "illness", uk: "хвороба", ar: "مرض", ka: "დაავადება", fr: "maladie" },
  { level: "A2", category: "medicine", es: "dolor", en: "pain", uk: "біль", ar: "ألم", ka: "ტკივილი", fr: "douleur" },
  { level: "A2", category: "medicine", es: "fiebre", en: "fever", uk: "гарячка", ar: "حمى", ka: "სიცხე", fr: "fièvre" },
  { level: "B1", category: "medicine", es: "receta", en: "prescription", uk: "рецепт", ar: "وصفة طبية", ka: "რეცეპტი", fr: "ordonnance" },
  { level: "A2", category: "medicine", es: "enfermera", en: "nurse", uk: "медсестра", ar: "ممرضة", ka: "მედდა", fr: "infirmière" },
  { level: "B1", category: "medicine", es: "tratamiento", en: "treatment", uk: "лікування", ar: "علاج", ka: "მკურნალობა", fr: "traitement" },
  { level: "B1", category: "medicine", es: "síntoma", en: "symptom", uk: "симптом", ar: "عرض", ka: "სიმპტომი", fr: "symptôme" },
  { level: "A2", category: "medicine", es: "jarabe", en: "syrup", uk: "сироп", ar: "شراب", ka: "სიროფი", fr: "sirop" },
  { level: "A2", category: "medicine", es: "pastilla", en: "pill", uk: "таблетка", ar: "حبة", ka: "აბი", fr: "comprimé" },
  { level: "B1", category: "medicine", es: "inyección", en: "injection", uk: "укол", ar: "حقنة", ka: "ინექცია", fr: "injection" },
  { level: "A2", category: "medicine", es: "farmacia", en: "pharmacy", uk: "аптека", ar: "صيدلية", ka: "აფთიაქი", fr: "pharmacie" },
  { level: "A2", category: "medicine", es: "clínica", en: "clinic", uk: "клініка", ar: "عيادة", ka: "კლინიკა", fr: "clinique" },
  { level: "B1", category: "medicine", es: "cirujano", en: "surgeon", uk: "хірург", ar: "جراح", ka: "ქირურგი", fr: "chirurgien" },
  { level: "A2", category: "medicine", es: "ambulancia", en: "ambulance", uk: "швидка допомога", ar: "سيارة إسعاف", ka: "სასწრაფო დახმარება", fr: "ambulance" },
  { level: "A2", category: "medicine", es: "venda", en: "bandage", uk: "бинт", ar: "ضمادة", ka: "სახვევი", fr: "bandage" },
  { level: "A2", category: "medicine", es: "herida", en: "wound", uk: "рана", ar: "جرح", ka: "ჭრილობა", fr: "blessure" },
  { level: "A2", category: "medicine", es: "tos", en: "cough", uk: "кашель", ar: "سعال", ka: "ხველა", fr: "toux" },
  { level: "A2", category: "medicine", es: "gripe", en: "flu", uk: "грип", ar: "إنفلونزا", ka: "გრიპი", fr: "grippe" },
  { level: "B1", category: "medicine", es: "diagnóstico", en: "diagnosis", uk: "діагноз", ar: "تشخيص", ka: "დიაგნოზი", fr: "diagnostic" },
  { level: "A2", category: "medicine", es: "consulta", en: "consultation", uk: "консультація", ar: "استشارة", ka: "კონსულტაცია", fr: "consultation" },
  { level: "B1", category: "medicine", es: "urgencia", en: "emergency", uk: "невідкладна допомога", ar: "طوارئ", ka: "გადაუდებელი შემთხვევა", fr: "urgence" },
  { level: "A2", category: "medicine", es: "tirita", en: "band-aid", uk: "пластир", ar: "لصقة طبية", ka: "ლეიკოპლასტირი", fr: "pansement" },
  { level: "A2", category: "medicine", es: "vacuna", en: "vaccine", uk: "вакцина", ar: "لقاح", ka: "ვაქცინა", fr: "vaccin" },

  // ---- Thematic: transport ----
  { level: "A1", category: "transport", es: "coche", en: "car", uk: "машина", ar: "سيارة", ka: "მანქანა", fr: "voiture" },
  { level: "A1", category: "transport", es: "autobús", en: "bus", uk: "автобус", ar: "حافلة", ka: "ავტობუსი", fr: "bus" },
  { level: "A1", category: "transport", es: "tren", en: "train", uk: "потяг", ar: "قطار", ka: "მატარებელი", fr: "train" },
  { level: "A2", category: "transport", es: "avión", en: "airplane", uk: "літак", ar: "طائرة", ka: "თვითმფრინავი", fr: "avion" },
  { level: "A1", category: "transport", es: "bicicleta", en: "bicycle", uk: "велосипед", ar: "دراجة", ka: "ველოსიპედი", fr: "vélo" },
  { level: "A2", category: "transport", es: "metro", en: "subway", uk: "метро", ar: "مترو", ka: "მეტრო", fr: "métro" },
  { level: "A2", category: "transport", es: "carretera", en: "road", uk: "дорога", ar: "طريق", ka: "გზა", fr: "route" },
  { level: "A2", category: "transport", es: "parada", en: "stop", uk: "зупинка", ar: "محطة", ka: "გაჩერება", fr: "arrêt" },
  { level: "B1", category: "transport", es: "vehículo", en: "vehicle", uk: "транспортний засіб", ar: "مركبة", ka: "სატრანსპორტო საშუალება", fr: "véhicule" },
  { level: "A2", category: "transport", es: "tranvía", en: "tram", uk: "трамвай", ar: "ترام", ka: "ტრამვაი", fr: "tramway" },
  { level: "A1", category: "transport", es: "barco", en: "boat", uk: "корабель", ar: "قارب", ka: "ნავი", fr: "bateau" },
  { level: "A1", category: "transport", es: "taxi", en: "taxi", uk: "таксі", ar: "تاكسي", ka: "ტაქსი", fr: "taxi" },
  { level: "A2", category: "transport", es: "camión", en: "truck", uk: "вантажівка", ar: "شاحنة", ka: "სატვირთო მანქანა", fr: "camion" },
  { level: "A2", category: "transport", es: "moto", en: "motorcycle", uk: "мотоцикл", ar: "دراجة نارية", ka: "მოტოციკლი", fr: "moto" },
  { level: "A2", category: "transport", es: "puerto", en: "port", uk: "порт", ar: "ميناء", ka: "პორტი", fr: "port" },
  { level: "A2", category: "transport", es: "estación", en: "station", uk: "станція", ar: "محطة قطار", ka: "სადგური", fr: "gare" },
  { level: "A2", category: "transport", es: "pasajero", en: "passenger", uk: "пасажир", ar: "راكب", ka: "მგზავრი", fr: "passager" },
  { level: "A2", category: "transport", es: "conductor", en: "driver", uk: "водій", ar: "سائق", ka: "მძღოლი", fr: "conducteur" },
  { level: "A2", category: "transport", es: "tráfico", en: "traffic", uk: "дорожній рух", ar: "حركة المرور", ka: "მოძრაობა", fr: "circulation" },
  { level: "B1", category: "transport", es: "carril", en: "lane", uk: "смуга", ar: "حارة", ka: "ზოლი", fr: "voie" },
  { level: "B1", category: "transport", es: "peaje", en: "toll", uk: "дорожній збір", ar: "رسوم مرور", ka: "გადასახდელი", fr: "péage" },
  { level: "A2", category: "transport", es: "asiento", en: "seat", uk: "сидіння", ar: "مقعد", ka: "ადგილი", fr: "siège" },
  { level: "B1", category: "transport", es: "casco", en: "helmet", uk: "шолом", ar: "خوذة", ka: "ჩაფხუტი", fr: "casque" },
  { level: "A2", category: "transport", es: "freno", en: "brake", uk: "гальмо", ar: "فرامل", ka: "მუხრუჭი", fr: "frein" },
  { level: "A2", category: "transport", es: "volante", en: "steering wheel", uk: "кермо", ar: "عجلة القيادة", ka: "საჭე", fr: "volant" },
  { level: "A2", category: "transport", es: "gasolinera", en: "gas station", uk: "заправка", ar: "محطة وقود", ka: "ბენზინგასამართი", fr: "station-service" },
  { level: "B1", category: "transport", es: "vía", en: "track", uk: "колія", ar: "مسار", ka: "ლიანდაგი", fr: "rail" },

  // ---- Thematic: education ----
  { level: "A1", category: "education", es: "escuela", en: "school", uk: "школа", ar: "مدرسة", ka: "სკოლა", fr: "école" },
  { level: "A1", category: "education", es: "profesor", en: "teacher", uk: "вчитель", ar: "معلم", ka: "მასწავლებელი", fr: "professeur" },
  { level: "A2", category: "education", es: "estudiante", en: "student", uk: "студент", ar: "طالب", ka: "სტუდენტი", fr: "étudiant" },
  { level: "A2", category: "education", es: "examen", en: "exam", uk: "екзамен", ar: "امتحان", ka: "გამოცდა", fr: "examen" },
  { level: "A1", category: "education", es: "clase", en: "class", uk: "урок", ar: "حصة", ka: "გაკვეთილი", fr: "cours" },
  { level: "A2", category: "education", es: "universidad", en: "university", uk: "університет", ar: "جامعة", ka: "უნივერსიტეტი", fr: "université" },
  { level: "A2", category: "education", es: "tarea", en: "homework", uk: "домашнє завдання", ar: "واجب", ka: "საშინაო დავალება", fr: "devoir" },
  { level: "A1", category: "education", es: "alumno", en: "pupil", uk: "учень", ar: "تلميذ", ka: "მოსწავლე", fr: "élève" },
  { level: "A2", category: "education", es: "lección", en: "lesson", uk: "заняття", ar: "درس", ka: "თემა", fr: "leçon" },
  { level: "B1", category: "education", es: "asignatura", en: "subject", uk: "предмет", ar: "مادة دراسية", ka: "საგანი", fr: "matière" },
  { level: "A2", category: "education", es: "borrador", en: "eraser", uk: "гумка", ar: "ممحاة", ka: "საშლელი", fr: "gomme" },
  { level: "A2", category: "education", es: "diccionario", en: "dictionary", uk: "словник", ar: "قاموس", ka: "ლექსიკონი", fr: "dictionnaire" },
  { level: "A2", category: "education", es: "nota", en: "grade", uk: "оцінка", ar: "درجة", ka: "შეფასება", fr: "note" },
  { level: "B1", category: "education", es: "título", en: "degree", uk: "ступінь", ar: "درجة علمية", ka: "ხარისხი", fr: "titre" },
  { level: "A2", category: "education", es: "curso", en: "course", uk: "курс", ar: "دورة", ka: "კურსი", fr: "cursus" },
  { level: "B1", category: "education", es: "beca", en: "scholarship", uk: "стипендія", ar: "منحة دراسية", ka: "სტიპენდია", fr: "bourse" },
  { level: "A2", category: "education", es: "aula", en: "classroom", uk: "аудиторія", ar: "قاعة دراسية", ka: "აუდიტორია", fr: "salle de classe" },
  { level: "A2", category: "education", es: "pizarra", en: "blackboard", uk: "дошка", ar: "سبورة", ka: "დაფა", fr: "tableau" },
  { level: "B1", category: "education", es: "diploma", en: "diploma", uk: "диплом", ar: "شهادة", ka: "დიპლომი", fr: "diplôme" },
  { level: "B1", category: "education", es: "instituto", en: "institute", uk: "інститут", ar: "معهد", ka: "ინსტიტუტი", fr: "institut" },
  { level: "B1", category: "education", es: "facultad", en: "faculty", uk: "факультет", ar: "كلية", ka: "ფაკულტეტი", fr: "faculté" },

  // ---- Thematic: sports ----
  { level: "A1", category: "sports", es: "fútbol", en: "soccer", uk: "футбол", ar: "كرة القدم", ka: "ფეხბურთი", fr: "football" },
  { level: "A1", category: "sports", es: "pelota", en: "ball", uk: "м'яч", ar: "كرة", ka: "ბურთი", fr: "ballon" },
  { level: "A2", category: "sports", es: "equipo", en: "team", uk: "команда", ar: "فريق", ka: "გუნდი", fr: "équipe" },
  { level: "A2", category: "sports", es: "partido", en: "match", uk: "матч", ar: "مباراة", ka: "მატჩი", fr: "match" },
  { level: "B1", category: "sports", es: "entrenador", en: "coach", uk: "тренер", ar: "مدرب", ka: "მწვრთნელი", fr: "entraîneur" },
  { level: "A2", category: "sports", es: "victoria", en: "victory", uk: "перемога", ar: "انتصار", ka: "გამარჯვება", fr: "victoire" },
  { level: "A2", category: "sports", es: "derrota", en: "defeat", uk: "поразка", ar: "هزيمة", ka: "დამარცხება", fr: "défaite" },
  { level: "A2", category: "sports", es: "gimnasio", en: "gym", uk: "спортзал", ar: "صالة رياضية", ka: "სპორტდარბაზი", fr: "salle de sport" },
  { level: "A2", category: "sports", es: "jugador", en: "player", uk: "гравець", ar: "لاعب", ka: "მოთამაშე", fr: "joueur" },
  { level: "B1", category: "sports", es: "árbitro", en: "referee", uk: "суддя", ar: "حكم", ka: "მსაჯი", fr: "arbitre" },
  { level: "B1", category: "sports", es: "torneo", en: "tournament", uk: "турнір", ar: "بطولة", ka: "ტურნირი", fr: "tournoi" },
  { level: "B1", category: "sports", es: "campeonato", en: "championship", uk: "чемпіонат", ar: "دوري", ka: "ჩემპიონატი", fr: "championnat" },
  { level: "A2", category: "sports", es: "estadio", en: "stadium", uk: "стадіон", ar: "ملعب", ka: "სტადიონი", fr: "stade" },
  { level: "B1", category: "sports", es: "atleta", en: "athlete", uk: "спортсмен", ar: "رياضي", ka: "სპორტსმენი", fr: "athlète" },
  { level: "A2", category: "sports", es: "natación", en: "swimming", uk: "плавання", ar: "سباحة", ka: "ცურვა", fr: "natation" },
  { level: "A2", category: "sports", es: "baloncesto", en: "basketball", uk: "баскетбол", ar: "كرة السلة", ka: "კალათბურთი", fr: "basketball" },
  { level: "A2", category: "sports", es: "tenis", en: "tennis", uk: "теніс", ar: "تنس", ka: "ჩოგბურთი", fr: "tennis" },
  { level: "A2", category: "sports", es: "carrera", en: "race", uk: "перегони", ar: "سباق", ka: "რბოლა", fr: "course" },
  { level: "A2", category: "sports", es: "pista", en: "track", uk: "трек", ar: "مضمار", ka: "ტრასა", fr: "piste" },
  { level: "A2", category: "sports", es: "medalla", en: "medal", uk: "медаль", ar: "ميدالية", ka: "მედალი", fr: "médaille" },
  { level: "A2", category: "sports", es: "trofeo", en: "trophy", uk: "трофей", ar: "جائزة", ka: "ტროფეი", fr: "trophée" },
  { level: "A2", category: "sports", es: "resultado", en: "result", uk: "результат", ar: "نتيجة", ka: "შედეგი", fr: "résultat" },
  { level: "B1", category: "sports", es: "falta", en: "foul", uk: "фол", ar: "خطأ", ka: "დარღვევა", fr: "faute" },
  { level: "B1", category: "sports", es: "marcador", en: "scoreboard", uk: "табло", ar: "لوحة النتائج", ka: "ტაბლო", fr: "tableau d'affichage" },
  { level: "A2", category: "sports", es: "silbato", en: "whistle", uk: "свисток", ar: "صافرة", ka: "სასტვენი", fr: "sifflet" },
  { level: "A2", category: "sports", es: "raqueta", en: "racket", uk: "ракетка", ar: "مضرب", ka: "რაკეტკა", fr: "raquette" },
];

// Conjugation drills, tagged by tense. CEFR level maps to tense tier:
// A1/A2 -> presente, B1/B2 -> preterito, C1/C2 -> perfecto.
const CONJ_BANK = [
  // ---- PRESENTE (A1): recognize habitual/current action vs other tenses ----
  { tense: "presente", sentence: "Todos los días yo __ café por la mañana.", correct: "tomo", options: ["tomo", "tomé", "tomaba", "tomaré"] },
  { tense: "presente", sentence: "Ahora mismo ella __ la cena.", correct: "prepara", options: ["prepara", "preparó", "preparaba", "preparará"] },
  { tense: "presente", sentence: "Cada semana tú __ a tus padres.", correct: "visitas", options: ["visitas", "visitaste", "visitabas", "visitarás"] },
  { tense: "presente", sentence: "Generalmente ellos __ español muy bien.", correct: "hablan", options: ["hablan", "hablaron", "hablaban", "hablarán"] },
  { tense: "presente", sentence: "Normalmente yo __ el periódico por la mañana.", correct: "leo", options: ["leo", "leí", "leía", "leeré"] },
  { tense: "presente", sentence: "Mi hermano __ en un banco actualmente.", correct: "trabaja", options: ["trabaja", "trabajó", "trabajaba", "trabajará"] },
  { tense: "presente", sentence: "Siempre tú __ la verdad.", correct: "dices", options: ["dices", "dijiste", "decías", "dirás"] },
  { tense: "presente", sentence: "De costumbre nosotros __ pescado los viernes.", correct: "comemos", options: ["comemos", "comimos", "comíamos", "comeremos"] },
  { tense: "presente", sentence: "Ella siempre __ temprano al trabajo.", correct: "llega", options: ["llega", "llegó", "llegaba", "llegará"] },
  { tense: "presente", sentence: "Yo normalmente __ mucha agua.", correct: "bebo", options: ["bebo", "bebí", "bebía", "beberé"] },
  { tense: "presente", sentence: "Ellos cada año __ a la playa.", correct: "van", options: ["van", "fueron", "iban", "irán"] },
  { tense: "presente", sentence: "Tú siempre __ las reglas.", correct: "sigues", options: ["sigues", "seguiste", "seguías", "seguirás"] },
  { tense: "presente", sentence: "Actualmente nosotros __ en Madrid.", correct: "estamos", options: ["estamos", "estuvimos", "estábamos", "estaremos"] },
  { tense: "presente", sentence: "Ella normalmente __ por las tardes.", correct: "estudia", options: ["estudia", "estudió", "estudiaba", "estudiará"] },
  { tense: "presente", sentence: "Yo siempre __ la puerta con llave.", correct: "cierro", options: ["cierro", "cerré", "cerraba", "cerraré"] },
  { tense: "presente", sentence: "Ellos normalmente __ mucho trabajo.", correct: "tienen", options: ["tienen", "tuvieron", "tenían", "tendrán"] },
  { tense: "presente", sentence: "Cada mañana mi padre __ el periódico.", correct: "lee", options: ["lee", "leyó", "leía", "leerá"] },
  { tense: "presente", sentence: "Normalmente los niños __ mucho por las tardes.", correct: "juegan", options: ["juegan", "jugaron", "jugaban", "jugarán"] },
  { tense: "presente", sentence: "Yo casi nunca __ carne.", correct: "como", options: ["como", "comí", "comía", "comeré"] },
  { tense: "presente", sentence: "Tú siempre __ la tarea antes de cenar.", correct: "haces", options: ["haces", "hiciste", "hacías", "harás"] },
  { tense: "presente", sentence: "Ella __ el piano todos los domingos.", correct: "toca", options: ["toca", "tocó", "tocaba", "tocará"] },
  { tense: "presente", sentence: "Ellos generalmente __ tarde los sábados.", correct: "se despiertan", options: ["se despiertan", "se despertaron", "se despertaban", "se despertarán"] },
  { tense: "presente", sentence: "Todos los sábados yo __ la casa.", correct: "limpio", options: ["limpio", "limpié", "limpiaba", "limpiaré"] },
  { tense: "presente", sentence: "Mi hermana __ mucho por teléfono.", correct: "habla", options: ["habla", "habló", "hablaba", "hablará"] },
  { tense: "presente", sentence: "Ustedes normalmente __ tarde los domingos.", correct: "comen", options: ["comen", "comieron", "comían", "comerán"] },
  { tense: "presente", sentence: "Yo nunca __ mentiras.", correct: "digo", options: ["digo", "dije", "decía", "diré"] },
  { tense: "presente", sentence: "Tú siempre __ buenas decisiones.", correct: "tomas", options: ["tomas", "tomaste", "tomabas", "tomarás"] },
  { tense: "presente", sentence: "Mi vecino __ el periódico cada mañana.", correct: "compra", options: ["compra", "compró", "compraba", "comprará"] },
  { tense: "presente", sentence: "Los estudiantes generalmente __ mucho antes del examen.", correct: "repasan", options: ["repasan", "repasaron", "repasaban", "repasarán"] },
  { tense: "presente", sentence: "Yo __ el metro todos los días.", correct: "uso", options: ["uso", "usé", "usaba", "usaré"] },

  // ---- PRETÉRITO INDEFINIDO (A2): recognize a definite, completed past action ----
  { tense: "preterito", sentence: "Ayer yo __ a las ocho de la mañana.", correct: "llegué", options: ["llegué", "llego", "llegaba", "he llegado"] },
  { tense: "preterito", sentence: "Anoche ella __ una película.", correct: "vio", options: ["vio", "ve", "veía", "ha visto"] },
  { tense: "preterito", sentence: "El año pasado nosotros __ a España.", correct: "fuimos", options: ["fuimos", "vamos", "íbamos", "hemos ido"] },
  { tense: "preterito", sentence: "La semana pasada tú __ muy tarde.", correct: "saliste", options: ["saliste", "sales", "salías", "has salido"] },
  { tense: "preterito", sentence: "Hace dos días ellos __ la cena.", correct: "prepararon", options: ["prepararon", "preparan", "preparaban", "han preparado"] },
  { tense: "preterito", sentence: "Ayer yo __ un libro interesante.", correct: "leí", options: ["leí", "leo", "leía", "he leído"] },
  { tense: "preterito", sentence: "El lunes pasado ella __ tarde a la reunión.", correct: "llegó", options: ["llegó", "llega", "llegaba", "ha llegado"] },
  { tense: "preterito", sentence: "Anoche nosotros __ una fiesta.", correct: "hicimos", options: ["hicimos", "hacemos", "hacíamos", "hemos hecho"] },
  { tense: "preterito", sentence: "Yo __ la puerta con llave ayer.", correct: "cerré", options: ["cerré", "cierro", "cerraba", "he cerrado"] },
  { tense: "preterito", sentence: "¿Dónde __ ustedes ayer?", correct: "estuvieron", options: ["estuvieron", "están", "estaban", "han estado"] },
  { tense: "preterito", sentence: "Ella __ mucho trabajo la semana pasada.", correct: "tuvo", options: ["tuvo", "tiene", "tenía", "ha tenido"] },
  { tense: "preterito", sentence: "Yo __ a mis padres el domingo pasado.", correct: "visité", options: ["visité", "visito", "visitaba", "he visitado"] },
  { tense: "preterito", sentence: "Ellos __ el proyecto ayer.", correct: "terminaron", options: ["terminaron", "terminan", "terminaban", "han terminado"] },
  { tense: "preterito", sentence: "Tú me __ la respuesta correcta ayer.", correct: "diste", options: ["diste", "das", "dabas", "has dado"] },
  { tense: "preterito", sentence: "Nosotros __ un pastel para la fiesta anoche.", correct: "trajimos", options: ["trajimos", "traemos", "traíamos", "hemos traído"] },
  { tense: "preterito", sentence: "El mes pasado yo __ un carro nuevo.", correct: "compré", options: ["compré", "compro", "compraba", "he comprado"] },
  { tense: "preterito", sentence: "El sábado pasado yo __ a un concierto.", correct: "asistí", options: ["asistí", "asisto", "asistía", "asistiré"] },
  { tense: "preterito", sentence: "Anoche tú __ muy bien la presentación.", correct: "explicaste", options: ["explicaste", "explicas", "explicabas", "explicarás"] },
  { tense: "preterito", sentence: "La semana pasada ella __ un regalo a su madre.", correct: "envió", options: ["envió", "envía", "enviaba", "enviará"] },
  { tense: "preterito", sentence: "Ayer nosotros __ mucho en la reunión.", correct: "aprendimos", options: ["aprendimos", "aprendemos", "aprendíamos", "aprenderemos"] },
  { tense: "preterito", sentence: "El mes pasado ellos __ de casa.", correct: "se mudaron", options: ["se mudaron", "se mudan", "se mudaban", "se mudarán"] },
  { tense: "preterito", sentence: "Yo __ la respuesta correcta en el examen.", correct: "escribí", options: ["escribí", "escribo", "escribía", "escribiré"] },
  { tense: "preterito", sentence: "¿Cuándo __ tú a esta ciudad?", correct: "llegaste", options: ["llegaste", "llegas", "llegabas", "llegarás"] },
  { tense: "preterito", sentence: "Ella __ su coche la semana pasada.", correct: "vendió", options: ["vendió", "vende", "vendía", "venderá"] },
  { tense: "preterito", sentence: "Nosotros __ mucho durante la carrera.", correct: "corrimos", options: ["corrimos", "corremos", "corríamos", "correremos"] },
  { tense: "preterito", sentence: "Tú me __ un mensaje ayer.", correct: "enviaste", options: ["enviaste", "envías", "enviabas", "enviarás"] },
  { tense: "preterito", sentence: "Ellos __ toda la noche estudiando.", correct: "pasaron", options: ["pasaron", "pasan", "pasaban", "pasarán"] },
  { tense: "preterito", sentence: "Yo __ el coche en el garaje anoche.", correct: "guardé", options: ["guardé", "guardo", "guardaba", "guardaré"] },
  { tense: "preterito", sentence: "El otro día yo __ un accidente en la calle.", correct: "vi", options: ["vi", "veo", "veía", "veré"] },
  { tense: "preterito", sentence: "Anteayer tú __ toda la tarde en el gimnasio.", correct: "pasaste", options: ["pasaste", "pasas", "pasabas", "pasarás"] },
  { tense: "preterito", sentence: "El verano pasado ella __ a vivir a otra ciudad.", correct: "se fue", options: ["se fue", "se va", "se iba", "se irá"] },
  { tense: "preterito", sentence: "Nosotros __ la sorpresa perfectamente.", correct: "escondimos", options: ["escondimos", "escondemos", "escondíamos", "esconderemos"] },
  { tense: "preterito", sentence: "El año pasado ellos __ su primer hijo.", correct: "tuvieron", options: ["tuvieron", "tienen", "tenían", "tendrán"] },
  { tense: "preterito", sentence: "Ayer yo __ un correo importante.", correct: "recibí", options: ["recibí", "recibo", "recibía", "recibiré"] },
  { tense: "preterito", sentence: "¿Qué __ tú anoche en la fiesta?", correct: "hiciste", options: ["hiciste", "haces", "hacías", "harás"] },
  { tense: "preterito", sentence: "El profesor __ la lección de forma muy clara.", correct: "explicó", options: ["explicó", "explica", "explicaba", "explicará"] },
  { tense: "preterito", sentence: "Nosotros __ pronto para no llegar tarde.", correct: "volvimos", options: ["volvimos", "volvemos", "volvíamos", "volveremos"] },
  { tense: "preterito", sentence: "Tú __ la puerta sin querer.", correct: "rompiste", options: ["rompiste", "rompes", "rompías", "romperás"] },

  // ---- IMPERFECTO (B1): recognize a habitual/ongoing past action ----
  { tense: "imperfecto", sentence: "Cuando yo era niño, __ mucho en el parque.", correct: "jugaba", options: ["jugaba", "jugué", "juego", "he jugado"] },
  { tense: "imperfecto", sentence: "Antes nosotros __ una casa pequeña.", correct: "teníamos", options: ["teníamos", "tuvimos", "tenemos", "hemos tenido"] },
  { tense: "imperfecto", sentence: "De niña, ella __ el pelo largo.", correct: "tenía", options: ["tenía", "tuvo", "tiene", "ha tenido"] },
  { tense: "imperfecto", sentence: "Mientras yo __ la cena, sonó el teléfono.", correct: "preparaba", options: ["preparaba", "preparé", "preparo", "he preparado"] },
  { tense: "imperfecto", sentence: "En aquella época, tú __ mucho miedo a la oscuridad.", correct: "tenías", options: ["tenías", "tuviste", "tienes", "has tenido"] },
  { tense: "imperfecto", sentence: "Todos los veranos, ellos __ a la playa de niños.", correct: "iban", options: ["iban", "fueron", "van", "han ido"] },
  { tense: "imperfecto", sentence: "Antes yo __ en Madrid.", correct: "vivía", options: ["vivía", "viví", "vivo", "he vivido"] },
  { tense: "imperfecto", sentence: "De joven, mi abuelo __ mucho.", correct: "trabajaba", options: ["trabajaba", "trabajó", "trabaja", "ha trabajado"] },
  { tense: "imperfecto", sentence: "Cuando ella era estudiante, __ todos los días.", correct: "estudiaba", options: ["estudiaba", "estudió", "estudia", "ha estudiado"] },
  { tense: "imperfecto", sentence: "Antes nosotros __ mucho café.", correct: "bebíamos", options: ["bebíamos", "bebimos", "bebemos", "hemos bebido"] },
  { tense: "imperfecto", sentence: "Mientras tú __, yo cociné.", correct: "dormías", options: ["dormías", "dormiste", "duermes", "has dormido"] },
  { tense: "imperfecto", sentence: "De pequeña, ella siempre __ en el coro.", correct: "cantaba", options: ["cantaba", "cantó", "canta", "ha cantado"] },
  { tense: "imperfecto", sentence: "Antes, ellos __ muchas cartas.", correct: "escribían", options: ["escribían", "escribieron", "escriben", "han escrito"] },
  { tense: "imperfecto", sentence: "Cuando yo tenía diez años, __ cada tarde en el río.", correct: "nadaba", options: ["nadaba", "nadé", "nado", "he nadado"] },
  { tense: "imperfecto", sentence: "De joven, tú __ muy tímido.", correct: "eras", options: ["eras", "fuiste", "eres", "has sido"] },
  { tense: "imperfecto", sentence: "Antes, la ciudad __ más tranquila.", correct: "era", options: ["era", "fue", "es", "ha sido"] },
  { tense: "imperfecto", sentence: "Cuando era joven, mi madre __ todas las noches.", correct: "leía", options: ["leía", "leyó", "lee", "ha leído"] },
  { tense: "imperfecto", sentence: "Antes nosotros __ al parque cada domingo.", correct: "íbamos", options: ["íbamos", "fuimos", "vamos", "hemos ido"] },
  { tense: "imperfecto", sentence: "De niño, tú __ mucho a tus abuelos.", correct: "visitabas", options: ["visitabas", "visitaste", "visitas", "has visitado"] },
  { tense: "imperfecto", sentence: "Mientras ellos __ la cena, yo puse la mesa.", correct: "cocinaban", options: ["cocinaban", "cocinaron", "cocinan", "han cocinado"] },
  { tense: "imperfecto", sentence: "Antes, mi abuela __ pan casero los domingos.", correct: "hacía", options: ["hacía", "hizo", "hace", "ha hecho"] },
  { tense: "imperfecto", sentence: "Cuando yo era pequeño, __ todas las tardes en el jardín.", correct: "jugaba", options: ["jugaba", "jugué", "juego", "he jugado"] },
  { tense: "imperfecto", sentence: "Cuando yo tenía veinte años, __ mucho dinero.", correct: "ahorraba", options: ["ahorraba", "ahorré", "ahorro", "he ahorrado"] },
  { tense: "imperfecto", sentence: "Antes, mis padres __ muy estrictos.", correct: "eran", options: ["eran", "fueron", "son", "han sido"] },
  { tense: "imperfecto", sentence: "De pequeños, ellos __ en aquel colegio.", correct: "estudiaban", options: ["estudiaban", "estudiaron", "estudian", "han estudiado"] },
  { tense: "imperfecto", sentence: "Mientras yo __ la casa, empezó a llover.", correct: "pintaba", options: ["pintaba", "pinté", "pinto", "he pintado"] },
  { tense: "imperfecto", sentence: "Cuando tú eras niño, __ muchos dulces.", correct: "comías", options: ["comías", "comiste", "comes", "has comido"] },
  { tense: "imperfecto", sentence: "Antes, ella __ miedo a volar.", correct: "tenía", options: ["tenía", "tuvo", "tiene", "ha tenido"] },
  { tense: "imperfecto", sentence: "De joven, mi tío __ en un barco.", correct: "viajaba", options: ["viajaba", "viajó", "viaja", "ha viajado"] },
  { tense: "imperfecto", sentence: "Todas las tardes, ellos __ música juntos.", correct: "escuchaban", options: ["escuchaban", "escucharon", "escuchan", "han escuchado"] },
  { tense: "imperfecto", sentence: "Cuando era joven, yo __ muy rápido.", correct: "corría", options: ["corría", "corrí", "corro", "he corrido"] },
  { tense: "imperfecto", sentence: "Antes, tú __ en aquel barrio.", correct: "vivías", options: ["vivías", "viviste", "vives", "has vivido"] },

  // ---- PRETÉRITO PERFECTO COMPUESTO (B2): recognize a completed action linked to the present ----
  { tense: "perfecto", sentence: "Yo ya __ a tiempo.", correct: "he llegado", options: ["he llegado", "llegué", "llego", "llegaba"] },
  { tense: "perfecto", sentence: "¿Tú ya __ la tarea?", correct: "has terminado", options: ["has terminado", "terminaste", "terminas", "terminabas"] },
  { tense: "perfecto", sentence: "Nosotros ya __ esa película.", correct: "hemos visto", options: ["hemos visto", "vimos", "vemos", "veíamos"] },
  { tense: "perfecto", sentence: "Ellos todavía no __ la carta.", correct: "han escrito", options: ["han escrito", "escribieron", "escriben", "escribían"] },
  { tense: "perfecto", sentence: "Ella nunca __ a Japón.", correct: "ha ido", options: ["ha ido", "fue", "va", "iba"] },
  { tense: "perfecto", sentence: "Yo ya __ el libro.", correct: "he leído", options: ["he leído", "leí", "leo", "leía"] },
  { tense: "perfecto", sentence: "¿Ustedes __ la noticia recientemente?", correct: "han oído", options: ["han oído", "oyeron", "oyen", "oían"] },
  { tense: "perfecto", sentence: "Últimamente yo __ mucho.", correct: "he trabajado", options: ["he trabajado", "trabajé", "trabajo", "trabajaba"] },
  { tense: "perfecto", sentence: "¿Qué __ tú hasta ahora?", correct: "has hecho", options: ["has hecho", "hiciste", "haces", "hacías"] },
  { tense: "perfecto", sentence: "Yo todavía no __ la respuesta.", correct: "he dicho", options: ["he dicho", "dije", "digo", "decía"] },
  { tense: "perfecto", sentence: "Ella ya __ el problema.", correct: "ha resuelto", options: ["ha resuelto", "resolvió", "resuelve", "resolvía"] },
  { tense: "perfecto", sentence: "Yo ya __ la puerta.", correct: "he abierto", options: ["he abierto", "abrí", "abro", "abría"] },
  { tense: "perfecto", sentence: "Ellos ya __ el examen.", correct: "han aprobado", options: ["han aprobado", "aprobaron", "aprueban", "aprobaban"] },
  { tense: "perfecto", sentence: "¿Tú __ alguna vez a Rusia?", correct: "has viajado", options: ["has viajado", "viajaste", "viajas", "viajabas"] },
  { tense: "perfecto", sentence: "Yo ya __ la mesa.", correct: "he puesto", options: ["he puesto", "puse", "pongo", "ponía"] },
  { tense: "perfecto", sentence: "Nosotros __ el coche recientemente.", correct: "hemos vendido", options: ["hemos vendido", "vendimos", "vendemos", "vendíamos"] },
  { tense: "perfecto", sentence: "Todavía no __ el correo.", correct: "he revisado", options: ["he revisado", "revisé", "reviso", "revisaba"] },
  { tense: "perfecto", sentence: "¿__ tú alguna vez a Argentina?", correct: "has estado", options: ["has estado", "estuviste", "estás", "estabas"] },
  { tense: "perfecto", sentence: "Nosotros ya __ todos los boletos.", correct: "hemos vendido", options: ["hemos vendido", "vendimos", "vendemos", "vendíamos"] },
  { tense: "perfecto", sentence: "Ella nunca __ tal cosa.", correct: "ha dicho", options: ["ha dicho", "dijo", "dice", "decía"] },
  { tense: "perfecto", sentence: "Yo ya __ mi maleta para el viaje.", correct: "he hecho", options: ["he hecho", "hice", "hago", "hacía"] },
  { tense: "perfecto", sentence: "¿Ya __ ustedes la decisión?", correct: "han tomado", options: ["han tomado", "tomaron", "toman", "tomaban"] },
  { tense: "perfecto", sentence: "Recientemente yo __ mucho estrés.", correct: "he sentido", options: ["he sentido", "sentí", "siento", "sentía"] },
  { tense: "perfecto", sentence: "Tú todavía no me __ la verdad.", correct: "has contado", options: ["has contado", "contaste", "cuentas", "contabas"] },
  { tense: "perfecto", sentence: "Nunca __ algo tan delicioso.", correct: "he probado", options: ["he probado", "probé", "pruebo", "probaba"] },
  { tense: "perfecto", sentence: "¿__ tú el mensaje que te envié?", correct: "has visto", options: ["has visto", "viste", "ves", "veías"] },
  { tense: "perfecto", sentence: "Ella nunca __ tanto miedo.", correct: "ha sentido", options: ["ha sentido", "sintió", "siente", "sentía"] },
  { tense: "perfecto", sentence: "Ellos ya __ la reunión.", correct: "han organizado", options: ["han organizado", "organizaron", "organizan", "organizaban"] },
  { tense: "perfecto", sentence: "Yo todavía no __ mis maletas.", correct: "he deshecho", options: ["he deshecho", "deshice", "deshago", "deshacía"] },
  { tense: "perfecto", sentence: "¿__ ustedes alguna vez comida picante?", correct: "han probado", options: ["han probado", "probaron", "prueban", "probaban"] },
  { tense: "perfecto", sentence: "Tú __ mucho este semestre.", correct: "has mejorado", options: ["has mejorado", "mejoraste", "mejoras", "mejorabas"] },
  { tense: "perfecto", sentence: "Yo ya __ todo el dinero que necesitaba.", correct: "he ahorrado", options: ["he ahorrado", "ahorré", "ahorro", "ahorraba"] },
  { tense: "perfecto", sentence: "Ella nunca __ una mentira.", correct: "ha contado", options: ["ha contado", "contó", "cuenta", "contaba"] },
  { tense: "perfecto", sentence: "Ellos ya __ la respuesta correcta.", correct: "han encontrado", options: ["han encontrado", "encontraron", "encuentran", "encontraban"] },

  // ---- FUTURO / CONDICIONAL (C1): recognize a future plan vs a hypothetical ----
  { tense: "futuro", sentence: "Mañana yo __ a la fiesta.", correct: "iré", options: ["iré", "voy", "fui", "iría"] },
  { tense: "futuro", sentence: "El próximo año yo __ el proyecto.", correct: "terminaré", options: ["terminaré", "termino", "terminé", "terminaría"] },
  { tense: "futuro", sentence: "¿Tú __ conmigo mañana?", correct: "vendrás", options: ["vendrás", "vienes", "viniste", "vendrías"] },
  { tense: "futuro", sentence: "Algún día ellos __ mucho dinero.", correct: "tendrán", options: ["tendrán", "tienen", "tuvieron", "tendrían"] },
  { tense: "futuro", sentence: "Pronto yo __ la verdad.", correct: "sabré", options: ["sabré", "sé", "supe", "sabría"] },
  { tense: "futuro", sentence: "Esta noche ella __ la tarea.", correct: "hará", options: ["hará", "hace", "hizo", "haría"] },
  { tense: "futuro", sentence: "El próximo mes nosotros __ salir temprano.", correct: "podremos", options: ["podremos", "podemos", "pudimos", "podríamos"] },
  { tense: "futuro", sentence: "¿Qué __ ustedes el próximo verano?", correct: "harán", options: ["harán", "hacen", "hicieron", "harían"] },
  { tense: "futuro", sentence: "El año que viene, nosotros __ a otro país.", correct: "nos mudaremos", options: ["nos mudaremos", "nos mudamos", "nos mudábamos", "nos mudaríamos"] },
  { tense: "futuro", sentence: "Ella __ el proyecto la próxima semana.", correct: "empezará", options: ["empezará", "empieza", "empezó", "empezaría"] },
  { tense: "futuro", sentence: "¿Dónde __ ustedes las vacaciones este año?", correct: "pasarán", options: ["pasarán", "pasan", "pasaron", "pasarían"] },
  { tense: "futuro", sentence: "Yo te __ en cuanto llegue.", correct: "llamaré", options: ["llamaré", "llamo", "llamé", "llamaría"] },
  { tense: "futuro", sentence: "Mañana nosotros __ el examen.", correct: "presentaremos", options: ["presentaremos", "presentamos", "presentábamos", "presentaríamos"] },
  { tense: "futuro", sentence: "Algún día tú __ tus sueños.", correct: "cumplirás", options: ["cumplirás", "cumples", "cumpliste", "cumplirías"] },
  { tense: "futuro", sentence: "El próximo mes ellos __ una nueva casa.", correct: "comprarán", options: ["comprarán", "compran", "compraron", "comprarían"] },
  { tense: "futuro", sentence: "Esta tarde yo __ contigo al médico.", correct: "acompañaré", options: ["acompañaré", "acompaño", "acompañé", "acompañaría"] },
  { tense: "futuro", sentence: "El próximo año yo __ un nuevo idioma.", correct: "aprenderé", options: ["aprenderé", "aprendo", "aprendí", "aprendía"] },
  { tense: "futuro", sentence: "Mañana nosotros __ toda la casa.", correct: "barreremos", options: ["barreremos", "barremos", "barrimos", "barríamos"] },
  { tense: "futuro", sentence: "El próximo mes tú __ de trabajo.", correct: "cambiarás", options: ["cambiarás", "cambias", "cambiaste", "cambiabas"] },
  { tense: "futuro", sentence: "Algún día ella __ su propio negocio.", correct: "tendrá", options: ["tendrá", "tiene", "tuvo", "tenía"] },
  { tense: "futuro", sentence: "La próxima semana ellos __ la casa nueva.", correct: "pintarán", options: ["pintarán", "pintan", "pintaron", "pintaban"] },
  { tense: "futuro", sentence: "Esta noche yo __ temprano.", correct: "dormiré", options: ["dormiré", "duermo", "dormí", "dormía"] },
  { tense: "futuro", sentence: "El año que viene nosotros __ más ejercicio.", correct: "haremos", options: ["haremos", "hacemos", "hicimos", "hacíamos"] },
  { tense: "futuro", sentence: "¿Cuándo __ tú la verdad?", correct: "sabrás", options: ["sabrás", "sabes", "supiste", "sabías"] },
  { tense: "futuro", sentence: "Pronto ella __ mejor.", correct: "se sentirá", options: ["se sentirá", "se siente", "se sintió", "se sentía"] },
  { tense: "futuro", sentence: "El sábado nosotros __ una película nueva.", correct: "veremos", options: ["veremos", "vemos", "vimos", "veíamos"] },
  { tense: "futuro", sentence: "Ustedes __ la respuesta mañana.", correct: "recibirán", options: ["recibirán", "reciben", "recibieron", "recibían"] },
  { tense: "futuro", sentence: "Yo te __ en cuanto pueda.", correct: "ayudaré", options: ["ayudaré", "ayudo", "ayudé", "ayudaba"] },
  { tense: "futuro", sentence: "El próximo verano yo __ a mis abuelos.", correct: "visitaré", options: ["visitaré", "visito", "visité", "visitaba"] },
  { tense: "futuro", sentence: "Mañana ellos __ la reunión a las diez.", correct: "empezarán", options: ["empezarán", "empiezan", "empezaron", "empezaban"] },
  { tense: "futuro", sentence: "El lunes tú __ los resultados.", correct: "recibirás", options: ["recibirás", "recibes", "recibiste", "recibías"] },
  { tense: "futuro", sentence: "Algún día ellos __ juntos un negocio.", correct: "montarán", options: ["montarán", "montan", "montaron", "montaban"] },
  { tense: "futuro", sentence: "Esta tarde yo __ un poco antes de salir.", correct: "descansaré", options: ["descansaré", "descanso", "descansé", "descansaba"] },
  { tense: "futuro", sentence: "¿Qué __ tú cuando termines la carrera?", correct: "harás", options: ["harás", "haces", "hiciste", "hacías"] },
  { tense: "futuro", sentence: "El próximo año ella __ a otro país.", correct: "se mudará", options: ["se mudará", "se muda", "se mudó", "se mudaba"] },
  { tense: "futuro", sentence: "Nosotros __ la casa antes del invierno.", correct: "venderemos", options: ["venderemos", "vendemos", "vendimos", "vendíamos"] },
  { tense: "futuro", sentence: "Ustedes __ mucho con esta clase.", correct: "aprenderán", options: ["aprenderán", "aprenden", "aprendieron", "aprendían"] },
  { tense: "futuro", sentence: "Yo __ contigo hasta el final.", correct: "me quedaré", options: ["me quedaré", "me quedo", "me quedé", "me quedaba"] },
  { tense: "condicional", sentence: "Yo __ un café ahora mismo, si pudiera.", correct: "querría", options: ["querría", "quiero", "quise", "querré"] },
  { tense: "condicional", sentence: "¿Tú __ eso en mi lugar?", correct: "harías", options: ["harías", "haces", "hiciste", "harás"] },
  { tense: "condicional", sentence: "Yo __ más si tuviera tiempo.", correct: "viajaría", options: ["viajaría", "viajo", "viajé", "viajaré"] },
  { tense: "condicional", sentence: "Ella __ feliz si tú vinieras.", correct: "estaría", options: ["estaría", "está", "estuvo", "estará"] },
  { tense: "condicional", sentence: "Ellos __ ayudarte si pudieran.", correct: "podrían", options: ["podrían", "pueden", "pudieron", "podrán"] },
  { tense: "condicional", sentence: "Yo __ contigo, pero no puedo.", correct: "iría", options: ["iría", "voy", "fui", "iré"] },
  { tense: "condicional", sentence: "¿Qué __ tú en esa situación?", correct: "dirías", options: ["dirías", "dices", "dijiste", "dirás"] },
  { tense: "condicional", sentence: "Nosotros __ salir esta noche, si nos invitaran.", correct: "querríamos", options: ["querríamos", "queremos", "quisimos", "querremos"] },
  { tense: "condicional", sentence: "Con más tiempo, yo __ el libro entero.", correct: "leería", options: ["leería", "leo", "leí", "leeré"] },
  { tense: "condicional", sentence: "¿Qué __ tú si ganaras la lotería?", correct: "comprarías", options: ["comprarías", "compras", "compraste", "comprarás"] },
  { tense: "condicional", sentence: "Nosotros __ contigo, pero está lloviendo.", correct: "saldríamos", options: ["saldríamos", "salimos", "salíamos", "saldremos"] },
  { tense: "condicional", sentence: "Ella nunca __ eso sin pensarlo.", correct: "diría", options: ["diría", "dice", "dijo", "dirá"] },
  { tense: "condicional", sentence: "Ellos __ felices con la noticia.", correct: "se pondrían", options: ["se pondrían", "se ponen", "se pusieron", "se pondrán"] },
  { tense: "condicional", sentence: "Yo __ más si tuviera más energía.", correct: "trabajaría", options: ["trabajaría", "trabajo", "trabajé", "trabajaré"] },
  { tense: "condicional", sentence: "Ustedes __ capaces de terminarlo a tiempo.", correct: "serían", options: ["serían", "son", "fueron", "serán"] },
  { tense: "condicional", sentence: "Con otro jefe, nosotros __ más motivados.", correct: "nos sentiríamos", options: ["nos sentiríamos", "nos sentimos", "nos sentíamos", "nos sentiremos"] },
  { tense: "condicional", sentence: "Yo __ una casa más grande si ganara la lotería.", correct: "compraría", options: ["compraría", "compro", "compré", "compraba"] },
  { tense: "condicional", sentence: "Tú __ capaz de hacerlo solo.", correct: "serías", options: ["serías", "eres", "fuiste", "eras"] },
  { tense: "condicional", sentence: "Ella __ feliz con ese regalo.", correct: "estaría", options: ["estaría", "está", "estuvo", "estaba"] },
  { tense: "condicional", sentence: "Nosotros __ mucho gusto en ayudarte.", correct: "tendríamos", options: ["tendríamos", "tenemos", "tuvimos", "teníamos"] },
  { tense: "condicional", sentence: "Ellos __ antes si supieran la verdad.", correct: "vendrían", options: ["vendrían", "vienen", "vinieron", "venían"] },
  { tense: "condicional", sentence: "¿Qué __ ustedes en mi lugar?", correct: "harían", options: ["harían", "hacen", "hicieron", "hacían"] },
  { tense: "condicional", sentence: "Yo nunca __ eso sin pensarlo.", correct: "haría", options: ["haría", "hago", "hice", "hacía"] },
  { tense: "condicional", sentence: "Tú __ mejor si practicaras más.", correct: "jugarías", options: ["jugarías", "juegas", "jugaste", "jugabas"] },
  { tense: "condicional", sentence: "Nosotros __ el problema si tuviéramos más datos.", correct: "resolveríamos", options: ["resolveríamos", "resolvemos", "resolvimos", "resolvíamos"] },
  { tense: "condicional", sentence: "Con más suerte, ella __ el premio.", correct: "ganaría", options: ["ganaría", "gana", "ganó", "ganaba"] },
  { tense: "condicional", sentence: "Yo __ ese trabajo sin dudarlo.", correct: "aceptaría", options: ["aceptaría", "acepto", "acepté", "aceptaba"] },
  { tense: "condicional", sentence: "¿__ tú dispuesto a ayudarme?", correct: "estarías", options: ["estarías", "estás", "estuviste", "estabas"] },
  { tense: "condicional", sentence: "Ella __ mejor si durmiera más.", correct: "rendiría", options: ["rendiría", "rinde", "rindió", "rendía"] },
  { tense: "condicional", sentence: "Ellos __ el viaje si tuvieran vacaciones.", correct: "planearían", options: ["planearían", "planean", "planearon", "planeaban"] },
  { tense: "condicional", sentence: "Ustedes __ mejor en equipo.", correct: "trabajarían", options: ["trabajarían", "trabajan", "trabajaron", "trabajaban"] },
  { tense: "condicional", sentence: "Yo te __ toda la verdad.", correct: "contaría", options: ["contaría", "cuento", "conté", "contaba"] },
  { tense: "condicional", sentence: "Tú __ más tranquilo sin tanto trabajo.", correct: "te sentirías", options: ["te sentirías", "te sientes", "te sentiste", "te sentías"] },
  { tense: "condicional", sentence: "Ellos __ la verdad tarde o temprano.", correct: "descubrirían", options: ["descubrirían", "descubren", "descubrieron", "descubrían"] },
  { tense: "condicional", sentence: "Yo __ más si tuviera un mentor.", correct: "progresaría", options: ["progresaría", "progreso", "progresé", "progresaba"] },
  { tense: "condicional", sentence: "¿Cuánto __ este proyecto?", correct: "costaría", options: ["costaría", "cuesta", "costó", "costaba"] },

  // ---- SUBJUNTIVO (C2): recognize when a trigger phrase demands the subjunctive ----
  { tense: "subjuntivo", sentence: "Espero que tú __ bien.", correct: "estés", options: ["estés", "estás", "estuviste", "estabas"] },
  { tense: "subjuntivo", sentence: "Quiero que ellos __ la verdad.", correct: "sepan", options: ["sepan", "saben", "supieron", "sabían"] },
  { tense: "subjuntivo", sentence: "Es importante que yo __ a tiempo.", correct: "llegue", options: ["llegue", "llego", "llegué", "llegaba"] },
  { tense: "subjuntivo", sentence: "Ojalá que yo __ el examen.", correct: "apruebe", options: ["apruebe", "apruebo", "aprobé", "aprobaba"] },
  { tense: "subjuntivo", sentence: "No creo que ella __ la razón.", correct: "tenga", options: ["tenga", "tiene", "tuvo", "tenía"] },
  { tense: "subjuntivo", sentence: "Dudo que tú __ eso sola.", correct: "hagas", options: ["hagas", "haces", "hiciste", "hacías"] },
  { tense: "subjuntivo", sentence: "Mis padres quieren que yo __ médico.", correct: "sea", options: ["sea", "soy", "fui", "era"] },
  { tense: "subjuntivo", sentence: "Es posible que ellos __ mañana.", correct: "vengan", options: ["vengan", "vienen", "vinieron", "venían"] },
  { tense: "subjuntivo", sentence: "Espero que nosotros __ ganar.", correct: "podamos", options: ["podamos", "podemos", "pudimos", "podíamos"] },
  { tense: "subjuntivo", sentence: "Quiero que tú __ conmigo.", correct: "vayas", options: ["vayas", "vas", "fuiste", "ibas"] },
  { tense: "subjuntivo", sentence: "Es necesario que ella __ más.", correct: "estudie", options: ["estudie", "estudia", "estudió", "estudiaba"] },
  { tense: "subjuntivo", sentence: "Ojalá que nosotros __ pronto.", correct: "volvamos", options: ["volvamos", "volvemos", "volvimos", "volvíamos"] },
  { tense: "subjuntivo", sentence: "No pienso que ellos __ razón.", correct: "tengan", options: ["tengan", "tienen", "tuvieron", "tenían"] },
  { tense: "subjuntivo", sentence: "Es raro que ellos no __ nada.", correct: "digan", options: ["digan", "dicen", "dijeron", "decían"] },
  { tense: "subjuntivo", sentence: "Prefiero que ella __ la puerta.", correct: "cierre", options: ["cierre", "cierra", "cerró", "cerraba"] },
  { tense: "subjuntivo", sentence: "Me alegra que nosotros __ juntos.", correct: "estemos", options: ["estemos", "estamos", "estuvimos", "estábamos"] },
  // Regular -ar/-er/-ir verbs, so the underlying pattern (-ar -> -e, -er/-ir -> -a) is
  // visible on its own, not just buried inside irregular verbs.
  { tense: "subjuntivo", sentence: "Quiero que tú __ más despacio.", correct: "hables", options: ["hables", "hablas", "hablaste", "hablabas"] },
  { tense: "subjuntivo", sentence: "Es importante que nosotros __ para el examen.", correct: "estudiemos", options: ["estudiemos", "estudiamos", "estudiábamos", "estudiaremos"] },
  { tense: "subjuntivo", sentence: "Espero que ella __ menos este año.", correct: "trabaje", options: ["trabaje", "trabaja", "trabajó", "trabajaba"] },
  { tense: "subjuntivo", sentence: "Ojalá que tú __ el regalo a tiempo.", correct: "compres", options: ["compres", "compras", "compraste", "comprabas"] },
  { tense: "subjuntivo", sentence: "Quiero que ustedes __ con atención.", correct: "escuchen", options: ["escuchen", "escuchan", "escucharon", "escuchaban"] },
  { tense: "subjuntivo", sentence: "Quiero que tú __ verduras todos los días.", correct: "comas", options: ["comas", "comes", "comiste", "comías"] },
  { tense: "subjuntivo", sentence: "Es necesario que nosotros __ más rápido.", correct: "aprendamos", options: ["aprendamos", "aprendemos", "aprendimos", "aprendíamos"] },
  { tense: "subjuntivo", sentence: "Espero que ellos __ suficiente agua.", correct: "beban", options: ["beban", "beben", "bebieron", "bebían"] },
  { tense: "subjuntivo", sentence: "No creo que él __ la lección.", correct: "comprenda", options: ["comprenda", "comprende", "comprendió", "comprendía"] },
  { tense: "subjuntivo", sentence: "Quiero que ella __ la carta hoy.", correct: "escriba", options: ["escriba", "escribe", "escribió", "escribía"] },
  { tense: "subjuntivo", sentence: "Es importante que tú __ más tranquilo.", correct: "vivas", options: ["vivas", "vives", "viviste", "vivías"] },
  { tense: "subjuntivo", sentence: "Ojalá que nosotros __ buenas noticias.", correct: "recibamos", options: ["recibamos", "recibimos", "recibíamos", "recibiremos"] },
  { tense: "subjuntivo", sentence: "Dudo que ellos __ la tienda tan temprano.", correct: "abran", options: ["abran", "abren", "abrieron", "abrían"] },
  { tense: "subjuntivo", sentence: "Espero que tú __ bien.", correct: "decidas", options: ["decidas", "decides", "decidiste", "decidías"] },
  { tense: "subjuntivo", sentence: "Temo que ellos no __ a tiempo.", correct: "lleguen", options: ["lleguen", "llegan", "llegaron", "llegaban"] },
  { tense: "subjuntivo", sentence: "Te aconsejo que __ más agua.", correct: "bebas", options: ["bebas", "bebes", "bebiste", "bebías"] },
  { tense: "subjuntivo", sentence: "Para que todo __ bien, hay que planificar.", correct: "salga", options: ["salga", "sale", "salió", "salía"] },
  { tense: "subjuntivo", sentence: "Es raro que tú no __ nada.", correct: "digas", options: ["digas", "dices", "dijiste", "decías"] },
  { tense: "subjuntivo", sentence: "No pienso que ella __ razón esta vez.", correct: "tenga", options: ["tenga", "tiene", "tuvo", "tenía"] },
  { tense: "subjuntivo", sentence: "Aunque __ cansado, iré a la fiesta.", correct: "esté", options: ["esté", "estoy", "estuve", "estaba"] },

  // ---- PLUSCUAMPERFECTO (C1): action completed before another past action ----
  { tense: "pluscuamperfecto", sentence: "Cuando yo llegué a la fiesta, ellos ya __.", correct: "se habían ido", options: ["se habían ido", "se han ido", "se fueron", "se iban"] },
  { tense: "pluscuamperfecto", sentence: "Antes de mudarnos, nosotros ya __ ese barrio.", correct: "habíamos visitado", options: ["habíamos visitado", "hemos visitado", "visitamos", "visitábamos"] },
  { tense: "pluscuamperfecto", sentence: "Cuando ella llamó, yo ya __ la cena.", correct: "había preparado", options: ["había preparado", "he preparado", "preparé", "preparaba"] },
  { tense: "pluscuamperfecto", sentence: "Cuando el médico llegó, el paciente ya __.", correct: "había muerto", options: ["había muerto", "ha muerto", "murió", "moría"] },
  { tense: "pluscuamperfecto", sentence: "Antes de aquel año, tú nunca __ a Europa.", correct: "habías viajado", options: ["habías viajado", "has viajado", "viajaste", "viajabas"] },
  { tense: "pluscuamperfecto", sentence: "Cuando empezó la película, nosotros ya __ las palomitas.", correct: "habíamos comprado", options: ["habíamos comprado", "hemos comprado", "compramos", "comprábamos"] },
  { tense: "pluscuamperfecto", sentence: "Ella dijo que ya __ el libro dos veces.", correct: "había leído", options: ["había leído", "ha leído", "leyó", "leía"] },
  { tense: "pluscuamperfecto", sentence: "Cuando sonó el despertador, yo ya __.", correct: "me había despertado", options: ["me había despertado", "me he despertado", "me desperté", "me despertaba"] },
  { tense: "pluscuamperfecto", sentence: "Antes de la reunión, ellos ya __ el informe.", correct: "habían terminado", options: ["habían terminado", "han terminado", "terminaron", "terminaban"] },
  { tense: "pluscuamperfecto", sentence: "Cuando llegamos al aeropuerto, el avión ya __.", correct: "había salido", options: ["había salido", "ha salido", "salió", "salía"] },
  { tense: "pluscuamperfecto", sentence: "Tú me contaste que ya __ la noticia.", correct: "habías oído", options: ["habías oído", "has oído", "oíste", "oías"] },
  { tense: "pluscuamperfecto", sentence: "Cuando volví a casa, mi madre ya __ la mesa.", correct: "había puesto", options: ["había puesto", "ha puesto", "puso", "ponía"] },
  { tense: "pluscuamperfecto", sentence: "Antes del examen, nosotros ya __ toda la noche.", correct: "habíamos estudiado", options: ["habíamos estudiado", "hemos estudiado", "estudiamos", "estudiábamos"] },
  { tense: "pluscuamperfecto", sentence: "Cuando desperté, ya __.", correct: "había amanecido", options: ["había amanecido", "ha amanecido", "amaneció", "amanecía"] },
  { tense: "pluscuamperfecto", sentence: "Ellos afirmaron que nunca __ tal cosa.", correct: "habían visto", options: ["habían visto", "han visto", "vieron", "veían"] },
  { tense: "pluscuamperfecto", sentence: "Antes de conocerte, yo nunca __ tan feliz.", correct: "había sido", options: ["había sido", "he sido", "fui", "era"] },
  { tense: "pluscuamperfecto", sentence: "Cuando llegamos, la tienda ya __.", correct: "había cerrado", options: ["había cerrado", "ha cerrado", "cerró", "cerraba"] },
  { tense: "pluscuamperfecto", sentence: "Ella me confesó que ya __ la carta.", correct: "había roto", options: ["había roto", "ha roto", "rompió", "rompía"] },
  { tense: "pluscuamperfecto", sentence: "Cuando encendí la tele, el partido ya __.", correct: "había empezado", options: ["había empezado", "ha empezado", "empezó", "empezaba"] },
  { tense: "pluscuamperfecto", sentence: "Antes de graduarme, ya __ trabajo.", correct: "había encontrado", options: ["había encontrado", "ha encontrado", "encontré", "encontraba"] },
  { tense: "pluscuamperfecto", sentence: "Ella contó que nunca __ tanto frío.", correct: "había sentido", options: ["había sentido", "ha sentido", "sintió", "sentía"] },
  { tense: "pluscuamperfecto", sentence: "Cuando abrí la nevera, la comida ya __.", correct: "se había estropeado", options: ["se había estropeado", "se ha estropeado", "se estropeó", "se estropeaba"] },
  { tense: "pluscuamperfecto", sentence: "Antes del accidente, él nunca __ un hospital.", correct: "había pisado", options: ["había pisado", "ha pisado", "pisó", "pisaba"] },
  { tense: "pluscuamperfecto", sentence: "Cuando llegó la policía, el ladrón ya __.", correct: "había escapado", options: ["había escapado", "ha escapado", "escapó", "escapaba"] },
  { tense: "pluscuamperfecto", sentence: "Nosotros ya __ la respuesta cuando preguntaron.", correct: "habíamos adivinado", options: ["habíamos adivinado", "hemos adivinado", "adivinamos", "adivinábamos"] },
  { tense: "pluscuamperfecto", sentence: "Tú me dijiste que ya __ las maletas.", correct: "habías hecho", options: ["habías hecho", "has hecho", "hiciste", "hacías"] },
  { tense: "pluscuamperfecto", sentence: "Cuando desperté, mis padres ya __ al trabajo.", correct: "se habían ido", options: ["se habían ido", "se han ido", "se fueron", "se iban"] },
  { tense: "pluscuamperfecto", sentence: "Ellos afirmaron que ya __ el dinero.", correct: "habían ahorrado", options: ["habían ahorrado", "han ahorrado", "ahorraron", "ahorraban"] },

  // ---- IMPERATIVO (C1): recognize the command form (tú/usted/nosotros/ustedes) ----
  { tense: "imperativo", sentence: "¡Pedro, __ la puerta, por favor!", correct: "cierra", options: ["cierra", "cierras", "cerraste", "cerrarás"] },
  { tense: "imperativo", sentence: "Señor López, __ conmigo un momento.", correct: "venga", options: ["venga", "viene", "vino", "vendrá"] },
  { tense: "imperativo", sentence: "¡Niños, __ silencio!", correct: "hagan", options: ["hagan", "hacen", "hicieron", "harán"] },
  { tense: "imperativo", sentence: "__ tú la verdad, por favor.", correct: "di", options: ["di", "dices", "dijiste", "dirás"] },
  { tense: "imperativo", sentence: "__ nosotros ahora mismo.", correct: "salgamos", options: ["salgamos", "salimos", "salíamos", "saldremos"] },
  { tense: "imperativo", sentence: "Doctora, __ el informe antes del viernes.", correct: "termine", options: ["termine", "termina", "terminó", "terminará"] },
  { tense: "imperativo", sentence: "¡María, __ más despacio!", correct: "habla", options: ["habla", "hablas", "hablaste", "hablarás"] },
  { tense: "imperativo", sentence: "Señores, __ atención, por favor.", correct: "presten", options: ["presten", "prestan", "prestaron", "prestarán"] },
  { tense: "imperativo", sentence: "__ tú aquí a las ocho.", correct: "está", options: ["está", "estás", "estuviste", "estarás"] },
  { tense: "imperativo", sentence: "__ nosotros la verdad de una vez.", correct: "digamos", options: ["digamos", "decimos", "dijimos", "diremos"] },
  { tense: "imperativo", sentence: "Ana, __ el ejercicio otra vez.", correct: "haz", options: ["haz", "haces", "hiciste", "harás"] },
  { tense: "imperativo", sentence: "Profesor, __ la pregunta de nuevo, por favor.", correct: "repita", options: ["repita", "repite", "repitió", "repetirá"] },
  { tense: "imperativo", sentence: "¡Chicos, __ con cuidado!", correct: "conduzcan", options: ["conduzcan", "conducen", "condujeron", "conducirán"] },
  { tense: "imperativo", sentence: "__ tú paciencia, todo saldrá bien.", correct: "ten", options: ["ten", "tienes", "tuviste", "tendrás"] },
  { tense: "imperativo", sentence: "Señora, no __ por la ventana, es peligroso.", correct: "mire", options: ["mire", "mira", "miró", "mirará"] },
  { tense: "imperativo", sentence: "__ ustedes temprano mañana.", correct: "lleguen", options: ["lleguen", "llegan", "llegaron", "llegarán"] },
  { tense: "imperativo", sentence: "¡Carlos, __ la ventana, hace calor!", correct: "abre", options: ["abre", "abres", "abriste", "abrirás"] },
  { tense: "imperativo", sentence: "Ustedes, __ silencio durante la película.", correct: "guarden", options: ["guarden", "guardan", "guardaron", "guardarán"] },
  { tense: "imperativo", sentence: "¡Laura, __ aquí ahora mismo!", correct: "ven", options: ["ven", "vienes", "viniste", "vendrás"] },
  { tense: "imperativo", sentence: "Señor Pérez, __ la puerta al salir.", correct: "cierre", options: ["cierre", "cierra", "cerró", "cerrará"] },
  { tense: "imperativo", sentence: "¡Niños, __ las manos antes de comer!", correct: "lávense", options: ["lávense", "se lavan", "se lavaron", "se lavarán"] },
  { tense: "imperativo", sentence: "__ tú con más cuidado.", correct: "conduce", options: ["conduce", "conduces", "condujiste", "conducirás"] },
  { tense: "imperativo", sentence: "Profesora, __ un momento, por favor.", correct: "espere", options: ["espere", "espera", "esperó", "esperará"] },
  { tense: "imperativo", sentence: "__ nosotros la verdad antes de que sea tarde.", correct: "aceptemos", options: ["aceptemos", "aceptamos", "aceptábamos", "aceptaremos"] },
  { tense: "imperativo", sentence: "Señores, __ sus asientos, por favor.", correct: "tomen", options: ["tomen", "toman", "tomaron", "tomarán"] },
  { tense: "imperativo", sentence: "¡Sofía, __ con cuidado esa caja!", correct: "lleva", options: ["lleva", "llevas", "llevaste", "llevarás"] },

  // ---- SUBJUNTIVO IMPERFECTO (C2): past subjunctive in hypothetical/subordinate clauses ----
  { tense: "subjuntivo_imperfecto", sentence: "Si yo __ más tiempo, aprendería otro idioma.", correct: "tuviera", options: ["tuviera", "tengo", "tuve", "tendré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Ella actuaba como si lo __ todo.", correct: "supiera", options: ["supiera", "sabe", "supo", "sabrá"] },
  { tense: "subjuntivo_imperfecto", sentence: "Mis padres querían que yo __ médico.", correct: "fuera", options: ["fuera", "soy", "fui", "seré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si tú me __ la verdad, no estaría enfadado.", correct: "dijeras", options: ["dijeras", "dices", "dijiste", "dirás"] },
  { tense: "subjuntivo_imperfecto", sentence: "Dudaba que ellos __ a tiempo.", correct: "llegaran", options: ["llegaran", "llegan", "llegaron", "llegarán"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si nosotros __ más dinero, compraríamos una casa.", correct: "tuviéramos", options: ["tuviéramos", "tenemos", "tuvimos", "tendremos"] },
  { tense: "subjuntivo_imperfecto", sentence: "El profesor pidió que nosotros __ el ejercicio.", correct: "hiciéramos", options: ["hiciéramos", "hacemos", "hicimos", "haremos"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si ella __ aquí, todo sería más fácil.", correct: "estuviera", options: ["estuviera", "está", "estuvo", "estará"] },
  { tense: "subjuntivo_imperfecto", sentence: "Yo no creía que él __ la verdad.", correct: "dijera", options: ["dijera", "dice", "dijo", "dirá"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si yo __, te ayudaría.", correct: "pudiera", options: ["pudiera", "puedo", "pude", "podré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Ella hablaba como si __ experta.", correct: "fuera", options: ["fuera", "es", "fue", "será"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si ellos __ antes, lo habrían visto.", correct: "vinieran", options: ["vinieran", "vienen", "vinieron", "vendrán"] },
  { tense: "subjuntivo_imperfecto", sentence: "Nos pidió que __ nosotros con él.", correct: "fuéramos", options: ["fuéramos", "vamos", "fuimos", "iremos"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si tú __ ayuda, solo pídela.", correct: "quisieras", options: ["quisieras", "quieres", "quisiste", "querrás"] },
  { tense: "subjuntivo_imperfecto", sentence: "Ojalá __ yo allí en ese momento.", correct: "estuviera", options: ["estuviera", "estoy", "estuve", "estaré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si nosotros __ la verdad antes, actuaríamos distinto.", correct: "supiéramos", options: ["supiéramos", "sabemos", "supimos", "sabremos"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si yo __ más paciencia, no me enfadaría tanto.", correct: "tuviera", options: ["tuviera", "tengo", "tuve", "tendré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Ella me pidió que __ más despacio.", correct: "hablara", options: ["hablara", "hablo", "hablé", "hablaré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si yo __ el idioma, viajaría más lejos.", correct: "dominara", options: ["dominara", "domino", "dominé", "dominaré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Ella me habló como si nosotros __ amigos de toda la vida.", correct: "fuéramos", options: ["fuéramos", "somos", "fuimos", "seremos"] },
  { tense: "subjuntivo_imperfecto", sentence: "El jefe exigió que yo __ el informe esa misma noche.", correct: "entregara", options: ["entregara", "entrego", "entregué", "entregaré"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si tú __ más cuidado, no te habrías caído.", correct: "tuvieras", options: ["tuvieras", "tienes", "tuviste", "tendrás"] },
  { tense: "subjuntivo_imperfecto", sentence: "Ojalá ellos __ antes de que cerraran la tienda.", correct: "llegaran", options: ["llegaran", "llegan", "llegaron", "llegarán"] },
  { tense: "subjuntivo_imperfecto", sentence: "Nos sorprendió que ella __ tan rápido.", correct: "se recuperara", options: ["se recuperara", "se recupera", "se recuperó", "se recuperará"] },
  { tense: "subjuntivo_imperfecto", sentence: "Si ellos __ el mapa, no se perderían.", correct: "llevaran", options: ["llevaran", "llevan", "llevaron", "llevarán"] },
  { tense: "subjuntivo_imperfecto", sentence: "Mi madre insistió en que yo __ el abrigo.", correct: "llevara", options: ["llevara", "llevo", "llevé", "llevaré"] },

  // ---- CONDICIONAL PERFECTO (C2): what would have happened ----
  { tense: "condicional_perfecto", sentence: "Si hubiera sabido la verdad, yo __ diferente.", correct: "habría actuado", options: ["habría actuado", "actúo", "actué", "actuaría"] },
  { tense: "condicional_perfecto", sentence: "Con más tiempo, nosotros __ el proyecto mejor.", correct: "habríamos terminado", options: ["habríamos terminado", "terminamos", "terminábamos", "terminaríamos"] },
  { tense: "condicional_perfecto", sentence: "Ella dijo que __ antes, pero se le hizo tarde.", correct: "habría venido", options: ["habría venido", "viene", "vino", "vendría"] },
  { tense: "condicional_perfecto", sentence: "Sin tu ayuda, yo nunca __ esto solo.", correct: "habría logrado", options: ["habría logrado", "logro", "logré", "lograría"] },
  { tense: "condicional_perfecto", sentence: "Si hubieran avisado, nosotros __ con más cuidado.", correct: "nos habríamos preparado", options: ["nos habríamos preparado", "nos preparamos", "nos preparábamos", "nos prepararíamos"] },
  { tense: "condicional_perfecto", sentence: "Tú me dijiste que ya __ la tarea, pero no era cierto.", correct: "habrías terminado", options: ["habrías terminado", "terminas", "terminaste", "terminarías"] },
  { tense: "condicional_perfecto", sentence: "Con otro entrenador, el equipo __ el campeonato.", correct: "habría ganado", options: ["habría ganado", "gana", "ganó", "ganaría"] },
  { tense: "condicional_perfecto", sentence: "Si me hubieras avisado, yo __ a la estación a tiempo.", correct: "habría llegado", options: ["habría llegado", "llego", "llegué", "llegaría"] },
  { tense: "condicional_perfecto", sentence: "Ellos aseguraron que __ el trabajo antes del viernes.", correct: "habrían entregado", options: ["habrían entregado", "entregan", "entregaron", "entregarían"] },
  { tense: "condicional_perfecto", sentence: "Sin el tráfico, nosotros __ mucho antes.", correct: "habríamos llegado", options: ["habríamos llegado", "llegamos", "llegábamos", "llegaríamos"] },
  { tense: "condicional_perfecto", sentence: "Si hubiera tenido dinero, ella __ la casa.", correct: "habría comprado", options: ["habría comprado", "compra", "compró", "compraría"] },
  { tense: "condicional_perfecto", sentence: "Ustedes me prometieron que __ temprano.", correct: "habrían salido", options: ["habrían salido", "salen", "salieron", "saldrían"] },
  { tense: "condicional_perfecto", sentence: "Con más práctica, tú __ el examen fácilmente.", correct: "habrías aprobado", options: ["habrías aprobado", "apruebas", "aprobaste", "aprobarías"] },
  { tense: "condicional_perfecto", sentence: "Si hubiéramos salido antes, __ el tren.", correct: "habríamos tomado", options: ["habríamos tomado", "tomamos", "tomábamos", "tomaríamos"] },
  { tense: "condicional_perfecto", sentence: "Yo pensé que ellos ya __ la decisión.", correct: "habrían tomado", options: ["habrían tomado", "toman", "tomaron", "tomarían"] },
  { tense: "condicional_perfecto", sentence: "Sin su consejo, yo nunca __ el trabajo perfecto.", correct: "habría encontrado", options: ["habría encontrado", "encuentro", "encontré", "encontraría"] },
  { tense: "condicional_perfecto", sentence: "Si hubiera estudiado más, yo __ el examen.", correct: "habría aprobado", options: ["habría aprobado", "apruebo", "aprobé", "aprobaría"] },
  { tense: "condicional_perfecto", sentence: "Con más cuidado, tú no __ el vaso.", correct: "habrías roto", options: ["habrías roto", "rompes", "rompiste", "romperías"] },
  { tense: "condicional_perfecto", sentence: "Sin la lluvia, ellos __ a tiempo.", correct: "habrían llegado", options: ["habrían llegado", "llegan", "llegaron", "llegarían"] },
  { tense: "condicional_perfecto", sentence: "Yo __ el trabajo si hubiera tenido más tiempo.", correct: "habría terminado", options: ["habría terminado", "termino", "terminé", "terminaría"] },
  { tense: "condicional_perfecto", sentence: "Ella me aseguró que __ antes si hubiera podido.", correct: "habría avisado", options: ["habría avisado", "avisa", "avisó", "avisaría"] },
  { tense: "condicional_perfecto", sentence: "Nosotros __ contigo, pero no nos invitaron.", correct: "habríamos ido", options: ["habríamos ido", "vamos", "fuimos", "iríamos"] },
  { tense: "condicional_perfecto", sentence: "Con otro entrenamiento, tú __ la carrera.", correct: "habrías ganado", options: ["habrías ganado", "ganas", "ganaste", "ganarías"] },
  { tense: "condicional_perfecto", sentence: "Si hubieran sabido antes, ellos __ diferente.", correct: "habrían decidido", options: ["habrían decidido", "deciden", "decidieron", "decidirían"] },
  { tense: "condicional_perfecto", sentence: "Yo nunca __ eso sin tu ayuda.", correct: "habría descubierto", options: ["habría descubierto", "descubro", "descubrí", "descubriría"] },
  { tense: "condicional_perfecto", sentence: "Ustedes __ mejor con más práctica.", correct: "habrían jugado", options: ["habrían jugado", "juegan", "jugaron", "jugarían"] },
];

// Each level unlocks a growing MIX of past tenses (of different kinds) and
// future tenses (of different kinds), not just one tense — so the learner has
// to read the whole sentence and judge which tense fits, across a real range
// of past/future forms, scaled by difficulty.
function levelToConjTiers(level) {
  const map = {
    A1: ["presente", "preterito", "futuro"],
    A2: ["presente", "preterito", "perfecto", "futuro", "condicional"],
    B1: ["preterito", "imperfecto", "perfecto", "futuro", "condicional"],
    B2: ["preterito", "imperfecto", "perfecto", "futuro", "condicional", "subjuntivo"],
    // C1 adds pluscuamperfecto (had done X before Y) and the imperative mood.
    C1: ["preterito", "imperfecto", "perfecto", "futuro", "condicional", "subjuntivo", "pluscuamperfecto", "imperativo"],
    // C2 adds the past subjunctive and the perfect conditional on top of C1's set.
    C2: [
      "preterito", "imperfecto", "perfecto", "futuro", "condicional", "subjuntivo",
      "pluscuamperfecto", "imperativo", "subjuntivo_imperfecto", "condicional_perfecto",
    ],
  };
  return map[level] || map.A1;
}

const GRAMMAR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const GRAMMAR_BANK = [
  // ---- A1 ----
  { id: "a1-1", level: "A1", topic: "Ser / Estar", prompt: "María ___ profesora de historia.", options: ["es", "está", "hay", "tiene"], answer: 0, explanation: "Profesión permanente → ser." },
  { id: "a1-2", level: "A1", topic: "Ser / Estar", prompt: "El café ___ muy caliente ahora.", options: ["es", "está", "hay", "va"], answer: 1, explanation: "Estado temporal → estar." },
  { id: "a1-3", level: "A1", topic: "Artículos", prompt: "___ agua está fría.", options: ["El", "La", "Los", "Un"], answer: 0, explanation: "«Agua» es femenino pero lleva el artículo «el» en singular." },
  { id: "a1-4", level: "A1", topic: "Presente irregular", prompt: "Yo ___ al gimnasio los lunes.", options: ["voy", "vo", "va", "iré"], answer: 0, explanation: "Ir: yo voy." },
  { id: "a1-5", level: "A1", topic: "Presente irregular", prompt: "Nosotros ___ la verdad.", options: ["sabemos", "sabes", "sabéis", "saben"], answer: 0, explanation: "Saber, 1ª pl.: sabemos." },
  { id: "a1-6", level: "A1", topic: "Hay / Estar", prompt: "En la mesa ___ tres libros.", options: ["hay", "están", "es", "son"], answer: 0, explanation: "Cantidad indefinida → hay." },
  { id: "a1-7", level: "A1", topic: "Concordancia", prompt: "Las casas ___ blancas.", options: ["son", "es", "está", "somos"], answer: 0, explanation: "Sujeto plural → son; adjetivo concordado." },
  { id: "a1-8", level: "A1", topic: "Posesivos", prompt: "Ellos viven con ___ padres.", options: ["sus", "su", "suyos", "tus"], answer: 0, explanation: "Poseído plural → sus." },
  { id: "a1-9", level: "A1", topic: "Gustar", prompt: "A mí ___ los idiomas.", options: ["me gustan", "me gusta", "gusto", "me gustas"], answer: 0, explanation: "Sujeto plural «los idiomas» → gustan." },
  { id: "a1-10", level: "A1", topic: "Interrogativos", prompt: "¿___ es tu cumpleaños?", options: ["Cuándo", "Cuánto", "Dónde", "Cómo"], answer: 0, explanation: "Pregunta por tiempo → cuándo." },
  { id: "a1-11", level: "A1", topic: "Presente regular", prompt: "¿Vosotros ___ en Madrid?", options: ["vivís", "vivéis", "viven", "vives"], answer: 0, explanation: "Vivir, vosotros: vivís." },
  { id: "a1-12", level: "A1", topic: "Negación", prompt: "No tengo ___ dinero.", options: ["nada de", "algo de", "alguno", "ningunos"], answer: 0, explanation: "Negación con «nada de»." },
  { id: "a1-13", level: "A1", topic: "Preposiciones de dirección", prompt: "Los fines de semana nosotros vamos ___ cine.", options: ["al", "a", "en", "del"], answer: 0, explanation: "Se usa la contracción 'al' (a + el) para indicar dirección a un lugar masculino." },
  { id: "a1-14", level: "A1", topic: "Perífrasis de futuro", prompt: "Mañana por la tarde yo ___ estudiar en la biblioteca.", options: ["voy a", "voy", "ir a", "ir"], answer: 0, explanation: "Para expresar planes futuros se usa la estructura ir + a + infinitivo." },
  { id: "a1-15", level: "A1", topic: "Obligación personal", prompt: "Para aprender español, los estudiantes ___ leer muchos libros.", options: ["tienen que", "tienen", "deben de", "hay que"], answer: 0, explanation: "Se usa 'tener que + infinitivo' para expresar una obligación personal." },
  { id: "a1-16", level: "A1", topic: "Cuantificadores básicos", prompt: "Mi hermana trabaja ___ todos los días.", options: ["mucho", "muy", "mucha", "muchos"], answer: 0, explanation: "El adverbio 'mucho' modifica al verbo y es invariable en género y número." },
  { id: "a1-17", level: "A1", topic: "Demostrativos de cercanía", prompt: "___ camisa que tengo en mis manos es de algodón.", options: ["Esta", "Esa", "Aquella", "Este"], answer: 0, explanation: "El demostrativo 'esta' indica cercanía al hablante y concuerda en femenino singular." },
  { id: "a1-18", level: "A1", topic: "Verbos reflexivos", prompt: "Yo ___ a las siete de la mañana para ir al trabajo.", options: ["me levanto", "te levantas", "levanto", "se levanta"], answer: 0, explanation: "Los verbos reflexivos de rutina requieren el pronombre reflexivo correspondiente al sujeto." },
  { id: "a1-19", level: "A1", topic: "Contracción de preposición y artículo", prompt: "El coche ___ profesor de matemáticas es rojo.", options: ["del", "de", "al", "de el"], answer: 0, explanation: "Se usa la contracción 'del' (de + el) para expresar posesión ante un sustantivo masculino." },
  { id: "a1-20", level: "A1", topic: "Expresar la hora", prompt: "La clase de español termina a la una y ___.", options: ["media", "medio", "mitades", "mitad"], answer: 0, explanation: "Para indicar treinta minutos se usa la expresión invariable 'y media'." },
  { id: "a1-21", level: "A1", topic: "Días de la semana", prompt: "Yo no trabajo ___ domingos.", options: ["los", "en", "el", "a los"], answer: 0, explanation: "En español se usa el artículo determinado para indicar rutinas en los días de la semana." },
  { id: "a1-22", level: "A1", topic: "Preposición con objeto directo", prompt: "Yo visito ___ mis abuelos todos los veranos.", options: ["a", "en", "para", "con"], answer: 0, explanation: "El objeto directo de persona requiere ir precedido de la preposición 'a'." },
  { id: "a1-23", level: "A1", topic: "Estar + gerundio", prompt: "En este momento, Juan ___ la televisión en el salón.", options: ["está mirando", "mira", "es mirando", "estar mirando"], answer: 0, explanation: "La perífrasis 'estar + gerundio' expresa una acción en desarrollo en el momento del habla." },
  { id: "a1-24", level: "A1", topic: "Expresar la edad", prompt: "¿Cuántos años ___ tú, María?", options: ["tienes", "eres", "estás", "hay"], answer: 0, explanation: "En español, la edad se expresa obligatoriamente con el verbo 'tener'." },
  { id: "a1-25", level: "A1", topic: "Preposiciones de lugar", prompt: "El gato duerme ___ la mesa del comedor.", options: ["debajo de", "bajo de", "en bajo", "abajo"], answer: 0, explanation: "La locución 'debajo de' es correcta para indicar una posición espacial inferior respecto a un objeto." },
  { id: "a1-26", level: "A1", topic: "Adjetivos de cantidad", prompt: "En la nevera hay ___ manzanas para hacer la tarta.", options: ["muchas", "muy", "mucho", "muchos"], answer: 0, explanation: "El cuantificador funciona como adjetivo y concuerda en femenino plural con el sustantivo." },
  { id: "a1-27", level: "A1", topic: "Pronombres con preposición", prompt: "¿Quieres venir ___ a la fiesta de Ana?", options: ["conmigo", "con yo", "con mí", "mí"], answer: 0, explanation: "La preposición 'con' unida al pronombre de primera persona forma la palabra 'conmigo'." },
  { id: "a1-28", level: "A1", topic: "Expresar sensaciones físicas", prompt: "Cierra la ventana, por favor, ___ mucho frío.", options: ["tengo", "estoy", "hace", "soy"], answer: 0, explanation: "Para expresar sensaciones físicas que experimentan las personas se usa el verbo 'tener'." },
  { id: "a1-29", level: "A1", topic: "Verbos de valoración", prompt: "A mi madre le ___ mucho la cabeza hoy.", options: ["duele", "duelen", "dolor", "duelo"], answer: 0, explanation: "El verbo 'doler' funciona como 'gustar' y concuerda con el sujeto paciente en singular." },
  { id: "a1-30", level: "A1", topic: "Tratamiento de cortesía", prompt: "Perdone, ¿cómo se llama ___?", options: ["usted", "tú", "él", "ella"], answer: 0, explanation: "El pronombre 'usted' se usa para el tratamiento formal y requiere el verbo en tercera persona." },
  { id: "a1-31", level: "A1", topic: "Tiempo meteorológico", prompt: "En invierno siempre ___ mucho frío en Moscú.", options: ["hace", "tiene", "está", "es"], answer: 0, explanation: "Para describir fenómenos climáticos de forma impersonal se utiliza el verbo 'hacer'." },
  { id: "a1-32", level: "A1", topic: "Expresar el origen", prompt: "Nosotros ___ de un pueblo pequeño cerca de Barcelona.", options: ["somos", "estamos", "vamos", "venimos"], answer: 0, explanation: "El origen de una persona o cosa se expresa siempre con el verbo 'ser'." },
  { id: "a1-33", level: "A1", topic: "Adjetivos de nacionalidad", prompt: "Mi amiga Marie es ___, nació en París.", options: ["francesa", "francés", "francesas", "franceses"], answer: 0, explanation: "El adjetivo de nacionalidad debe concordar en género y número (femenino singular) con el sujeto." },
  { id: "a1-34", level: "A1", topic: "Pronombres de objeto directo", prompt: "¿Tienes las llaves? No, no ___ tengo.", options: ["las", "los", "la", "lo"], answer: 0, explanation: "El pronombre 'las' sustituye correctamente al objeto directo femenino plural mencionado antes." },
  { id: "a1-35", level: "A1", topic: "Sujetos compuestos", prompt: "Mi hermano y yo ___ música pop en el coche.", options: ["escuchamos", "escuchan", "escucha", "escucho"], answer: 0, explanation: "Un sujeto que incluye a la primera persona y a otra equivale a 'nosotros' y rige primera plural." },
  { id: "a1-36", level: "A1", topic: "Preposiciones de tiempo", prompt: "Las clases de inglés en esta escuela son ___ la mañana.", options: ["por", "en", "a", "de"], answer: 0, explanation: "Para indicar las partes generales del día sin especificar la hora exacta se usa la preposición 'por'." },
  { id: "a1-37", level: "A1", topic: "Verbo Estar (Ubicación)", prompt: "El museo nacional ___ en el centro de la ciudad.", options: ["está", "es", "hay", "tiene"], answer: 0, explanation: "Para indicar la localización en el espacio de algo específico se usa el verbo 'estar'." },
  { id: "a1-38", level: "A1", topic: "Verbo Llamarse (Presentación)", prompt: "Hola, yo ___ Pedro, encantado de conocerte.", options: ["me llamo", "se llama", "te llamas", "llamo"], answer: 0, explanation: "El verbo reflexivo 'llamarse' en primera persona del singular es 'me llamo'." },
  { id: "a1-39", level: "A1", topic: "Artículos definidos", prompt: "___ libros están en la mesa del profesor.", options: ["Los", "Las", "El", "Unos"], answer: 0, explanation: "El sustantivo 'libros' es masculino plural, por lo que requiere el artículo 'los'." },
  { id: "a1-40", level: "A1", topic: "Artículos indefinidos", prompt: "En mi calle hay ___ farmacia muy grande.", options: ["una", "un", "la", "unas"], answer: 0, explanation: "Para hablar de la existencia de algo no específico en singular femenino se usa 'una'." },
  { id: "a1-41", level: "A1", topic: "Concordancia de género", prompt: "La casa de mis abuelos es muy ___.", options: ["bonita", "bonito", "bonitas", "bonitos"], answer: 0, explanation: "El adjetivo debe concordar en género y número con el sustantivo femenino singular." },
  { id: "a1-42", level: "A1", topic: "Presente regular (-ar)", prompt: "Yo ___ español todos los días por la mañana.", options: ["estudio", "estudia", "estudias", "estudiamos"], answer: 0, explanation: "La terminación para la primera persona del singular de los verbos en '-ar' es '-o'." },
  { id: "a1-43", level: "A1", topic: "Presente regular (-er)", prompt: "Nosotros ___ en un restaurante los fines de semana.", options: ["comemos", "comen", "comes", "como"], answer: 0, explanation: "La terminación para la primera persona del plural de los verbos en '-er' es '-emos'." },
  { id: "a1-44", level: "A1", topic: "Presente regular (-ir)", prompt: "Ellos ___ en una casa cerca de la playa.", options: ["viven", "vive", "vivimos", "vives"], answer: 0, explanation: "La terminación para la tercera persona del plural de los verbos en '-ir' es '-en'." },
  { id: "a1-45", level: "A1", topic: "Presente irregular (Hacer)", prompt: "¿Qué ___ tú en tu tiempo libre?", options: ["haces", "hace", "hago", "hacemos"], answer: 0, explanation: "La forma correcta del verbo irregular 'hacer' para la segunda persona del singular es 'haces'." },
  { id: "a1-46", level: "A1", topic: "Presente de cambio vocálico", prompt: "Mis amigos ___ al fútbol los martes por la tarde.", options: ["juegan", "jugan", "juega", "jugamos"], answer: 0, explanation: "El verbo 'jugar' tiene un cambio vocálico de 'u' a 'ue' en la tercera persona del plural." },
  { id: "a1-47", level: "A1", topic: "Verbo Gustar (Singular)", prompt: "A mi hermano le ___ mucho la música clásica.", options: ["gusta", "gustan", "gusto", "gustas"], answer: 0, explanation: "El verbo 'gustar' concuerda en singular con el sustantivo incontable o singular 'la música'." },
  { id: "a1-48", level: "A1", topic: "Posesivos (Singular)", prompt: "___ madre trabaja en una escuela primaria.", options: ["Mi", "Mis", "Mío", "Mía"], answer: 0, explanation: "El adjetivo posesivo 'mi' se usa delante de un sustantivo en singular." },
  { id: "a1-49", level: "A1", topic: "Posesivos (Plural)", prompt: "___ abuelos viven en otra ciudad.", options: ["Nuestros", "Nuestra", "Nuestro", "Nuestras"], answer: 0, explanation: "El posesivo 'nuestros' concuerda en masculino y plural con el sustantivo 'abuelos'." },
  { id: "a1-50", level: "A1", topic: "Demostrativos (Cercanía)", prompt: "___ coche de aquí es muy rápido.", options: ["Este", "Esta", "Estos", "Esto"], answer: 0, explanation: "Para indicar cercanía referida a un sustantivo masculino singular se usa 'este'." },
  { id: "a1-51", level: "A1", topic: "Interrogativos (Lugar)", prompt: "¿___ está la estación de tren, por favor?", options: ["Dónde", "Cuándo", "Cómo", "Qué"], answer: 0, explanation: "Para preguntar por la ubicación de un lugar se utiliza el pronombre interrogativo 'dónde'." },
  { id: "a1-52", level: "A1", topic: "Interrogativos (Cantidad)", prompt: "¿___ estudiantes hay en tu clase de español?", options: ["Cuántos", "Cuántas", "Cuánto", "Cuánta"], answer: 0, explanation: "El interrogativo 'cuántos' debe concordar en masculino plural con el sustantivo 'estudiantes'." },
  { id: "a1-53", level: "A1", topic: "Diferencia Muy y Mucho", prompt: "Este restaurante italiano es ___ caro.", options: ["muy", "mucho", "mucha", "muchos"], answer: 0, explanation: "La palabra 'muy' se utiliza delante de un adjetivo para intensificar su cualidad." },
  // ---- A2 ----
  { id: "a2-1", level: "A2", topic: "Indefinido", prompt: "Ayer ___ a mis abuelos.", options: ["visité", "visitaba", "visito", "he visitado"], answer: 0, explanation: "«Ayer» → pretérito indefinido." },
  { id: "a2-2", level: "A2", topic: "Imperfecto", prompt: "Cuando era niño, ___ mucho fútbol.", options: ["jugaba", "jugué", "juego", "jugaría"], answer: 0, explanation: "Costumbre en el pasado → imperfecto." },
  { id: "a2-3", level: "A2", topic: "Perfecto", prompt: "Esta semana ___ tres libros.", options: ["he leído", "leí", "leía", "leeré"], answer: 0, explanation: "Periodo no terminado → pretérito perfecto." },
  { id: "a2-4", level: "A2", topic: "Pronombres OD/OI", prompt: "¿El informe? Ya ___ envié al jefe.", options: ["se lo", "le lo", "lo le", "se le"], answer: 0, explanation: "OI «le» + OD «lo» → se lo." },
  { id: "a2-5", level: "A2", topic: "Comparativos", prompt: "Este examen es ___ difícil que el anterior.", options: ["más", "tan", "mayor", "muy"], answer: 0, explanation: "Comparativo de superioridad: más… que." },
  { id: "a2-6", level: "A2", topic: "Indefinido irregular", prompt: "Ellos ___ que salir temprano.", options: ["tuvieron", "tenieron", "tenían que", "tuvimos"], answer: 0, explanation: "Tener, 3ª pl. indefinido: tuvieron." },
  { id: "a2-7", level: "A2", topic: "Perífrasis", prompt: "___ estudiar más para aprobar.", options: ["Hay que", "Hay de", "Tengo de", "Debe de"], answer: 0, explanation: "Obligación impersonal: hay que + infinitivo." },
  { id: "a2-8", level: "A2", topic: "Imperativo", prompt: "___ (tú) la puerta, por favor.", options: ["Cierra", "Cierre", "Cerra", "Cierras"], answer: 0, explanation: "Imperativo afirmativo de tú: cierra." },
  { id: "a2-9", level: "A2", topic: "Preposiciones", prompt: "Vamos ___ pie hasta el centro.", options: ["a", "en", "de", "por"], answer: 0, explanation: "Locución fija: a pie." },
  { id: "a2-10", level: "A2", topic: "Estar + gerundio", prompt: "Ahora mismo ___ comiendo.", options: ["estamos", "somos", "vamos", "tenemos"], answer: 0, explanation: "Presente continuo: estar + gerundio." },
  { id: "a2-11", level: "A2", topic: "Verbos reflexivos", prompt: "Me ___ a las siete todos los días.", options: ["despierto", "despierta", "despertó", "despierte"], answer: 0, explanation: "Reflexivo: yo me despierto." },
  { id: "a2-12", level: "A2", topic: "Futuro", prompt: "Mañana ___ el resultado.", options: ["sabremos", "sabimos", "saberemos", "supimos"], answer: 0, explanation: "Futuro irregular de saber: sabremos." },
  { id: "a2-13", level: "A2", topic: "Contraste Imperfecto e Indefinido", prompt: "Ayer, mientras nosotros cenábamos, ___ el teléfono de repente.", options: ["sonó", "sonaba", "ha sonado", "suena"], answer: 0, explanation: "El pretérito indefinido interrumpe una acción en desarrollo descrita en pretérito imperfecto." },
  { id: "a2-14", level: "A2", topic: "Pronombres indefinidos de persona", prompt: "¿Hay ___ en la oficina del director ahora mismo?", options: ["alguien", "nadie", "algún", "ningún"], answer: 0, explanation: "El pronombre 'alguien' se utiliza en oraciones afirmativas o interrogativas para referirse a una persona desconocida." },
  { id: "a2-15", level: "A2", topic: "Pronombres indefinidos de cosa", prompt: "Tengo mucha hambre, pero no hay ___ en la nevera para comer.", options: ["nada", "algo", "ningún", "nadie"], answer: 0, explanation: "El pronombre 'nada' se usa con el verbo negativo para negar la existencia de cosas." },
  { id: "a2-16", level: "A2", topic: "Expresar coincidencia afirmativa", prompt: "Me encanta la comida mexicana. - A mí ___.", options: ["también", "tampoco", "sí", "igual"], answer: 0, explanation: "Para mostrar acuerdo con una oración afirmativa que usa verbos como 'gustar', se utiliza 'a mí también'." },
  { id: "a2-17", level: "A2", topic: "Expresar coincidencia negativa", prompt: "Yo no fui al concierto de rock el sábado. - Yo ___.", options: ["tampoco", "también", "no", "sí"], answer: 0, explanation: "Para mostrar acuerdo con una oración negativa de sujeto regular se utiliza 'yo tampoco'." },
  { id: "a2-18", level: "A2", topic: "Marcadores de tiempo (Desde hace)", prompt: "Vivo y trabajo en Madrid ___ tres años.", options: ["desde hace", "desde", "hace", "hace que"], answer: 0, explanation: "La locución 'desde hace' se usa con cantidades de tiempo para indicar la duración de una acción que continúa." },
  { id: "a2-19", level: "A2", topic: "Marcadores de tiempo (Desde)", prompt: "Estudio en esta academia de idiomas ___ el año 2021.", options: ["desde", "desde hace", "hace", "en"], answer: 0, explanation: "La preposición 'desde' se usa con fechas concretas o puntos exactos de inicio en el tiempo." },
  { id: "a2-20", level: "A2", topic: "Marcadores de tiempo (Hace)", prompt: "El tren hacia Barcelona salió ___ quince minutos.", options: ["hace", "desde", "hace que", "desde hace"], answer: 0, explanation: "La palabra 'hace' seguida de una cantidad de tiempo indica cuánto tiempo ha transcurrido desde un evento en el pasado." },
  { id: "a2-21", level: "A2", topic: "Adverbios de tiempo (Ya)", prompt: "¿___ has terminado los deberes de matemáticas?", options: ["Ya", "Todavía no", "Aún", "Nunca"], answer: 0, explanation: "El adverbio 'ya' se utiliza en interrogativas para preguntar si una acción esperada se ha realizado." },
  { id: "a2-22", level: "A2", topic: "Conectores causales", prompt: "No fuimos a la playa el domingo ___ estaba lloviendo mucho.", options: ["porque", "por eso", "como", "para"], answer: 0, explanation: "El conector 'porque' introduce la causa o razón de la acción principal en medio de la oración." },
  { id: "a2-23", level: "A2", topic: "Conectores consecutivos", prompt: "Ayer perdí el autobús de las ocho, ___ llegué tarde al trabajo.", options: ["por eso", "porque", "como", "aunque"], answer: 0, explanation: "El conector 'por eso' introduce la consecuencia lógica de lo dicho anteriormente." },
  { id: "a2-24", level: "A2", topic: "Oraciones condicionales reales", prompt: "Si mañana ___ buen tiempo, iremos de excursión a la montaña.", options: ["hace", "hará", "haga", "hizo"], answer: 0, explanation: "En las oraciones condicionales reales, la cláusula introducida por 'si' siempre lleva el verbo en presente de indicativo." },
  { id: "a2-25", level: "A2", topic: "Condicional de cortesía", prompt: "Perdone, camarero, me ___ pedir la cuenta, por favor.", options: ["gustaría", "gusta", "gustará", "gustaba"], answer: 0, explanation: "El condicional simple del verbo gustar se utiliza para expresar deseos de forma educada y cortés." },
  { id: "a2-26", level: "A2", topic: "Verbos de preferencia", prompt: "Esta noche yo ___ quedarme en casa leyendo un buen libro.", options: ["prefiero", "prefieres", "preferimos", "preferís"], answer: 0, explanation: "El verbo 'preferir' es irregular (e>ie) y debe concordar con la primera persona del singular." },
  { id: "a2-27", level: "A2", topic: "Verbos de valoración", prompt: "A mis padres les ___ muy aburridas las películas de ciencia ficción.", options: ["parecen", "parece", "parecer", "parecían"], answer: 0, explanation: "El verbo 'parecer' funciona como 'gustar' y debe concordar en plural con el sujeto 'las películas'." },
  { id: "a2-28", level: "A2", topic: "Diferencia Saber y Conocer (Lugar)", prompt: "Yo no ___ la ciudad de Sevilla, pero dicen que es preciosa.", options: ["conozco", "sé", "sabo", "conoces"], answer: 0, explanation: "Se usa el verbo 'conocer' para hablar de lugares, personas o cosas que se han experimentado." },
  { id: "a2-29", level: "A2", topic: "Diferencia Saber y Conocer (Habilidad)", prompt: "¿Tú ___ tocar algún instrumento musical clásico?", options: ["sabes", "conoces", "sabe", "conoce"], answer: 0, explanation: "Para expresar habilidades aprendidas se utiliza siempre el verbo 'saber' seguido de infinitivo." },
  { id: "a2-30", level: "A2", topic: "Expresar planes (Pensar)", prompt: "En las próximas vacaciones, mis amigos y yo ___ viajar a Italia.", options: ["pensamos", "piensan", "pensáis", "pienso"], answer: 0, explanation: "La estructura 'pensar + infinitivo' se usa en presente para expresar intenciones y proyectos futuros." },
  { id: "a2-31", level: "A2", topic: "Superlativo relativo", prompt: "El río Amazonas es el ___ largo del mundo.", options: ["más", "muy", "mucho", "tan"], answer: 0, explanation: "La estructura 'el/la/los/las + más + adjetivo' forma el superlativo relativo para indicar el grado máximo." },
  { id: "a2-32", level: "A2", topic: "Pronombres posesivos", prompt: "Ese bolígrafo rojo no es de Carlos, es ___.", options: ["mío", "mi", "el mío", "de mí"], answer: 0, explanation: "El pronombre posesivo tónico 'mío' sustituye al sustantivo con función de atributo y concuerda en masculino singular." },
  { id: "a2-33", level: "A2", topic: "Impersonalidad con Se", prompt: "En este restaurante de la esquina ___ come muy bien y barato.", options: ["se", "lo", "le", "me"], answer: 0, explanation: "El pronombre 'se' junto con el verbo en tercera persona del singular forma oraciones impersonales generales." },
  { id: "a2-34", level: "A2", topic: "Diferencia Pedir y Preguntar", prompt: "El turista se perdió y tuvo que ___ por la dirección del museo.", options: ["preguntar", "pedir", "decir", "hablar"], answer: 0, explanation: "Se utiliza el verbo 'preguntar' cuando el objetivo principal es solicitar información o una respuesta." },
  { id: "a2-35", level: "A2", topic: "Adverbios de cantidad excesiva", prompt: "No puedo comprar este coche ahora porque es ___ caro para mí.", options: ["demasiado", "mucho", "bastante", "muy mucho"], answer: 0, explanation: "El adverbio 'demasiado' modifica a adjetivos para indicar una cantidad que resulta excesiva o inconveniente." },
  { id: "a2-36", level: "A2", topic: "Diferencia Llevar y Traer", prompt: "¿Puedes ___ un poco de hielo a la fiesta en mi casa?", options: ["traer", "llevar", "venir", "ir"], answer: 0, explanation: "Se usa el verbo 'traer' para hablar de transportar algo hacia el lugar donde se encuentra el hablante." },
  { id: "a2-37", level: "A2", topic: "Futuro simple (regulares)", prompt: "El próximo año nosotros ___ a Latinoamérica de vacaciones.", options: ["viajaremos", "viajamos", "viajábamos", "viajemos"], answer: 0, explanation: "El futuro simple se utiliza para hablar de acciones venideras con marcadores como 'el próximo año'." },
  { id: "a2-38", level: "A2", topic: "Futuro simple (irregulares)", prompt: "Si no estudias, no ___ aprobar el examen de mañana.", options: ["podrás", "puedes", "podrías", "podías"], answer: 0, explanation: "El verbo 'poder' es irregular en futuro simple y forma la raíz 'podr-'." },
  { id: "a2-39", level: "A2", topic: "Imperativo irregular (tú)", prompt: "___ cuidado con ese perro porque muerde a los desconocidos.", options: ["Ten", "Tienes", "Tenga", "Tener"], answer: 0, explanation: "El verbo 'tener' es irregular en el imperativo afirmativo para la forma 'tú'." },
  { id: "a2-40", level: "A2", topic: "Imperativo formal (usted)", prompt: "Señor García, ___ por aquí, el director le está esperando.", options: ["pase", "pasa", "pasas", "pasar"], answer: 0, explanation: "El imperativo para 'usted' en los verbos terminados en '-ar' toma la vocal '-e'." },
  { id: "a2-41", level: "A2", topic: "Pretérito Indefinido (regulares)", prompt: "El fin de semana pasado yo ___ un coche de segunda mano.", options: ["compré", "compraba", "he comprado", "compro"], answer: 0, explanation: "Para acciones terminadas en un tiempo pasado delimitado se usa el pretérito indefinido." },
  { id: "a2-42", level: "A2", topic: "Pretérito Indefinido (-er/-ir)", prompt: "Ayer mis padres ___ en un restaurante muy elegante del centro.", options: ["comieron", "comían", "han comido", "comen"], answer: 0, explanation: "La tercera persona del plural del indefinido para verbos terminados en '-er' es '-ieron'." },
  { id: "a2-43", level: "A2", topic: "Pretérito Indefinido (irregulares)", prompt: "Anoche nosotros no ___ ir al cine porque llovía mucho.", options: ["pudimos", "podemos", "podíamos", "podimos"], answer: 0, explanation: "El verbo 'poder' tiene una raíz irregular 'pud-' en el pretérito indefinido." },
  { id: "a2-44", level: "A2", topic: "Pretérito Imperfecto (descripción)", prompt: "Cuando yo era niño, mi casa ___ muy grande y luminosa.", options: ["era", "fue", "es", "sería"], answer: 0, explanation: "El pretérito imperfecto se utiliza para describir personas, cosas o lugares en el pasado." },
  { id: "a2-45", level: "A2", topic: "Pretérito Perfecto (participios irregulares)", prompt: "Esta mañana yo he ___ un correo electrónico muy importante al jefe.", options: ["escrito", "escribido", "escribo", "escribía"], answer: 0, explanation: "El participio del verbo 'escribir' es irregular y se escribe 'escrito'." },
  { id: "a2-46", level: "A2", topic: "Pretérito Perfecto (experiencias)", prompt: "¿Alguna vez ___ comida tailandesa?", options: ["has probado", "probaste", "probabas", "pruebas"], answer: 0, explanation: "Para hablar de experiencias pasadas sin especificar cuándo ocurrieron se usa el pretérito perfecto." },
  { id: "a2-47", level: "A2", topic: "Pronombres de Objeto Directo", prompt: "¿Tienes las llaves del coche? No, no ___ tengo.", options: ["las", "los", "la", "les"], answer: 0, explanation: "El pronombre 'las' sustituye al objeto directo femenino plural 'las llaves'." },
  { id: "a2-48", level: "A2", topic: "Pronombres de Objeto Indirecto", prompt: "Ayer ___ regalé un libro a mi hermana por su cumpleaños.", options: ["le", "la", "lo", "les"], answer: 0, explanation: "El pronombre 'le' sustituye al objeto indirecto de tercera persona singular 'a mi hermana'." },
  { id: "a2-49", level: "A2", topic: "Comparativos de inferioridad", prompt: "Mi teléfono nuevo es ___ pesado que el modelo anterior.", options: ["menos", "menor", "peor", "poco"], answer: 0, explanation: "La estructura 'menos + adjetivo + que' forma el comparativo de inferioridad." },
  { id: "a2-50", level: "A2", topic: "Comparativos irregulares", prompt: "Esta película es mucho ___ que la primera parte, me encantó.", options: ["mejor", "más buena", "mayor", "muy buena"], answer: 0, explanation: "El adjetivo 'bueno' tiene una forma comparativa irregular que es 'mejor'." },
  { id: "a2-51", level: "A2", topic: "Verbos reflexivos en pasado", prompt: "Ayer me ___ a las siete para ir a trabajar.", options: ["levanté", "levanto", "levantaba", "he levantado"], answer: 0, explanation: "Para una acción puntual y terminada en el pasado con verbo reflexivo se usa el indefinido 'me levanté'." },
  { id: "a2-52", level: "A2", topic: "Adverbios de cantidad", prompt: "Hoy he trabajado ___ y ahora estoy muy cansado.", options: ["bastante", "bastantes", "muchos", "muy"], answer: 0, explanation: "El adverbio 'bastante' es invariable y modifica al verbo indicando una cantidad suficiente o elevada." },
  { id: "a2-53", level: "A2", topic: "Adverbios de frecuencia", prompt: "Nosotros casi ___ comemos carne, preferimos las verduras.", options: ["nunca", "siempre", "a veces", "todos los días"], answer: 0, explanation: "El adverbio 'nunca' va acompañado de 'casi' para indicar una frecuencia nula o mínima." },
  { id: "a2-54", level: "A2", topic: "Verbo Doler (presente)", prompt: "Después de correr diez kilómetros, me ___ mucho las piernas.", options: ["duelen", "duele", "dolemos", "doléis"], answer: 0, explanation: "El verbo 'doler' concuerda en tercera persona del plural con el sujeto 'las piernas'." },
  { id: "a2-55", level: "A2", topic: "Expresar obligación personal", prompt: "Mañana tengo un examen muy difícil, ___ que estudiar toda la noche.", options: ["tengo", "hay", "debo", "necesito"], answer: 0, explanation: "La perífrasis 'tener que + infinitivo' expresa una obligación personal." },
  { id: "a2-56", level: "A2", topic: "Pronombres posesivos tónicos", prompt: "¿Este paraguas es ___ o es de otra persona?", options: ["tuyo", "tu", "tuyos", "ti"], answer: 0, explanation: "El pronombre posesivo tónico 'tuyo' sustituye al sustantivo concordando en masculino singular." },
  { id: "a2-57", level: "A2", topic: "Pronombres interrogativos", prompt: "¿___ cuesta este billete de avión a Buenos Aires?", options: ["Cuánto", "Qué", "Cuál", "Cómo"], answer: 0, explanation: "El pronombre interrogativo 'cuánto' se utiliza para preguntar por precios o cantidades." },
  // ---- B1 ----
  { id: "b1-1", level: "B1", topic: "Subjuntivo presente", prompt: "Espero que ___ bien el viaje.", options: ["vaya", "va", "irá", "iba"], answer: 0, explanation: "Deseo con «esperar que» → subjuntivo." },
  { id: "b1-2", level: "B1", topic: "Subjuntivo vs indicativo", prompt: "Creo que ___ razón.", options: ["tienes", "tengas", "tuvieras", "tendrías"], answer: 0, explanation: "«Creer que» afirmativo → indicativo." },
  { id: "b1-3", level: "B1", topic: "Por / Para", prompt: "Estudio español ___ trabajar en Chile.", options: ["para", "por", "de", "a"], answer: 0, explanation: "Finalidad → para." },
  { id: "b1-4", level: "B1", topic: "Por / Para", prompt: "Te llamo ___ teléfono esta tarde.", options: ["por", "para", "en", "con"], answer: 0, explanation: "Medio → por." },
  { id: "b1-5", level: "B1", topic: "Condicional", prompt: "Yo que tú, ___ con el director.", options: ["hablaría", "hablara", "hablaré", "hablo"], answer: 0, explanation: "Consejo hipotético → condicional simple." },
  { id: "b1-6", level: "B1", topic: "Subjuntivo temporal", prompt: "Cuando ___ el tren, te aviso.", options: ["llegue", "llega", "llegará", "llegaba"], answer: 0, explanation: "Futuro tras «cuando» → subjuntivo." },
  { id: "b1-7", level: "B1", topic: "Estilo indirecto", prompt: "Dijo que ___ cansado.", options: ["estaba", "está", "esté", "estuviera"], answer: 0, explanation: "Presente → imperfecto en estilo indirecto pasado." },
  { id: "b1-8", level: "B1", topic: "Imperativo negativo", prompt: "No ___ (tú) tan rápido.", options: ["hables", "hablas", "habla", "hablar"], answer: 0, explanation: "Imperativo negativo usa subjuntivo." },
  { id: "b1-9", level: "B1", topic: "Pluscuamperfecto", prompt: "Cuando llegué, ellos ya ___.", options: ["habían salido", "han salido", "salieron", "salían"], answer: 0, explanation: "Anterioridad en el pasado → pluscuamperfecto." },
  { id: "b1-10", level: "B1", topic: "Relativos", prompt: "La mujer ___ hijo conoces vive aquí.", options: ["cuyo", "que", "quien", "cual"], answer: 0, explanation: "Posesión relativa → cuyo." },
  { id: "b1-11", level: "B1", topic: "Perífrasis", prompt: "___ de terminar el informe.", options: ["Acabo", "Estoy", "Voy", "Llevo"], answer: 0, explanation: "Acabar de + infinitivo: pasado inmediato." },
  { id: "b1-12", level: "B1", topic: "Subjuntivo con juicio", prompt: "Es importante que ___ puntual.", options: ["seas", "eres", "serás", "fueras"], answer: 0, explanation: "Valoración impersonal → subjuntivo." },
  { id: "b1-13", level: "B1", topic: "Presente de subjuntivo (Deseo)", prompt: "Mis padres quieren que yo ___ medicina en la universidad.", options: ["estudie", "estudio", "estudiaré", "estudiaba"], answer: 0, explanation: "Los verbos de deseo exigen el uso del presente de subjuntivo cuando hay cambio de sujeto." },
  { id: "b1-14", level: "B1", topic: "Presente de subjuntivo (Emoción)", prompt: "Me alegra muchísimo que nosotros ___ viajar juntos este verano.", options: ["podamos", "podemos", "podremos", "podíamos"], answer: 0, explanation: "Los verbos que expresan emoción o sentimiento rigen subjuntivo en la oración subordinada." },
  { id: "b1-15", level: "B1", topic: "Presente de subjuntivo (Influencia)", prompt: "El profesor nos recomienda que ___ este libro para el examen.", options: ["leamos", "leemos", "leeremos", "leíamos"], answer: 0, explanation: "Para dar consejos o recomendaciones a otra persona se utiliza el presente de subjuntivo." },
  { id: "b1-16", level: "B1", topic: "Presente de subjuntivo (Opinión negativa)", prompt: "No creo que esta tarde ___ a llover, el cielo está muy despejado.", options: ["vaya", "va", "irá", "iba"], answer: 0, explanation: "Los verbos de opinión en forma negativa requieren obligatoriamente el modo subjuntivo." },
  { id: "b1-17", level: "B1", topic: "Presente de subjuntivo (Duda)", prompt: "Es posible que la tienda ya ___ cerrada a estas horas.", options: ["esté", "está", "estará", "estuvo"], answer: 0, explanation: "Las expresiones impersonales que indican probabilidad o duda exigen el modo subjuntivo." },
  { id: "b1-18", level: "B1", topic: "Oraciones finales", prompt: "Te doy mi número de teléfono para que me ___ si tienes algún problema.", options: ["llames", "llamas", "llamarás", "llamaste"], answer: 0, explanation: "La estructura 'para que' expresa finalidad y requiere siempre el modo subjuntivo." },
  { id: "b1-19", level: "B1", topic: "Imperativo afirmativo con pronombres", prompt: "Si ves a Carlos en la oficina, ___ que la reunión se ha cancelado.", options: ["dile", "le di", "dígale", "decirle"], answer: 0, explanation: "En el imperativo afirmativo, los pronombres se unen al final del verbo formando una sola palabra." },
  { id: "b1-20", level: "B1", topic: "Imperativo negativo con pronombres", prompt: "Por favor, esa información es confidencial, no se lo ___ a nadie.", options: ["digas", "dices", "dígas", "di"], answer: 0, explanation: "En el imperativo negativo, los pronombres se colocan siempre delante del verbo conjugado en subjuntivo." },
  { id: "b1-21", level: "B1", topic: "Pronombres combinados (OD y OI)", prompt: "¿El informe de ventas? Sí, ya ___ he enviado al director por correo.", options: ["se lo", "le lo", "lo se", "se le"], answer: 0, explanation: "Cuando se combinan los pronombres de tercera persona 'le' y 'lo', 'le' se transforma en 'se'." },
  { id: "b1-22", level: "B1", topic: "Contraste Indefinido e Imperfecto", prompt: "Mientras yo ___ la cena tranquilamente, de repente alguien llamó a la puerta.", options: ["preparaba", "preparé", "preparo", "he preparado"], answer: 0, explanation: "El imperfecto describe la acción en desarrollo que es interrumpida por otra en indefinido." },
  { id: "b1-23", level: "B1", topic: "Usos de Ya y Todavía", prompt: "¿___ has terminado de leer el libro que te presté la semana pasada?", options: ["Ya", "Todavía", "Aún", "Nunca"], answer: 0, explanation: "Se utiliza el adverbio 'ya' en preguntas para saber si una acción esperada se ha realizado." },
  { id: "b1-24", level: "B1", topic: "Artículo neutro Lo", prompt: "___ mejor de este trabajo es que tengo mucho tiempo libre.", options: ["Lo", "El", "Un", "Al"], answer: 0, explanation: "El artículo neutro 'lo' se combina con un adjetivo masculino singular para sustantivarlo." },
  { id: "b1-25", level: "B1", topic: "Verbos tipo Gustar", prompt: "A mis compañeros de clase no les ___ nada la historia del arte contemporáneo.", options: ["interesa", "interesan", "intereso", "interesas"], answer: 0, explanation: "El verbo concuerda en tercera persona del singular con el sujeto paciente 'la historia'." },
  { id: "b1-26", level: "B1", topic: "Relativos con indicativo", prompt: "Busco a la secretaria que ___ en la segunda planta, ¿sabe dónde está?", options: ["trabaja", "trabaje", "trabajó", "trabajará"], answer: 0, explanation: "Cuando el antecedente (la secretaria) es un sujeto específico y conocido, se usa el modo indicativo." },
  { id: "b1-27", level: "B1", topic: "Pronombres relativos", prompt: "Mi coche está roto, así que he traído ___ me prestó mi hermano mayor.", options: ["el que", "lo que", "quien", "cual"], answer: 0, explanation: "Se usa 'el que' para referirse a un sustantivo masculino (coche) mencionado anteriormente en la oración." },
  { id: "b1-28", level: "B1", topic: "Comparativos de igualdad", prompt: "Mi apartamento nuevo es exactamente ___ grande como el que tenía antes.", options: ["tan", "tanto", "igual", "más"], answer: 0, explanation: "Para formar comparativos de igualdad con adjetivos se utiliza siempre la estructura 'tan + adjetivo + como'." },
  { id: "b1-29", level: "B1", topic: "Superlativos absolutos", prompt: "Este pastel de chocolate está ___, me comería tres trozos más ahora mismo.", options: ["buenísimo", "muy buenísimo", "buenísimos", "más bueno"], answer: 0, explanation: "El sufijo '-ísimo' se añade al adjetivo para expresar el grado máximo de una cualidad sin comparación." },
  { id: "b1-30", level: "B1", topic: "Adverbios en -mente", prompt: "El niño abrió la caja ___ para no despertar a sus padres que dormían.", options: ["cuidadosamente", "cuidadoso", "cuidados", "cuidado"], answer: 0, explanation: "Los adverbios de modo se forman añadiendo la terminación '-mente' a la forma femenina del adjetivo." },
  { id: "b1-31", level: "B1", topic: "Impersonalidad con 3ª persona plural", prompt: "En la televisión ___ que mañana va a nevar copiosamente en la sierra.", options: ["dicen", "dice", "dijeron", "dirán"], answer: 0, explanation: "Se usa la tercera persona del plural para expresar rumores o informaciones de forma impersonal generalizada." },
  { id: "b1-32", level: "B1", topic: "Verbos reflexivos recíprocos", prompt: "Juan y yo no ___ desde la fiesta de graduación del año pasado.", options: ["nos vemos", "se ven", "vemos", "nos miramos"], answer: 0, explanation: "El pronombre recíproco 'nos' indica que la acción es mutua entre dos personas que incluyen al hablante." },
  { id: "b1-33", level: "B1", topic: "Subjuntivo en oraciones temporales (hasta que)", prompt: "No podemos empezar la cena de Navidad hasta que ___ todos los invitados.", options: ["lleguen", "llegan", "llegarán", "llegaron"], answer: 0, explanation: "La locución 'hasta que' requiere subjuntivo cuando expresa una acción límite futura y pendiente." },
  { id: "b1-34", level: "B1", topic: "Expresiones impersonales de obligación", prompt: "Es necesario que todos los participantes ___ el formulario antes de entrar al edificio.", options: ["firmen", "firman", "firmarán", "firmaron"], answer: 0, explanation: "Las construcciones impersonales de necesidad (es necesario que) exigen el uso del subjuntivo." },
  { id: "b1-35", level: "B1", topic: "Presente de subjuntivo (Valoración)", prompt: "Me parece lógico que tu hermano ___ enfadado por lo que le dijiste.", options: ["esté", "está", "estará", "estuvo"], answer: 0, explanation: "Las estructuras de valoración con 'me parece + adjetivo + que' rigen presente de subjuntivo." },
  { id: "b1-36", level: "B1", topic: "Presente de subjuntivo (Probabilidad con Tal vez)", prompt: "Tal vez nosotros ___ de excursión a la montaña este fin de semana.", options: ["vayamos", "vamos", "iremos", "íbamos"], answer: 0, explanation: "El marcador de probabilidad 'tal vez' requiere subjuntivo para expresar un mayor grado de duda." },
  { id: "b1-37", level: "B1", topic: "Expresiones de probabilidad (A lo mejor)", prompt: "A lo mejor mañana ___ a visitarte al hospital por la tarde.", options: ["paso", "pase", "pasaré", "pasara"], answer: 0, explanation: "La expresión coloquial de probabilidad 'a lo mejor' siempre se construye con modo indicativo." },
  { id: "b1-38", level: "B1", topic: "Presente de subjuntivo (Deseos independientes)", prompt: "¡Que ___ un buen viaje y disfrutes mucho de tus vacaciones!", options: ["tengas", "tienes", "tendrás", "tuviste"], answer: 0, explanation: "Para expresar buenos deseos directos con 'que' se utiliza el presente de subjuntivo." },
  { id: "b1-39", level: "B1", topic: "Verbos de cambio (Ponerse)", prompt: "El niño se ___ a llorar cuando se le cayó el helado al suelo.", options: ["puso", "hizo", "quedó", "volvió"], answer: 0, explanation: "El verbo 'ponerse' indica un cambio de estado de ánimo o físico momentáneo e involuntario." },
  { id: "b1-40", level: "B1", topic: "Verbos de cambio (Hacerse)", prompt: "Después de estudiar durante cinco años, María se ___ abogada.", options: ["hizo", "puso", "quedó", "volvió"], answer: 0, explanation: "Se utiliza el verbo 'hacerse' para expresar un cambio de profesión tras un esfuerzo o proceso voluntario." },
  { id: "b1-41", level: "B1", topic: "Verbos de cambio (Quedarse)", prompt: "Tras el accidente de tráfico, el conductor se ___ paralítico.", options: ["quedó", "puso", "hizo", "volvió"], answer: 0, explanation: "El verbo 'quedarse' expresa el resultado permanente o duradero tras una acción o suceso impactante." },
  { id: "b1-42", level: "B1", topic: "Verbos de afección (Costar)", prompt: "A los alumnos les ___ mucho pronunciar la erre fuerte en español.", options: ["cuesta", "cuestan", "cuesto", "costamos"], answer: 0, explanation: "El verbo 'costar' funciona como 'gustar' y aquí concuerda en singular con el infinitivo 'pronunciar'." },
  { id: "b1-43", level: "B1", topic: "Verbos de afección (Dar miedo)", prompt: "A mí me ___ miedo las películas de terror modernas.", options: ["dan", "da", "doy", "damos"], answer: 0, explanation: "La expresión 'dar miedo' concuerda en plural con el sujeto lógico 'las películas de terror'." },
  { id: "b1-44", level: "B1", topic: "Estilo indirecto (Futuro a Condicional)", prompt: "El presidente prometió que los impuestos ___ al año siguiente.", options: ["bajarían", "bajarán", "bajan", "bajen"], answer: 0, explanation: "En el estilo indirecto, el futuro simple del discurso directo se transforma en condicional simple." },
  { id: "b1-45", level: "B1", topic: "Estilo indirecto (Indefinido a Pluscuamperfecto)", prompt: "Juan me explicó ayer que no ___ tiempo de terminar el informe el día anterior.", options: ["había tenido", "tuvo", "tiene", "tendrá"], answer: 0, explanation: "El pretérito indefinido cambia a pretérito pluscuamperfecto cuando el verbo introductorio está en pasado." },
  { id: "b1-46", level: "B1", topic: "Estilo indirecto (Preguntas con si)", prompt: "El recepcionista nos preguntó ___ necesitábamos ayuda con las maletas.", options: ["si", "que", "cómo", "cuándo"], answer: 0, explanation: "Para transmitir una pregunta cerrada (de sí o no) en estilo indirecto se utiliza la conjunción 'si'." },
  { id: "b1-47", level: "B1", topic: "Oraciones temporales (Mientras)", prompt: "Mientras yo limpiaba el salón, mi compañero ___ la comida en la cocina.", options: ["preparaba", "preparó", "prepara", "prepare"], answer: 0, explanation: "Para expresar dos acciones pasadas que ocurren simultáneamente se emplea el pretérito imperfecto." },
  { id: "b1-48", level: "B1", topic: "Oraciones temporales (Al + infinitivo)", prompt: "___ salir de casa, me di cuenta de que había olvidado las llaves.", options: ["Al", "A", "Por", "En"], answer: 0, explanation: "La estructura 'al + infinitivo' equivale a 'cuando + verbo conjugado' para indicar simultaneidad inmediata." },
  { id: "b1-49", level: "B1", topic: "Condicional simple (Cortesía)", prompt: "Perdone, ¿___ decirme dónde está la farmacia más cercana?", options: ["podría", "puede", "pudo", "podrá"], answer: 0, explanation: "El condicional simple se utiliza frecuentemente para hacer peticiones de forma cortés o educada." },
  { id: "b1-50", level: "B1", topic: "Futuro simple (Probabilidad)", prompt: "No veo a Carlos por la oficina, ___ en la cafetería desayunando.", options: ["estará", "está", "estuvo", "esté"], answer: 0, explanation: "El futuro simple también se utiliza para formular hipótesis o expresar suposición en el presente." },
  { id: "b1-51", level: "B1", topic: "Superlativo relativo", prompt: "Este restaurante es el más antiguo ___ toda la ciudad.", options: ["de", "en", "que", "del"], answer: 0, explanation: "El superlativo relativo se forma con la preposición 'de' para introducir el grupo de referencia." },
  { id: "b1-52", level: "B1", topic: "Pronombres posesivos tónicos", prompt: "Mi coche está en el taller, ¿puedes prestarme ___ para ir al trabajo?", options: ["el tuyo", "el tu", "tuyo", "tu"], answer: 0, explanation: "El pronombre posesivo tónico 'el tuyo' sustituye al sustantivo masculino singular 'coche'." },
  { id: "b1-53", level: "B1", topic: "Adjetivos indefinidos", prompt: "No tengo ___ problema en ayudarte con la mudanza mañana.", options: ["ningún", "ninguno", "algún", "alguno"], answer: 0, explanation: "El adjetivo 'ninguno' pierde la 'o' final y lleva tilde cuando precede a un sustantivo masculino singular." },
  { id: "b1-54", level: "B1", topic: "Doble negación", prompt: "En aquella reunión nadie ___ decir la verdad sobre la crisis de la empresa.", options: ["quiso", "no quiso", "quería no", "no quiera"], answer: 0, explanation: "Si la palabra negativa 'nadie' va antes del verbo, este no puede llevar el adverbio 'no'." },
  { id: "b1-55", level: "B1", topic: "Expresar planes frustrados en pasado", prompt: "Yo ___ a llamarte ayer, pero al final me quedé sin batería.", options: ["iba", "fui", "voy", "iría"], answer: 0, explanation: "La estructura 'ir en imperfecto + a + infinitivo' expresa un plan pasado que no llegó a realizarse." },
  { id: "b1-56", level: "B1", topic: "Obligación impersonal en pasado", prompt: "Para aprobar aquel examen, ___ que estudiar muchísimas horas al día.", options: ["había", "tenía", "hubo", "debía"], answer: 0, explanation: "La forma impersonal 'había que' expresa una obligación general en el pretérito imperfecto." },
  { id: "b1-57", level: "B1", topic: "Interrogativas indirectas", prompt: "Disculpe, no sé ___ se saca el billete para este tren.", options: ["dónde", "donde", "adónde", "adonde"], answer: 0, explanation: "En las oraciones interrogativas indirectas, los adverbios interrogativos como 'dónde' siempre llevan tilde." },
  { id: "b1-58", level: "B1", topic: "Contraste Indefinido e Imperfecto (Descripciones)", prompt: "El ladrón que vi ayer ___ el pelo corto y llevaba gafas de sol.", options: ["tenía", "tuvo", "tiene", "tendrá"], answer: 0, explanation: "El pretérito imperfecto se utiliza para describir características físicas de personas en el pasado." },
  // ---- B2 ----
  { id: "b2-1", level: "B2", topic: "Condicionales", prompt: "Si ___ más tiempo, viajaría contigo.", options: ["tuviera", "tengo", "tendría", "tuve"], answer: 0, explanation: "Condicional irreal: si + imperfecto de subjuntivo." },
  { id: "b2-2", level: "B2", topic: "Condicionales", prompt: "Si hubiera estudiado, ___ el examen.", options: ["habría aprobado", "aprobaría haber", "hubiera aprobado que", "aprobé"], answer: 0, explanation: "Tercer condicional: habría + participio." },
  { id: "b2-3", level: "B2", topic: "Subjuntivo imperfecto", prompt: "Me pidió que le ___ la verdad.", options: ["dijera", "diga", "digo", "diría"], answer: 0, explanation: "Verbo principal en pasado → subjuntivo imperfecto." },
  { id: "b2-4", level: "B2", topic: "Voz pasiva", prompt: "El proyecto ___ aprobado por el comité.", options: ["fue", "estuvo", "tuvo", "hubo"], answer: 0, explanation: "Pasiva con ser + participio." },
  { id: "b2-5", level: "B2", topic: "Conectores", prompt: "No vino, ___ estaba enfermo.", options: ["ya que", "para que", "aunque", "a fin de que"], answer: 0, explanation: "Causa → ya que." },
  { id: "b2-6", level: "B2", topic: "Concesivas", prompt: "Aunque ___ caro, lo compraré.", options: ["sea", "es", "fuera", "será"], answer: 0, explanation: "Concesión sobre información no constatada → subjuntivo." },
  { id: "b2-7", level: "B2", topic: "Ser / Estar avanzado", prompt: "La reunión ___ en la sala 3.", options: ["es", "está", "hay", "tiene"], answer: 0, explanation: "Localización de un evento → ser." },
  { id: "b2-8", level: "B2", topic: "Perífrasis", prompt: "___ trabajando aquí cinco años.", options: ["Llevo", "Estoy", "Tengo", "Vengo"], answer: 0, explanation: "Llevar + gerundio: duración." },
  { id: "b2-9", level: "B2", topic: "Subjuntivo relativo", prompt: "Busco a alguien que ___ chino.", options: ["hable", "habla", "hablará", "hablaba"], answer: 0, explanation: "Antecedente indefinido → subjuntivo." },
  { id: "b2-10", level: "B2", topic: "Preposiciones", prompt: "Se dio cuenta ___ su error.", options: ["de", "en", "por", "a"], answer: 0, explanation: "Régimen: darse cuenta de." },
  { id: "b2-11", level: "B2", topic: "Futuro perfecto", prompt: "Para junio ya ___ el máster.", options: ["habré terminado", "termino", "terminaré de", "había terminado"], answer: 0, explanation: "Acción acabada en el futuro." },
  { id: "b2-12", level: "B2", topic: "Se impersonal", prompt: "___ vende piso céntrico.", options: ["Se", "Le", "Lo", "Nos"], answer: 0, explanation: "Construcción impersonal/pasiva refleja con «se»." },
  { id: "b2-13", level: "B2", topic: "Oraciones temporales de futuro", prompt: "Te avisaré en cuanto ___ al hotel para que no te preocupes.", options: ["llegue", "llego", "llegaré", "llegaría"], answer: 0, explanation: "Las oraciones temporales referidas al futuro requieren siempre el modo subjuntivo." },
  { id: "b2-14", level: "B2", topic: "Probabilidad en el pasado", prompt: "Ayer no vinieron a trabajar, ___ enfermos.", options: ["estarían", "estén", "estar", "estuvieran"], answer: 0, explanation: "El condicional simple se puede utilizar para expresar probabilidad o suposición en el pasado." },
  { id: "b2-15", level: "B2", topic: "Pluscuamperfecto de subjuntivo con emoción", prompt: "Me sorprendió muchísimo que ellos no ___ a mi boda.", options: ["hubieran venido", "habían venido", "hayan venido", "habrían venido"], answer: 0, explanation: "Para una acción anterior a una emoción en el pasado se usa el pluscuamperfecto de subjuntivo." },
  { id: "b2-16", level: "B2", topic: "Oraciones finales en pasado", prompt: "Les dejé las llaves sobre la mesa para que ___ entrar sin problema.", options: ["pudieran", "pueden", "puedan", "podían"], answer: 0, explanation: "La conjunción 'para que' exige subjuntivo y en contextos pasados concuerda en imperfecto de subjuntivo." },
  { id: "b2-17", level: "B2", topic: "Artículo neutro intensificativo", prompt: "___ interesante de este libro es la perspectiva histórica inédita que presenta.", options: ["Lo", "El", "Un", "Qué"], answer: 0, explanation: "El artículo neutro 'lo' seguido de adjetivo sirve para abstraer o intensificar una cualidad." },
  { id: "b2-18", level: "B2", topic: "Estilo indirecto en pasado (afirmaciones)", prompt: "Marta me aseguró que ___ la película el día anterior con su hermano.", options: ["había visto", "vio", "veía", "vea"], answer: 0, explanation: "En estilo indirecto, el pretérito perfecto o indefinido pasa a pluscuamperfecto de indicativo cuando el verbo principal está en pasado." },
  { id: "b2-19", level: "B2", topic: "Oraciones modales comparativas", prompt: "El sospechoso me miró fijamente como si no me ___ de nada.", options: ["conociera", "conocía", "conozca", "conoce"], answer: 0, explanation: "La estructura comparativa 'como si' exige siempre el uso del imperfecto o pluscuamperfecto de subjuntivo." },
  { id: "b2-20", level: "B2", topic: "Verbos de sentimiento con mismo sujeto", prompt: "A Laura le molesta mucho ___ que esperar tantas horas en la consulta del médico.", options: ["tener", "tenga", "tenía", "tiene"], answer: 0, explanation: "Cuando el verbo principal de emoción y el de la subordinada comparten sujeto, se emplea el infinitivo." },
  { id: "b2-21", level: "B2", topic: "Pasiva refleja en imperfecto", prompt: "En aquella época dorada ___ muchas casas modernas en las afueras de la ciudad.", options: ["se construían", "construían", "se construía", "eran construidas"], answer: 0, explanation: "En la pasiva refleja, el verbo concuerda en plural con el sujeto paciente (muchas casas)." },
  { id: "b2-22", level: "B2", topic: "Verbos de percepción física en negativa", prompt: "Sinceramente, no vi que nadie ___ de aquel edificio abandonado anoche.", options: ["saliera", "salió", "salga", "salía"], answer: 0, explanation: "Los verbos de percepción física en forma negativa suelen regir el modo subjuntivo en la subordinada." },
  { id: "b2-23", level: "B2", topic: "Antecedente negativo explícito", prompt: "No conozco a nadie que ___ traducir este texto antiguo del sánscrito al español.", options: ["sepa", "sabe", "sabrá", "sabía"], answer: 0, explanation: "Cuando el antecedente en la oración principal es negativo (nadie, ninguno, nada), se exige el modo subjuntivo." },
  { id: "b2-24", level: "B2", topic: "Infinitivo compuesto de causa", prompt: "El conductor fue multado severamente por ___ el límite de velocidad en la autopista.", options: ["haber superado", "superar", "habiendo superado", "superando"], answer: 0, explanation: "El infinitivo compuesto con la preposición 'por' expresa una causa finalizada en el pasado." },
  { id: "b2-25", level: "B2", topic: "Verbos de constatación negativos", prompt: "No es verdad que el examen final de ayer ___ tan difícil como dicen.", options: ["fuera", "fue", "sea", "es"], answer: 0, explanation: "Las estructuras impersonales que constatan hechos exigen subjuntivo cuando están en forma negativa." },
  { id: "b2-26", level: "B2", topic: "Conectores adversativos avanzados", prompt: "No fue un simple error de cálculo, ___ hubo una negligencia deliberada.", options: ["sino que", "sino", "pero", "mientras que"], answer: 0, explanation: "La conjunción 'sino que' se utiliza para oponer una afirmación a una negación previa cuando la segunda introduce un verbo conjugado." },
  { id: "b2-27", level: "B2", topic: "Pronombre relativo con preposición", prompt: "La mujer a ___ entregué el paquete confidencial no era la verdadera destinataria.", options: ["quien", "cual", "que", "quienes"], answer: 0, explanation: "El pronombre relativo 'quien' se utiliza referido a personas después de una preposición." },
  { id: "b2-28", level: "B2", topic: "Locuciones causales formales", prompt: "El vuelo a Nueva York fue cancelado abruptamente ___ las fuertes tormentas eléctricas.", options: ["debido a", "porque", "por que", "ya que de"], answer: 0, explanation: "La locución preposicional 'debido a' introduce una causa formal y va seguida de sustantivo." },
  { id: "b2-29", level: "B2", topic: "Se accidental o de involuntariedad", prompt: "A Juan ___ cayeron las gafas al suelo y se le rompieron los cristales.", options: ["se le", "se lo", "le se", "se la"], answer: 0, explanation: "La estructura 'se accidental + pronombre indirecto' expresa que un evento ocurrió de forma involuntaria." },
  { id: "b2-30", level: "B2", topic: "Oraciones modales de futuro", prompt: "Puedes decorar la nueva oficina de la manera que te ___ más conveniente.", options: ["parezca", "parece", "parecerá", "parecería"], answer: 0, explanation: "Las oraciones de modo referidas a un futuro o a una situación desconocida exigen el modo subjuntivo." },
  { id: "b2-31", level: "B2", topic: "Oraciones temporales de límite", prompt: "Me quedaré trabajando en la biblioteca hasta que ___ la puerta principal.", options: ["cierren", "cierran", "cerrarán", "cerraron"], answer: 0, explanation: "La conjunción 'hasta que' rige subjuntivo cuando indica un límite temporal en el futuro." },
  { id: "b2-32", level: "B2", topic: "Doble negación en oraciones temporales", prompt: "No pienso decir ni una sola palabra más hasta que no ___ mi abogado.", options: ["llegue", "llega", "llegará", "llegó"], answer: 0, explanation: "En la construcción enfática 'hasta que no' con valor de futuro, el verbo subordinado debe ir en subjuntivo." },
  { id: "b2-33", level: "B2", topic: "Oración temporal en el pasado", prompt: "Logramos salir del edificio rápidamente antes de que el techo se ___.", options: ["derrumbara", "derrumbó", "derrumbe", "derrumbaba"], answer: 0, explanation: "La locución temporal 'antes de que' rige obligatoriamente el modo subjuntivo, usando el imperfecto si el contexto es pasado." },
  { id: "b2-34", level: "B2", topic: "Subjuntivo con verbos de emoción en pasado", prompt: "Me alegró muchísimo que tus padres ___ venir a la ceremonia de graduación.", options: ["pudieran", "pudieron", "puedan", "podrían"], answer: 0, explanation: "Los verbos de emoción en pasado rigen el pretérito imperfecto de subjuntivo en la oración subordinada." },
  { id: "b2-35", level: "B2", topic: "Construcciones valorativas en pasado", prompt: "Fue una verdadera lástima que no ___ buen tiempo durante nuestro viaje a la costa.", options: ["hiciera", "hizo", "haga", "hacía"], answer: 0, explanation: "Las estructuras impersonales de valoración en pasado exigen imperfecto de subjuntivo." },
  { id: "b2-36", level: "B2", topic: "Oraciones condicionales mixtas", prompt: "Si no hubieras gastado todo el dinero ayer, ahora ___ ir con nosotros al concierto.", options: ["podrías", "habrías podido", "pudiste", "puedas"], answer: 0, explanation: "Cuando la condición pasada afecta al presente, la oración principal utiliza el condicional simple." },
  { id: "b2-37", level: "B2", topic: "Estilo indirecto con órdenes en el pasado", prompt: "El médico me dijo estrictamente que ___ más agua durante el día.", options: ["bebiera", "bebía", "beba", "bebería"], answer: 0, explanation: "Los imperativos del discurso directo se transforman en imperfecto de subjuntivo en el estilo indirecto pasado." },
  { id: "b2-38", level: "B2", topic: "Oraciones concesivas irreales", prompt: "Aunque me lo ___ gratis, no viviría en esa ciudad tan ruidosa y contaminada.", options: ["ofrecieran", "ofrecieron", "ofrecen", "ofrecerían"], answer: 0, explanation: "La conjunción 'aunque' rige imperfecto de subjuntivo cuando expresa una hipótesis irreal o muy improbable." },
  { id: "b2-39", level: "B2", topic: "Conectores consecutivos con subjuntivo", prompt: "La empresa perdió muchos clientes, de ahí que el director ___ cambiar su estrategia de marketing.", options: ["decidiera", "decidió", "decidía", "decidiría"], answer: 0, explanation: "El conector consecutivo 'de ahí que' exige obligatoriamente el modo subjuntivo." },
  { id: "b2-40", level: "B2", topic: "Pasiva refleja con concordancia", prompt: "En esta región del sur ___ muchos productos agrícolas para la exportación.", options: ["se cultivan", "se cultiva", "cultivan", "se cultivaban"], answer: 0, explanation: "En la pasiva refleja, el verbo debe concordar en plural con el sujeto paciente paciente." },
  { id: "b2-41", level: "B2", topic: "Verbos de cambio de carácter", prompt: "Desde que ganó la lotería, Carlos se ___ una persona muy desconfiada.", options: ["ha vuelto", "ha hecho", "se quedó", "se puso"], answer: 0, explanation: "El verbo pronominal 'volverse' se utiliza para indicar cambios de personalidad o carácter duraderos." },
  { id: "b2-42", level: "B2", topic: "Expresión de duda o probabilidad", prompt: "Puede que mañana nosotros ___ un poco tarde a la reunión debido al tráfico.", options: ["lleguemos", "llegamos", "llegaremos", "llegábamos"], answer: 0, explanation: "La locución 'puede que' rige subjuntivo porque expresa una alta probabilidad en forma de hipótesis." },
  { id: "b2-43", level: "B2", topic: "Pretérito perfecto de subjuntivo", prompt: "Me alegra mucho que por fin ___ encontrar un apartamento céntrico para vivir.", options: ["hayas podido", "has podido", "pudiste", "pudieras"], answer: 0, explanation: "Para una acción pasada vinculada a una emoción en el presente, se usa el pretérito perfecto de subjuntivo." },
  { id: "b2-44", level: "B2", topic: "Deseos irreales en el presente", prompt: "Ojalá ___ vacaciones ahora mismo, estoy demasiado agotado por el trabajo.", options: ["tuviera", "tengo", "tendré", "tenía"], answer: 0, explanation: "La partícula 'ojalá' seguida de imperfecto de subjuntivo expresa un deseo muy improbable o imposible en el presente." },
  { id: "b2-45", level: "B2", topic: "Régimen preposicional de los verbos", prompt: "¿Te acordaste ___ apagar las luces y cerrar la puerta antes de salir de casa?", options: ["de", "a", "en", "por"], answer: 0, explanation: "El verbo pronominal 'acordarse' exige siempre ir acompañado de la preposición 'de'." },
  { id: "b2-46", level: "B2", topic: "Pronombres relativos compuestos", prompt: "El proyecto de investigación ___ estamos trabajando ahora es muy importante para la compañía.", options: ["en el que", "que", "el cual", "donde"], answer: 0, explanation: "Cuando el pronombre relativo depende de una preposición, se utiliza preposición + artículo definido + que." },
  { id: "b2-47", level: "B2", topic: "Contraste Ser y Estar con adjetivos", prompt: "No te fíes mucho de ese vendedor, es muy ___ y siempre intenta engañar a la gente.", options: ["listo", "preparado", "inteligente", "atento"], answer: 0, explanation: "El adjetivo 'listo' con el verbo 'ser' significa 'astuto', a diferencia de 'estar listo' que significa 'preparado'." },
  { id: "b2-48", level: "B2", topic: "Artículo neutro con valor enfático", prompt: "No te puedes imaginar ___ difícil que fue aprobar el examen de ayer sin estudiar apenas.", options: ["lo", "el", "cuan", "qué"], answer: 0, explanation: "La estructura 'lo + adjetivo + que' funciona como un fuerte intensificador exclamativo en oraciones indirectas." },
  { id: "b2-49", level: "B2", topic: "Subordinadas sustantivas (El hecho de que)", prompt: "El hecho de que no ___ a la reunión nos demostró su falta de compromiso con el proyecto.", options: ["viniera", "vino", "vendría", "venga"], answer: 0, explanation: "La expresión 'el hecho de que' suele regir subjuntivo porque presenta la información como un tema consabido o ya conocido." },
  { id: "b2-50", level: "B2", topic: "Oraciones modales (Sin que)", prompt: "El ladrón logró salir de la oficina de seguridad sigilosamente sin que el guardia de turno lo ___.", options: ["viera", "vio", "vería", "vea"], answer: 0, explanation: "La locución preposicional modal 'sin que' exige siempre el modo subjuntivo, usando el imperfecto por el contexto pasado." },
  { id: "b2-51", level: "B2", topic: "Oraciones causales (Como inicial)", prompt: "Como no ___ dinero suficiente para pagar el alquiler mensual, tuvieron que mudarse a las afueras.", options: ["tenían", "tuvieran", "tienen", "tendrían"], answer: 0, explanation: "La conjunción causal 'como' siempre se construye con el modo indicativo cuando encabeza la oración." },
  { id: "b2-52", level: "B2", topic: "Oraciones consecutivas (Tan... que)", prompt: "El examen de física cuántica fue tan complicado que la gran mayoría de los alumnos lo ___.", options: ["suspendió", "suspendiera", "suspende", "suspendería"], answer: 0, explanation: "Las oraciones consecutivas que utilizan la estructura 'tan + adjetivo + que' constatan un hecho real en modo indicativo." },
  { id: "b2-53", level: "B2", topic: "Condicional de cortesía (Gustar que)", prompt: "Me gustaría muchísimo que tú me ___ a preparar la presentación para la conferencia de mañana.", options: ["ayudaras", "ayudas", "ayudabas", "ayudes"], answer: 0, explanation: "Cuando el verbo principal expresa un deseo cortés usando el condicional simple, la subordinada debe ir en imperfecto de subjuntivo." },
  { id: "b2-54", level: "B2", topic: "Oraciones concesivas (Por mucho que)", prompt: "Por mucho que ___ mañana para convencerlo, sé que no cambiará de opinión bajo ninguna circunstancia.", options: ["insistas", "insistes", "insististe", "insistirás"], answer: 0, explanation: "La construcción 'por mucho que' rige subjuntivo cuando expresa una acción futura que se percibe como inútil o hipotética." },
  { id: "b2-55", level: "B2", topic: "Pasiva refleja con verbos modales", prompt: "En la antigüedad, desde la ventana de mi habitación se ___ ver las montañas nevadas del valle.", options: ["podían", "podía", "pudieran", "pudo"], answer: 0, explanation: "En la pasiva refleja formada por un verbo modal más infinitivo, el verbo concuerda en plural con el sujeto paciente paciente." },
  { id: "b2-56", level: "B2", topic: "Oraciones temporales en el pasado (Hasta que)", prompt: "Ayer estuvimos esperando bajo la lluvia en la parada del autobús hasta que por fin ___ el último de la noche.", options: ["llegó", "llegara", "llega", "llegaría"], answer: 0, explanation: "La locución temporal 'hasta que' lleva indicativo cuando se constata que la acción ya ocurrió efectivamente en el pasado." },
  { id: "b2-57", level: "B2", topic: "Expresión de duda en el pasado", prompt: "En aquella época, yo dudaba mucho que mi solicitud de visado de trabajo ___ aprobada tan rápido.", options: ["fuera", "fue", "sea", "sería"], answer: 0, explanation: "El verbo 'dudar' en forma afirmativa expresa una clara incertidumbre y exige el uso del subjuntivo en la oración subordinada." },
  { id: "b2-58", level: "B2", topic: "Negación de certeza en el pasado", prompt: "Cuando firmé el contrato hipotecario, no estaba nada seguro de que ___ la mejor decisión para mi futuro.", options: ["fuera", "era", "sería", "sea"], answer: 0, explanation: "La negación de estructuras de certeza y seguridad rige el uso del subjuntivo, usando el imperfecto por la correlación pasada." },
  { id: "b2-59", level: "B2", topic: "Oraciones de relativo inespecíficas (Adonde)", prompt: "En nuestras próximas vacaciones iremos de viaje adonde tú ___, ya que a mí me da exactamente igual el destino.", options: ["quieras", "quieres", "quisieras", "querrás"], answer: 0, explanation: "Cuando el antecedente de lugar indica una elección libre, inespecífica o futura, se exige el uso del modo subjuntivo." },
  { id: "b2-60", level: "B2", topic: "Verbos preposicionales (Renunciar)", prompt: "Debido a graves problemas de salud, el gerente de la corporación tuvo que renunciar irrevocablemente ___ su puesto.", options: ["a", "de", "con", "en"], answer: 0, explanation: "En español, el verbo de dimisión o abandono 'renunciar' exige siempre ir acompañado obligatoriamente de la preposición 'a'." },
  { id: "b2-61", level: "B2", topic: "Fórmulas reduplicativas (Incertidumbre)", prompt: "Pase lo que ___, te prometo firmemente que siempre vas a contar con mi apoyo incondicional en este asunto.", options: ["pase", "pasa", "pasará", "pasaría"], answer: 0, explanation: "Las construcciones reduplicativas que expresan indiferencia o concesión absoluta frente a cualquier escenario requieren siempre subjuntivo." },
  { id: "b2-62", level: "B2", topic: "Perífrasis de probabilidad en pasado (Deber de)", prompt: "Cuando los investigadores encontraron el coche abandonado, los ladrones ya debían de ___ muy lejos de allí.", options: ["estar", "estén", "estaban", "estuvieron"], answer: 0, explanation: "La perífrasis 'deber de + infinitivo' sirve para formular una deducción, suposición o probabilidad fuerte sobre un hecho." },
  { id: "b2-63", level: "B2", topic: "Oraciones temporales habituales (Siempre que)", prompt: "Siempre que ___ a visitar a mis abuelos al pueblo durante la infancia, me preparaban mi comida favorita.", options: ["iba", "vaya", "fuera", "fui"], answer: 0, explanation: "La locución 'siempre que' con valor temporal rige indicativo cuando expresa una costumbre o acción repetida en el pasado." },
  { id: "b2-64", level: "B2", topic: "Correlación temporal (Futuro del pasado)", prompt: "El meteorólogo de la cadena nacional anunció el lunes que las temperaturas ___ drásticamente a finales de esa semana.", options: ["bajarían", "bajarán", "bajaban", "bajen"], answer: 0, explanation: "Para expresar una acción futura tomando como punto de referencia exclusivo un momento del pasado, se emplea el condicional simple." },
  { id: "b2-65", level: "B2", topic: "Verbos de voluntad u oposición (Oponerse a)", prompt: "Los vecinos de la urbanización se opusieron rotundamente a que el ayuntamiento ___ aquellos árboles centenarios del parque.", options: ["talara", "taló", "talar", "talaba"], answer: 0, explanation: "Los verbos que indican oposición o prohibición rigen el modo subjuntivo cuando el sujeto de la oración subordinada es diferente." },
  { id: "b2-66", level: "B2", topic: "Causales excluyentes (No porque... sino porque)", prompt: "No lo contratamos porque ___ mucha experiencia previa, sino por su increíble motivación personal durante la entrevista.", options: ["tuviera", "tenía", "tiene", "tendría"], answer: 0, explanation: "En la estructura causal negativa 'no porque... sino porque', la causa rechazada o negada siempre debe ir en modo subjuntivo." },
  { id: "b2-67", level: "B2", topic: "Expresiones impersonales de suficiencia (Bastar con)", prompt: "Para abrir una cuenta bancaria en esta sucursal, no basta con que el cliente ___ su pasaporte en vigor.", options: ["traiga", "trae", "traerá", "trajo"], answer: 0, explanation: "Las expresiones impersonales de suficiencia como 'bastar con que' requieren obligatoriamente el subjuntivo al introducir una nueva cláusula." },
  { id: "b2-68", level: "B2", topic: "Oraciones consecutivas factuales (De modo que)", prompt: "El ponente habló demasiado bajo durante toda la conferencia, de modo que los del fondo no se ___ de casi nada.", options: ["enteraron", "enteraran", "enteren", "enterarían"], answer: 0, explanation: "El conector consecutivo 'de modo que' se usa con el modo indicativo cuando expresa un resultado objetivo y real de una acción." },
  // ---- C1 ----
  { id: "c1-1", level: "C1", topic: "Subjuntivo matizado", prompt: "No es que no ___ ganas, es que no puedo.", options: ["tenga", "tengo", "tendré", "tuve"], answer: 0, explanation: "«No es que» → subjuntivo." },
  { id: "c1-2", level: "C1", topic: "Conectores", prompt: "___ de que llueva, saldremos igualmente.", options: ["A pesar", "Pese", "Aun", "Aunque"], answer: 0, explanation: "Locución: a pesar de que." },
  { id: "c1-3", level: "C1", topic: "Perífrasis", prompt: "___ por decir una tontería.", options: ["Estuve a punto", "Estuve para", "Fui a punto", "Acabé a punto"], answer: 0, explanation: "Estar a punto de + infinitivo." },
  { id: "c1-4", level: "C1", topic: "Estilo indirecto", prompt: "Me preguntó si ___ ido antes.", options: ["había", "he", "hubiera", "habría"], answer: 0, explanation: "Correlación temporal en pasado → había." },
  { id: "c1-5", level: "C1", topic: "Subjuntivo pluscuamperfecto", prompt: "Ojalá me lo ___ antes.", options: ["hubieras dicho", "habías dicho", "has dicho", "dirías"], answer: 0, explanation: "Deseo irreal pasado → hubiera + participio." },
  { id: "c1-6", level: "C1", topic: "Léxico-gramática", prompt: "El acuerdo entró ___ vigor en enero.", options: ["en", "a", "de", "por"], answer: 0, explanation: "Colocación fija: entrar en vigor." },
  { id: "c1-7", level: "C1", topic: "Correlación", prompt: "De haberlo sabido, no ___ nada.", options: ["habría dicho", "diría", "dije", "hubiera decir"], answer: 0, explanation: "«De + infinitivo compuesto» equivale a un condicional irreal." },
  { id: "c1-8", level: "C1", topic: "Concordancia culta", prompt: "La mayoría de los alumnos ___ aprobado.", options: ["han", "ha de", "hubieron", "habían de"], answer: 0, explanation: "Concordancia ad sensum con el plural." },
  { id: "c1-9", level: "C1", topic: "Subordinadas", prompt: "Por mucho que ___, no lo conseguirás.", options: ["insistas", "insistes", "insistirás", "insistías"], answer: 0, explanation: "«Por mucho que» concesivo → subjuntivo." },
  { id: "c1-10", level: "C1", topic: "Voz media", prompt: "Se ___ los datos antes de publicarlos.", options: ["contrastaron", "contrastó", "contrastaba", "contrastar"], answer: 0, explanation: "Pasiva refleja concordando con «los datos»." },
  { id: "c1-11", level: "C1", topic: "Registro formal", prompt: "Le ruego que ___ la documentación adjunta.", options: ["revise", "revisa", "revisará", "revisaría"], answer: 0, explanation: "Petición formal → subjuntivo." },
  { id: "c1-12", level: "C1", topic: "Matiz aspectual", prompt: "Se puso a llover justo ___ salir.", options: ["al", "en", "para", "por"], answer: 0, explanation: "«Al + infinitivo» expresa simultaneidad." },
  { id: "c1-13", level: "C1", topic: "Verbos de afección y emoción", prompt: "A la junta directiva le indigna que los accionistas mayoritarios no ___ el informe financiero anual.", options: ["hayan leído", "han leído", "habían leído", "leyeron"], answer: 0, explanation: "Los verbos que expresan sentimientos rigen subjuntivo cuando hay distinto sujeto en la oración principal y subordinada." },
  { id: "c1-14", level: "C1", topic: "Infinitivo compuesto", prompt: "El exfuncionario se arrepiente profundamente de no ___ la verdad durante el interrogatorio judicial.", options: ["haber dicho", "decir", "habiendo dicho", "diciendo"], answer: 0, explanation: "Se usa el infinitivo compuesto con preposición para expresar una acción ya finalizada y anterior al verbo principal." },
  { id: "c1-15", level: "C1", topic: "Condicionales mixtas", prompt: "Si hubieras estudiado la carrera de derecho como te sugirieron, ahora ___ un abogado exitoso.", options: ["serías", "habrías sido", "fueras", "serás"], answer: 0, explanation: "En una condicional mixta, la condición en el pasado rige pluscuamperfecto de subjuntivo y la consecuencia en el presente lleva condicional simple." },
  { id: "c1-16", level: "C1", topic: "Participio absoluto", prompt: "___ la conferencia magistral, los asistentes se dirigieron al salón para el banquete oficial.", options: ["Terminada", "Terminado", "Al terminar de", "Terminando"], answer: 0, explanation: "En las construcciones absolutas, el participio debe concordar en género y número con el sustantivo que funciona como su sujeto." },
  { id: "c1-17", level: "C1", topic: "Expresiones de duda o improbabilidad", prompt: "Resulta totalmente inverosímil que el principal sospechoso ___ escapar de una prisión de máxima seguridad.", options: ["haya logrado", "ha logrado", "logró", "lograba"], answer: 0, explanation: "Las estructuras impersonales que expresan duda, falsedad o improbabilidad rigen siempre el modo subjuntivo." },
  { id: "c1-18", level: "C1", topic: "Régimen preposicional de verbos", prompt: "La nueva directiva se empeña tercamente ___ implementar un obsoleto sistema de control de asistencia.", options: ["en", "a", "por", "de"], answer: 0, explanation: "El verbo pronominal empeñarse siempre exige la preposición en ante infinitivos o sintagmas nominales." },
  { id: "c1-19", level: "C1", topic: "Conectores concesivos de contraste", prompt: "Si bien el proyecto arquitectónico ___ múltiples desafíos técnicos iniciales, lograron terminarlo a tiempo.", options: ["presentaba", "presentara", "presente", "hubiera presentado"], answer: 0, explanation: "El conector de contraste si bien es formal y siempre va acompañado del modo indicativo." },
  { id: "c1-20", level: "C1", topic: "Relativos con preposición", prompt: "El complejo asunto judicial ___ se refirió el presidente en su discurso generó mucha polémica nacional.", options: ["al que", "que", "cuyo", "el cual"], answer: 0, explanation: "El verbo referirse rige la preposición a, la cual debe mantenerse obligatoriamente delante del pronombre relativo." },
  { id: "c1-21", level: "C1", topic: "Verbos de percepción física", prompt: "Los sismólogos pudieron notar claramente cómo la estructura del edificio ___ durante el fuerte terremoto.", options: ["temblaba", "temblara", "tiemble", "temblase"], answer: 0, explanation: "Los verbos de percepción física en oraciones afirmativas van seguidos de la conjunción cómo y el modo indicativo." },
  { id: "c1-22", level: "C1", topic: "Expresiones idiomáticas y locuciones", prompt: "El recorte presupuestario fue aprobado ___, sin que ningún miembro del comité estuviera realmente convencido.", options: ["a regañadientes", "a sabiendas", "de oídas", "a hurtadillas"], answer: 0, explanation: "La locución adverbial a regañadientes significa realizar una acción con mucho disgusto o mala gana." },
  { id: "c1-23", level: "C1", topic: "Omisión del artículo definido", prompt: "Como ciudadano de este país, usted tiene derecho inalienable ___ asistencia médica gratuita y universal.", options: ["a", "a la", "hacia la", "para la"], answer: 0, explanation: "Con el sustantivo abstracto derecho a, seguido de nombres no contables o genéricos, habitualmente se omite el artículo." },
  { id: "c1-24", level: "C1", topic: "Subjuntivo en cláusulas relativas", prompt: "Busco una persona que ___ dominar al menos tres idiomas asiáticos.", options: ["sepa", "sabe", "sabrá", "sabía"], answer: 0, explanation: "El antecedente es desconocido y específico, por lo que se exige el modo subjuntivo." },
  { id: "c1-25", level: "C1", topic: "Condicionales irreales en el pasado", prompt: "Si me hubieran avisado con tiempo, ___ al congreso en Madrid.", options: ["habría asistido", "asistí", "asistiría", "asistía"], answer: 0, explanation: "Para condiciones irreales en el pasado se usa el condicional compuesto en la apódosis." },
  { id: "c1-26", level: "C1", topic: "Oraciones concesivas", prompt: "Por mucho que ___ de convencerme, no cambiaré mi postura al respecto.", options: ["trates", "tratas", "tratarás", "trataste"], answer: 0, explanation: "La estructura concesiva con por mucho que rige subjuntivo cuando expresa una acción futura o hipotética." },
  { id: "c1-27", level: "C1", topic: "Verbos de cambio", prompt: "Debido a la severa crisis económica, la situación financiera del país ___ insostenible.", options: ["se volvió", "se hizo", "se quedó", "llegó a ser"], answer: 0, explanation: "El verbo volverse se utiliza para indicar un cambio profundo y duradero, a menudo negativo." },
  { id: "c1-28", level: "C1", topic: "Perífrasis verbales de progreso", prompt: "El gobierno ___ advirtiendo sobre los riesgos de inflación desde hace meses.", options: ["viene", "anda", "va", "lleva"], answer: 0, explanation: "La perífrasis venir con gerundio expresa una acción que se repite o progresa desde el pasado hasta el presente." },
  { id: "c1-29", level: "C1", topic: "Oraciones temporales de inmediatez", prompt: "Nada más ___ la noticia de su dimisión, los mercados bursátiles colapsaron.", options: ["conocerse", "conocer", "que se conoció", "al conocer"], answer: 0, explanation: "La locución temporal nada más siempre va seguida de un verbo en infinitivo." },
  { id: "c1-30", level: "C1", topic: "Impersonalidad con se", prompt: "En esta empresa corporativa ___ a los empleados que muestran iniciativa y creatividad.", options: ["se premia", "se premian", "se premían", "premian"], answer: 0, explanation: "Cuando el objeto directo es de persona y lleva la preposición a, la oración es impersonal y el verbo va en singular." },
  { id: "c1-31", level: "C1", topic: "Oraciones consecutivas", prompt: "Las negociaciones laborales fracasaron rotundamente; de ahí que el sindicato ___ la huelga general.", options: ["convocara", "convocó", "convocaba", "había convocado"], answer: 0, explanation: "El nexo consecutivo de ahí que siempre rige el modo subjuntivo." },
  { id: "c1-32", level: "C1", topic: "Oraciones finales", prompt: "Se han implementado nuevas medidas fiscales a fin de que la economía ___ a crecer rápidamente.", options: ["vuelva", "vuelve", "volverá", "volviera"], answer: 0, explanation: "La locución final a fin de que siempre exige el uso del modo subjuntivo." },
  { id: "c1-33", level: "C1", topic: "Usos del relativo cuyo", prompt: "El autor, ___ obras fueron prohibidas durante la dictadura, recibirá un sentido homenaje póstumo.", options: ["cuyas", "las cuales", "que sus", "de quien"], answer: 0, explanation: "El relativo de posesión cuyo debe concordar en género y número con el sustantivo que le sigue." },
  { id: "c1-34", level: "C1", topic: "Probabilidad y suposición", prompt: "Las luces del laboratorio están apagadas y no hay ruido; ___ haber salido todos los investigadores.", options: ["deben de", "tienen que", "hay que", "deberían"], answer: 0, explanation: "La perífrasis deber de con infinitivo se utiliza normativamente para expresar suposición o probabilidad." },
  { id: "c1-35", level: "C1", topic: "Voz pasiva de proceso", prompt: "El antiguo templo patrimonial ___ destruido por un devastador incendio a mediados del siglo dieciocho.", options: ["fue", "estuvo", "era", "estaba"], answer: 0, explanation: "Para narrar el evento o la acción puntual que ocasiona un cambio de estado en el pasado, se utiliza ser en pretérito indefinido." },
  { id: "c1-36", level: "C1", topic: "Uso del pronombre neutro lo", prompt: "No te imaginas ___ sumamente difícil que fue conseguir estas entradas exclusivas para la ópera.", options: ["lo", "qué", "cuan", "el"], answer: 0, explanation: "La estructura lo con adjetivo y que funciona como un fuerte intensificador exclamativo en oraciones indirectas." },
  { id: "c1-37", level: "C1", topic: "Oraciones temporales (Apenas)", prompt: "Apenas ___ la noticia, el director convocó una reunión de urgencia.", options: ["recibió", "recibiera", "recibe", "recibía"], answer: 0, explanation: "Con acciones pasadas puntuales y finalizadas, el nexo temporal 'apenas' exige el uso del modo indicativo." },
  { id: "c1-38", level: "C1", topic: "Concesivas (Por muy + adjetivo)", prompt: "Por muy inteligente que ___, no podrá resolver este problema sin los datos técnicos.", options: ["sea", "es", "fuera", "será"], answer: 0, explanation: "La estructura 'por muy + adjetivo + que' rige subjuntivo cuando la información no impide el desarrollo de la acción." },
  { id: "c1-39", level: "C1", topic: "Verbos de entendimiento en forma negativa", prompt: "No creo que la junta directiva ___ la propuesta de fusión empresarial mañana.", options: ["apruebe", "aprueba", "aprobará", "aprobara"], answer: 0, explanation: "Los verbos de entendimiento, percepción u opinión en forma negativa exigen el modo subjuntivo en la subordinada." },
  { id: "c1-40", level: "C1", topic: "Oraciones correlativas", prompt: "El candidato demostró tener tanto experiencia en el sector ___ habilidades de liderazgo.", options: ["como", "cuanto", "así", "igual"], answer: 0, explanation: "La estructura correlativa 'tanto... como' sirve para coordinar elementos estableciendo un matiz de adición y equivalencia." },
  { id: "c1-41", level: "C1", topic: "Oraciones relativas (Preposición + relativo)", prompt: "La crisis económica fue el motivo por ___ tuvimos que reducir la plantilla drásticamente.", options: ["el que", "lo que", "cual", "que"], answer: 0, explanation: "Tras una preposición, el pronombre relativo debe ir acompañado del artículo definido que concuerde con el antecedente." },
  { id: "c1-42", level: "C1", topic: "Verbos pronominales con cambio léxico", prompt: "Los sindicatos y la patronal ___ subir el salario mínimo un cinco por ciento este año.", options: ["acordaron", "se acordaron de", "acordaron de", "se acordaron"], answer: 0, explanation: "El verbo 'acordar' sin pronombre significa 'llegar a un acuerdo' y rige directamente un infinitivo o sustantivo." },
  { id: "c1-43", level: "C1", topic: "Fórmulas reduplicativas (Indiferencia)", prompt: "Diga lo que ___, nosotros seguiremos adelante con la huelga indefinida.", options: ["diga", "dice", "dirá", "dijo"], answer: 0, explanation: "En las construcciones reduplicativas que expresan indiferencia o una concesión extrema, se emplea obligatoriamente el subjuntivo." },
  { id: "c1-44", level: "C1", topic: "Construcciones concesivas (Aun + gerundio)", prompt: "Aun ___ todas las medidas de seguridad, el sistema sufrió un ataque informático grave.", options: ["tomando", "tomar", "tomado", "tomábamos"], answer: 0, explanation: "El adverbio 'aun' seguido inmediatamente de un gerundio tiene un valor concesivo análogo a 'aunque'." },
  { id: "c1-45", level: "C1", topic: "Futuro compuesto (Probabilidad)", prompt: "El vuelo ha sido cancelado; supongo que ___ algún problema técnico en el avión.", options: ["habrá habido", "hay", "habría", "había"], answer: 0, explanation: "El futuro compuesto se utiliza para formular una suposición o conjetura lógica referida a un pasado reciente." },
  { id: "c1-46", level: "C1", topic: "Condicional compuesto (Probabilidad)", prompt: "En aquella época, la capital del país ya ___ alcanzado los dos millones de habitantes.", options: ["habría", "habrá", "hubiera", "hubo"], answer: 0, explanation: "El condicional compuesto expresa una suposición, duda o cálculo aproximado en un tiempo pasado remoto." },
  { id: "c1-47", level: "C1", topic: "Oraciones de lugar (Antecedente desconocido)", prompt: "Iremos a vivir a un país donde no ___ tantos impuestos sobre la renta corporativa.", options: ["haya", "hay", "habrá", "había"], answer: 0, explanation: "Las oraciones de relativo exigen subjuntivo cuando se refieren a un antecedente desconocido, hipotético o inespecífico." },
  { id: "c1-48", level: "C1", topic: "Oraciones modales (Según + subjuntivo)", prompt: "Iremos adaptando la estrategia de ventas según ___ evolucionando el mercado internacional.", options: ["vaya", "va", "iba", "irá"], answer: 0, explanation: "La conjunción modal 'según' rige subjuntivo cuando la acción se refiere a un proceso futuro, gradual y paralelo." },
  { id: "c1-49", level: "C1", topic: "Sustantivación (Lo + adjetivo)", prompt: "___ verdaderamente preocupante de esta situación es la falta de recursos hídricos.", options: ["Lo", "El", "Un", "La"], answer: 0, explanation: "El artículo neutro 'lo' se utiliza para sustantivar adjetivos dotándolos de un significado abstracto y universal." },
  { id: "c1-50", level: "C1", topic: "Oraciones hendidas (Énfasis)", prompt: "Fue el propio ministro de sanidad ___ anunció las nuevas restricciones ayer por la noche.", options: ["quien", "que él", "el cual", "donde"], answer: 0, explanation: "En oraciones hendidas con 'ser' referidas a personas, se utiliza el pronombre 'quien' o 'el/la que' para dar énfasis." },
  { id: "c1-51", level: "C1", topic: "Marcadores del discurso (Contraargumentación)", prompt: "La empresa ha aumentado sus beneficios; ___, eso no implica una subida salarial general.", options: ["ahora bien", "en cambio", "por tanto", "así que"], answer: 0, explanation: "El marcador 'ahora bien' introduce una objeción, advertencia o restricción fuerte a lo dicho en el enunciado anterior." },
  { id: "c1-52", level: "C1", topic: "Verbos de voluntad (Distinto sujeto)", prompt: "El comité de ética se opone a que la corporación ___ fondos en paraísos fiscales.", options: ["invierta", "invierte", "invertir", "invertirá"], answer: 0, explanation: "Los verbos que expresan voluntad, ruego u oposición rigen subjuntivo cuando el sujeto de la subordinada es diferente." },
  { id: "c1-53", level: "C1", topic: "Impersonalidad (Uno/Una)", prompt: "En este país, si ___ quiere emprender un negocio propio, se enfrenta a mucha burocracia.", options: ["uno", "alguien", "se", "tú"], answer: 0, explanation: "El pronombre indefinido 'uno' sirve para hacer generalizaciones en las que el propio hablante puede estar incluido." },
  { id: "c1-54", level: "C1", topic: "Condicionales (Exclamativas de pasado)", prompt: "¡Quién ___ imaginado que la tecnología avanzaría de manera tan drástica en una década!", options: ["hubiera", "habría", "había", "haya"], answer: 0, explanation: "En frases exclamativas introducidas por 'quién', el pluscuamperfecto de subjuntivo expresa un asombro irreal en el pasado." },
  { id: "c1-55", level: "C1", topic: "Subordinadas sustantivas (Que inicial)", prompt: "___ la inflación esté subiendo de manera descontrolada alarma a los expertos del sector.", options: ["Que", "Si", "Como", "Porque"], answer: 0, explanation: "La conjunción 'que' a principio de frase introduce una subordinada sustantiva que funciona como sujeto oracional explícito." },
  { id: "c2-1", level: "C2", topic: "Locuciones preposicionales jurídicas", prompt: "La nueva normativa exige la readmisión del trabajador, ___ perjuicio de las indemnizaciones económicas correspondientes por daños morales.", options: ["sin", "con", "por", "bajo"], answer: 0, explanation: "La locución 'sin perjuicio de' pertenece al registro culto y significa 'dejando a salvo' o 'sin que esto invalide' otra acción." },
  { id: "c2-2", level: "C2", topic: "Condicionales excluyentes (A no ser que)", prompt: "El proyecto de infraestructura seguirá su curso natural, a no ser que el tribunal de cuentas ___ su inmediata paralización.", options: ["dictamine", "dictamina", "dictaminará", "dictaminaría"], answer: 0, explanation: "La construcción restrictiva y condicional 'a no ser que' impone invariablemente el uso del modo subjuntivo." },
  { id: "c2-3", level: "C2", topic: "Relativos complejos abstractos", prompt: "El reo se negó rotundamente a responder al interrogatorio de la fiscalía, ___ cual exasperó aún más al magistrado.", options: ["lo", "el", "la", "al"], answer: 0, explanation: "El pronombre relativo 'lo cual' retoma toda la idea expresada en la oración anterior como antecedente de género neutro." },
  { id: "c2-4", level: "C2", topic: "Concesivas irreales extremas (Así)", prompt: "No pienso retirar mis acusaciones públicas bajo ningún concepto, así me ___ de rodillas toda tu familia.", options: ["ruegue", "ruega", "rogará", "rogaría"], answer: 0, explanation: "En registro culto, la conjunción 'así' con valor concesivo hipotético rige siempre subjuntivo, equivaliendo a 'aunque'." },
  { id: "c2-5", level: "C2", topic: "Conectores argumentativos (Máxime cuando)", prompt: "Resulta del todo imprudente invertir en criptomonedas en este momento, máxime cuando los mercados financieros ___ tan extremadamente volátiles.", options: ["están", "estén", "estarían", "estuvieran"], answer: 0, explanation: "La locución causal/condicional 'máxime cuando' justifica algo con una razón evidente, por lo que rige el modo indicativo al constatar hechos." },
  { id: "c2-6", level: "C2", topic: "Fórmulas exclamativas de rechazo vehemente", prompt: "¡Que la tierra me ___ en este preciso instante si alguna vez he conspirado a tus espaldas!", options: ["trague", "traga", "tragará", "tragaría"], answer: 0, explanation: "Las exclamaciones que expresan un deseo vehemente de rechazo, imprecación o maldición requieren el subjuntivo introducido por 'que'." },
  { id: "c2-7", level: "C2", topic: "Causales de registro culto (Por cuanto)", prompt: "El recurso de amparo fue desestimado por el tribunal supremo, ___ no se logró probar ninguna vulneración de derechos fundamentales.", options: ["por cuanto", "porque que", "dado", "ya"], answer: 0, explanation: "El nexo 'por cuanto' es una conjunción causal típica del registro culto, jurídico y administrativo que equivale a 'dado que' o 'ya que'." },
  { id: "c2-8", level: "C2", topic: "Cláusulas absolutas (Participio)", prompt: "___ las negociaciones sin ningún tipo de acuerdo bilateral, los principales sindicatos decidieron convocar los paros indefinidos.", options: ["Rotas", "Rompiendo", "Rotos", "Haber roto"], answer: 0, explanation: "La construcción de participio absoluto antepuesta debe concordar siempre en género y número ('rotas') con su sujeto sintáctico ('negociaciones')." },
  { id: "c2-9", level: "C2", topic: "Concesivas con gerundio (Aun)", prompt: "Aun ___ perfectamente las desastrosas consecuencias legales de sus actos, el político decidió seguir adelante con el fraude masivo.", options: ["conociendo", "conocer", "conocido", "conociera"], answer: 0, explanation: "El adverbio 'aun' seguido directamente de un verbo en gerundio forma una oración concesiva, asimilable a 'aunque conocía'." },
  { id: "c2-10", level: "C2", topic: "Oraciones modales hipotéticas (Cual si)", prompt: "El presuntuoso heredero se paseaba por los pasillos del palacio cual si ___ el dueño indiscutible de aquel vasto imperio.", options: ["fuera", "era", "sería", "es"], answer: 0, explanation: "La locución 'cual si', propia del registro literario y equivalente a 'como si', exige siempre los tiempos pasados del subjuntivo." },
  { id: "c2-11", level: "C2", topic: "Futuro de subjuntivo (Ámbito legal)", prompt: "Quienquiera que ___ las cláusulas de confidencialidad de este contrato será procesado judicialmente.", options: ["quebrantare", "quebrantara", "quebrante", "quebrantará"], answer: 0, explanation: "En el lenguaje jurídico formal, se emplea el futuro de subjuntivo para establecer hipótesis legales o penales." },
  { id: "c2-12", level: "C2", topic: "Locuciones conjuntivas cultas", prompt: "El testigo deberá comparecer ante el tribunal mañana a primera hora, so pena de que se le ___ en desacato.", options: ["declare", "declara", "declarara", "declararía"], answer: 0, explanation: "La locución 'so pena de que' rige siempre modo subjuntivo para expresar una amenaza o consecuencia negativa futura." },
  { id: "c2-13", level: "C2", topic: "Expresiones lexicalizadas con subjuntivo", prompt: "No es que el nuevo candidato sea un erudito en la materia que ___.", options: ["digamos", "decimos", "dijéramos", "diríamos"], answer: 0, explanation: "La coletilla 'que digamos' se cristaliza siempre en presente de subjuntivo para matizar o rebajar una cualidad expresada previamente." },
  { id: "c2-14", level: "C2", topic: "Tiempos verbales desplazados (Pretérito anterior)", prompt: "Apenas el presidente ___ concluido su discurso de dimisión, estallaron los abucheos en todo el hemiciclo.", options: ["hubo", "había", "haya", "habría"], answer: 0, explanation: "El pretérito anterior (hubo + participio) se usa tras nexos temporales como 'apenas' para indicar inmediatez absoluta en el pasado literario." },
  { id: "c2-15", level: "C2", topic: "Perífrasis verbales aproximativas", prompt: "El sobrecoste de la obra faraónica del estadio municipal vino a ___ unos quinientos millones de euros al erario público.", options: ["suponer", "suponiendo", "supuesto", "suponga"], answer: 0, explanation: "La perífrasis 'venir a + infinitivo' tiene un valor de cálculo aproximado, equivalente a 'más o menos' o 'aproximadamente'." },
  { id: "c2-16", level: "C2", topic: "Pasiva refleja con concordancia ad sensum", prompt: "Durante la crisis financiera, se ___ una infinidad de rumores malintencionados sobre la quiebra del banco central.", options: ["difundieron", "difundió", "difundieran", "difundían"], answer: 0, explanation: "En construcciones pasivas reflejas con sujetos plurales complejos o cuantificadores, el verbo debe concordar obligatoriamente en plural." },
  { id: "c2-17", level: "C2", topic: "Condicionales de amenaza (Como + subjuntivo)", prompt: "Como no me ___ el informe redactado y corregido antes del mediodía, atente a las severas consecuencias.", options: ["entregues", "entregas", "entregarás", "entregabas"], answer: 0, explanation: "La conjunción 'como' encabeza una oración condicional con un matiz fuerte de amenaza o advertencia, exigiendo el modo subjuntivo." },
  { id: "c2-18", level: "C2", topic: "Concesivas factuales (Y eso que)", prompt: "El equipo visitante logró remontar el partido épicamente, y eso que no ___ entrenado durante toda la semana.", options: ["había", "hubiera", "haya", "habría"], answer: 0, explanation: "La locución concesiva 'y eso que' presenta un hecho real y constatado que se opone a lo esperado, por lo que rige indicativo." },
  { id: "c2-19", level: "C2", topic: "Pronombres relativos libres (Plural)", prompt: "___ que hayan sido los autores intelectuales de este fraude monumental, responderán ante la justicia internacional.", options: ["Quienesquiera", "Quienquiera", "Cualesquiera", "Cualquiera"], answer: 0, explanation: "El relativo indefinido debe concordar en plural ('quienesquiera') si se refiere a un antecedente o verbo en plural referente a personas." },
  { id: "c2-20", level: "C2", topic: "Infinitivo fático o introductorio", prompt: "Ni que decir ___ que toda la información revelada en esta junta directiva es de carácter estrictamente confidencial.", options: ["tiene", "tenga", "tendría", "tuvo"], answer: 0, explanation: "La expresión fija 'ni que decir tiene que' se utiliza siempre en presente de indicativo para introducir algo obvio o evidente." },
  { id: "c2-21", level: "C2", topic: "Locuciones preposicionales idiomáticas", prompt: "El consejero delegado firmó los documentos a ___ de que aquellas cláusulas abusivas terminarían costándole su prestigiosa carrera.", options: ["sabiendas", "sabiendo", "sabidas", "saber"], answer: 0, explanation: "La locución adverbial fija 'a sabiendas de' significa obrar con pleno conocimiento y deliberación, generalmente sobre algo perjudicial." },
  { id: "c2-22", level: "C2", topic: "Verbos de influencia en registro formal", prompt: "El embajador de las Naciones Unidas instó fervientemente a que se ___ un alto el fuego de manera inmediata y sin condiciones.", options: ["declarara", "declaró", "declara", "declararía"], answer: 0, explanation: "El verbo de influencia formal 'instar a' exige el uso del modo subjuntivo, usando el imperfecto por la correlación con un tiempo pasado." },
  { id: "c2-23", level: "C2", topic: "Condicionales mixtas de pasado (Prótasis irreal)", prompt: "De haber sospechado mínimamente sus aviesas intenciones, jamás me ___ en semejante empresa tan ruinosa y fraudulenta.", options: ["habría embarcado", "embarcara", "embarcaba", "embarco"], answer: 0, explanation: "Ante una condición pasada irreal construida con infinitivo compuesto, la consecuencia que no se produjo exige el condicional compuesto." },
  { id: "c2-24", level: "C2", topic: "Coordinación de adverbios terminados en -mente", prompt: "Para lograr superar esta peliaguda crisis corporativa, debemos actuar racional y ___ en todos los frentes internacionales posibles.", options: ["estratégicamente", "estratégica", "estratégica mente", "con estrategia"], answer: 0, explanation: "Cuando se coordinan dos adverbios en '-mente', el primero pierde el sufijo adoptando su forma femenina, y solo el último lo conserva." },
  { id: "c2-25", level: "C2", topic: "Condicional negativo de anterioridad (De no)", prompt: "De no ___ por tu inestimable y oportuna intervención económica, nuestra fundación se habría declarado en bancarrota hace años.", options: ["haber sido", "ser", "habiendo sido", "fuera"], answer: 0, explanation: "La estructura 'de no + infinitivo compuesto' se utiliza en registros muy cultos como equivalente a una prótasis condicional irreal negativa del pasado." },
];

const GRAMMAR_LEVEL_DESC = {
  A1: { en: "Present tense, articles, basic ser/estar", uk: "Теперішній час, артиклі, базові ser/estar", ar: "المضارع، أدوات التعريف، ser/estar الأساسي", ka: "აწმყო, არტიკლები, ძირითადი ser/estar", fr: "Présent, articles, ser/estar de base" },
  A2: { en: "Past tenses, pronouns, comparatives", uk: "Минулі часи, займенники, порівняння", ar: "أزمنة الماضي، الضمائر، صيغ المقارنة", ka: "წარსული დროები, ნაცვალსახელები, შედარებები", fr: "Passés, pronoms, comparatifs" },
  B1: { en: "Present subjunctive, conditional, por/para", uk: "Теперішній субʼюнктив, умовний спосіб, por/para", ar: "صيغة الشرط الحاضر، الشرطي، por/para", ka: "აწმყო კავშირებითი კილო, პირობითი კილო, por/para", fr: "Subjonctif présent, conditionnel, por/para" },
  B2: { en: "Imperfect subjunctive, passive voice, connectors", uk: "Минулий субʼюнктив, пасивний стан, сполучники", ar: "صيغة الشرط الماضي، المبني للمجهول، أدوات الربط", ka: "წარსული კავშირებითი კილო, ვნებითი გვარი, კავშირები", fr: "Subjonctif imparfait, passif, connecteurs" },
  C1: { en: "Verbal periphrases, reported speech, nuance", uk: "Дієслівні перифрази, непряма мова, нюанси", ar: "التراكيب الفعلية، الكلام غير المباشر، الفروق الدقيقة", ka: "ზმნური პერიფრაზები, არაპირდაპირი მეტყველება, ნიუანსები", fr: "Périphrases verbales, discours rapporté, nuances" },
  C2: { en: "Formal and legal register, archaic subjunctive, idiomatic set phrases", uk: "Офіційний і юридичний регістр, архаїчний субʼюнктив, стійкі звороти", ar: "السجل الرسمي والقانوني، صيغة الشرط الأثرية، التعبيرات الاصطلاحية الثابتة", ka: "ფორმალური და იურიდიული რეგისტრი, არქაული კავშირებითი კილო, იდიომური გამოთქმები", fr: "Registre soutenu et juridique, subjonctif archaïque, locutions figées" },
};

function pickGrammarQuestions(lv, count) {
  const pool = GRAMMAR_BANK.filter((item) => item.level === lv);
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

// Shuffles a question's options and returns the new option order plus the
// new index of the correct answer, without mutating the original item.
function shuffleGrammarOptions(question) {
  const indices = shuffle(question.options.map((_, i) => i));
  return {
    options: indices.map((i) => question.options[i]),
    correct: indices.indexOf(question.answer),
  };
}

// Spanish-university-style grade band for a percentage score.
function grammarGrade(pct, t) {
  if (pct >= 90) return { label: t.gradeOutstanding, color: COLORS.gold };
  if (pct >= 75) return { label: t.gradeGood, color: COLORS.green };
  if (pct >= 60) return { label: t.gradePass, color: "#38BDF8" };
  return { label: t.gradeFail, color: COLORS.red };
}

const GRAMMAR_HISTORY_KEY = "spanish-quiz-grammar-history";

async function loadGrammarHistory() {
  try {
    const res = await storage.get(GRAMMAR_HISTORY_KEY);
    return res ? JSON.parse(res.value) : [];
  } catch {
    return [];
  }
}

async function saveGrammarHistory(history) {
  try {
    await storage.set(GRAMMAR_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("grammar history save failed", e);
  }
}

const UI = {
  en: {
    chooseLevel: "Choose your level",
    levels: { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-Intermediate", C1: "Advanced", C2: "Proficient" },
    chooseMode: "Choose a mode", vocab: "Vocabulary", vocabDesc: "Guess the Spanish word",
    conjugation: "Conjugation", conjugationDesc: "Pick the right verb form",
    question: (n) => `Question ${n} of 15`, correct: "Correct!", wrong: "Try again",
    congratsHigh: () => "You're the best!", congratsMid: () => "Not bad — keep practicing", congratsLow: () => "Next time will be better",
    perfect: "Perfect run, zero mistakes",
    mistakesLabel: "Mistakes", playAgain: "Play again", changeMode: "Change mode", changeLang: "Change language", changeLevel: "Change level",
    statsTitle: "Statistics", levelLabel: "Level", statGames: "Games played", statWins: "Wins",
    statCorrect: "Correct answers", statIncorrect: "Incorrect answers", statPercent: "Accuracy",
    statXp: "Total XP", statCoins: "Coins earned", coinsLabel: "coins",
    thematic: "Thematic", thematicDesc: "Practice by topic", chooseCategory: "Choose a topic", srsDue: "Due for review",
    listen: "Listen", levelUp: (n) => `Level up! You're now Lv.${n}`,
    grammarCta: "Prefer a real exam? Try the grammar exam",
    grammarTitle: "Grammar exam",
    grammarDesc: "40 multiple-choice questions per level, university-exam style. No hints during the test — corrections and explanations come at the end.",
    grammarChooseLevel: "Choose your level",
    grammarRecent: "Recent attempts",
    grammarQuestionOf: (n, total) => `Question ${n} of ${total}`,
    grammarPrev: "Previous", grammarNext: "Next",
    grammarRemaining: (n) => `${n} left`, grammarFinish: "Finish exam",
    grammarResult: "Result", grammarByTopic: "By topic", grammarReview: "Review",
    grammarYourAnswer: "Your answer:", grammarCorrectAnswer: "Correct:",
    grammarRepeat: "Repeat", grammarLevels: "Levels",
    gradeOutstanding: "Outstanding", gradeGood: "Good", gradePass: "Pass", gradeFail: "Fail",
    statStreak: "Current streak", statLongestStreak: "Longest streak",
    conjTablesCta: "Conjugation tables", conjTablesTitle: "Conjugation tables", conjNoForm: "— (no form)",
    conjTablesDesc: "Browse full verb charts by tense",
    learningCta: "Learning", learningDesc: "Reference tables and study tools",
    genderTitle: "Your gender",
    genderMale: "Male", genderFemale: "Female", genderSkip: "Prefer not to say",
    freezesTitle: "Streak freezes", freezesDesc: "Automatically save your streak if you miss a day",
    buyFreeze: (cost) => `Buy for ${cost} coins`, freezesFull: "Max reached",
    byLevelTitle: "By level", byModeTitle: "By mode", noGamesYet: "No games yet",
    categories: { food: "Food", travel: "Travel", work: "Work", family: "Family", shopping: "Shopping", medicine: "Medicine", transport: "Transport", education: "Education", sports: "Sports" },
  },
  uk: {
    chooseLevel: "Оберіть свій рівень",
    levels: { A1: "Початковий", A2: "Елементарний", B1: "Середній", B2: "Вище середнього", C1: "Просунутий", C2: "Досконалий" },
    chooseMode: "Оберіть режим", vocab: "Лексика", vocabDesc: "Вгадай іспанське слово",
    conjugation: "Дієвідмінювання", conjugationDesc: "Обери правильну форму дієслова",
    question: (n) => `Питання ${n} з 15`, correct: "Правильно!", wrong: "Спробуй ще раз",
    congratsHigh: (g) => (g === "f" ? "Ти найкраща!" : g === "m" ? "Ти найкращий!" : "Найкращий результат!"), congratsMid: () => "Непогано, не забувай практикуватися", congratsLow: () => "Наступного разу вийде краще",
    perfect: "Ідеально, без жодної помилки",
    mistakesLabel: "Помилки", playAgain: "Грати ще раз", changeMode: "Змінити режим", changeLang: "Змінити мову", changeLevel: "Змінити рівень",
    statsTitle: "Статистика", levelLabel: "Рівень", statGames: "Зіграно ігор", statWins: "Перемоги",
    statCorrect: "Правильні відповіді", statIncorrect: "Неправильні відповіді", statPercent: "Точність",
    statXp: "Загальний XP", statCoins: "Зароблено монет", coinsLabel: "монет",
    thematic: "Тематика", thematicDesc: "Практика за темою", chooseCategory: "Оберіть тему", srsDue: "На повторенні",
    listen: "Прослухати", levelUp: (n) => `Новий рівень! Тепер Lv.${n}`,
    grammarCta: "Хочеш справжній екзамен? Спробуй тест з граматики",
    grammarTitle: "Екзамен з граматики",
    grammarDesc: "40 питань із варіантами відповіді на рівень, у стилі університетського екзамену. Без підказок під час тесту — розбір і пояснення в кінці.",
    grammarChooseLevel: "Обери свій рівень",
    grammarRecent: "Останні спроби",
    grammarQuestionOf: (n, total) => `Питання ${n} з ${total}`,
    grammarPrev: "Назад", grammarNext: "Далі",
    grammarRemaining: (n) => `Залишилось ${n}`, grammarFinish: "Завершити екзамен",
    grammarResult: "Результат", grammarByTopic: "За темами", grammarReview: "Розбір",
    grammarYourAnswer: "Твоя відповідь:", grammarCorrectAnswer: "Правильно:",
    grammarRepeat: "Повторити", grammarLevels: "Рівні",
    gradeOutstanding: "Відмінно", gradeGood: "Добре", gradePass: "Залік", gradeFail: "Незалік",
    statStreak: "Поточний стрик", statLongestStreak: "Найдовший стрик",
    conjTablesCta: "Таблиці дієвідмін", conjTablesTitle: "Таблиці дієвідмін", conjNoForm: "— (немає форми)",
    conjTablesDesc: "Перегляд повних таблиць дієслів за часом",
    learningCta: "Навчання", learningDesc: "Довідкові таблиці та навчальні матеріали",
    genderTitle: "Ваш рід",
    genderMale: "Чоловічий", genderFemale: "Жіночий", genderSkip: "Не хочу вказувати",
    freezesTitle: "Заморозки стрику", freezesDesc: "Автоматично рятують стрик, якщо пропустиш день",
    buyFreeze: (cost) => `Купити за ${cost} монет`, freezesFull: "Максимум досягнуто",
    byLevelTitle: "За рівнями", byModeTitle: "За режимами", noGamesYet: "Ще не грали",
    categories: { food: "Їжа", travel: "Подорожі", work: "Робота", family: "Сім'я", shopping: "Покупки", medicine: "Медицина", transport: "Транспорт", education: "Освіта", sports: "Спорт" },
  },
  ar: {
    chooseLevel: "اختر مستواك",
    levels: { A1: "مبتدئ", A2: "أساسي", B1: "متوسط", B2: "فوق المتوسط", C1: "متقدم", C2: "متمكن" },
    chooseMode: "اختر الوضع", vocab: "المفردات", vocabDesc: "خمّن الكلمة الإسبانية",
    conjugation: "تصريف الأفعال", conjugationDesc: "اختر صيغة الفعل الصحيحة",
    question: (n) => `السؤال ${n} من 15`, correct: "صحيح!", wrong: "حاول مرة أخرى",
    congratsHigh: (g) => (g === "f" ? "أنتِ الأفضل!" : g === "m" ? "أنتَ الأفضل!" : "أفضل نتيجة!"), congratsMid: (g) => (g === "f" ? "لا بأس، لا تنسَي التدرب" : g === "m" ? "لا بأس، لا تنسَ التدرب" : "لا بأس، الاستمرار في التدرب مهم"), congratsLow: () => "في المرة القادمة ستكون أفضل",
    perfect: "أداء مثالي، بدون أي خطأ",
    mistakesLabel: "الأخطاء", playAgain: "العب مرة أخرى", changeMode: "تغيير الوضع", changeLang: "تغيير اللغة", changeLevel: "تغيير المستوى",
    statsTitle: "الإحصائيات", levelLabel: "المستوى", statGames: "عدد الألعاب", statWins: "الانتصارات",
    statCorrect: "الإجابات الصحيحة", statIncorrect: "الإجابات الخاطئة", statPercent: "نسبة الدقة",
    statXp: "إجمالي XP", statCoins: "العملات المكتسبة", coinsLabel: "عملة",
    thematic: "مواضيع", thematicDesc: "تدرب حسب الموضوع", chooseCategory: "اختر موضوعًا", srsDue: "بانتظار المراجعة",
    listen: "استمع", levelUp: (n) => `مستوى جديد! أنت الآن Lv.${n}`,
    grammarCta: "تفضل اختبارًا حقيقيًا؟ جرّب اختبار القواعد",
    grammarTitle: "اختبار القواعد",
    grammarDesc: "40 سؤال اختيار من متعدد لكل مستوى، على طراز الامتحان الجامعي. بلا تلميحات أثناء الاختبار — التصحيح والشرح في النهاية.",
    grammarChooseLevel: "اختر مستواك",
    grammarRecent: "المحاولات الأخيرة",
    grammarQuestionOf: (n, total) => `السؤال ${n} من ${total}`,
    grammarPrev: "السابق", grammarNext: "التالي",
    grammarRemaining: (n) => `تبقّى ${n}`, grammarFinish: "إنهاء الاختبار",
    grammarResult: "النتيجة", grammarByTopic: "حسب الموضوع", grammarReview: "المراجعة",
    grammarYourAnswer: "إجابتك:", grammarCorrectAnswer: "الصحيح:",
    grammarRepeat: "إعادة", grammarLevels: "المستويات",
    gradeOutstanding: "ممتاز", gradeGood: "جيد جدًا", gradePass: "ناجح", gradeFail: "راسب",
    statStreak: "التتابع الحالي", statLongestStreak: "أطول تتابع",
    conjTablesCta: "جداول التصريف", conjTablesTitle: "جداول التصريف", conjNoForm: "— (لا توجد صيغة)",
    conjTablesDesc: "تصفح جداول الأفعال الكاملة حسب الزمن",
    learningCta: "التعلم", learningDesc: "جداول مرجعية وأدوات دراسية",
    genderTitle: "جنسك",
    genderMale: "ذكر", genderFemale: "أنثى", genderSkip: "أفضل عدم التحديد",
    freezesTitle: "تجميد التتابع", freezesDesc: "يحفظ تتابعك تلقائيًا إذا فاتك يوم",
    buyFreeze: (cost) => `اشترِ مقابل ${cost} عملة`, freezesFull: "تم بلوغ الحد الأقصى",
    byLevelTitle: "حسب المستوى", byModeTitle: "حسب الوضع", noGamesYet: "لا توجد ألعاب بعد",
    categories: { food: "الطعام", travel: "السفر", work: "العمل", family: "العائلة", shopping: "التسوق", medicine: "الطب", transport: "النقل", education: "التعليم", sports: "الرياضة" },
  },
  ka: {
    chooseLevel: "აირჩიეთ თქვენი დონე",
    levels: { A1: "დამწყები", A2: "საბაზისო", B1: "საშუალო", B2: "საშუალოზე მაღალი", C1: "მაღალი", C2: "სრულყოფილი" },
    chooseMode: "აირჩიეთ რეჟიმი", vocab: "ლექსიკა", vocabDesc: "გამოიცანი ესპანური სიტყვა",
    conjugation: "ზმნის უღლება", conjugationDesc: "აირჩიე ზმნის სწორი ფორმა",
    question: (n) => `კითხვა ${n}/15`, correct: "სწორია!", wrong: "სცადე თავიდან",
    congratsHigh: () => "შენ საუკეთესო ხარ!", congratsMid: () => "არაუშავს, არ დაგავიწყდეს ვარჯიში", congratsLow: () => "შემდეგ ჯერზე უკეთესი გამოვა",
    perfect: "იდეალური თამაში, არც ერთი შეცდომა",
    mistakesLabel: "შეცდომები", playAgain: "ისევ ითამაშე", changeMode: "რეჟიმის შეცვლა", changeLang: "ენის შეცვლა", changeLevel: "დონის შეცვლა",
    statsTitle: "სტატისტიკა", levelLabel: "დონე", statGames: "თამაშები", statWins: "გამარჯვებები",
    statCorrect: "სწორი პასუხები", statIncorrect: "არასწორი პასუხები", statPercent: "სიზუსტე",
    statXp: "სულ XP", statCoins: "მიღებული მონეტები", coinsLabel: "მონეტა",
    thematic: "თემატიკა", thematicDesc: "ივარჯიშე თემით", chooseCategory: "აირჩიეთ თემა", srsDue: "გასამეორებელი",
    listen: "მოსმენა", levelUp: (n) => `ახალი დონე! შენ ახლა ხარ Lv.${n}`,
    grammarCta: "გინდა ნამდვილი გამოცდა? სცადე გრამატიკის ტესტი",
    grammarTitle: "გრამატიკის გამოცდა",
    grammarDesc: "40 არჩევითი კითხვა თითო დონეზე, საუნივერსიტეტო გამოცდის სტილში. მინიშნებების გარეშე ტესტის დროს — შესწორება და ახსნა ბოლოს.",
    grammarChooseLevel: "აირჩიე შენი დონე",
    grammarRecent: "ბოლო მცდელობები",
    grammarQuestionOf: (n, total) => `კითხვა ${n}/${total}`,
    grammarPrev: "უკან", grammarNext: "შემდეგი",
    grammarRemaining: (n) => `დარჩა ${n}`, grammarFinish: "გამოცდის დასრულება",
    grammarResult: "შედეგი", grammarByTopic: "თემების მიხედვით", grammarReview: "შესწორება",
    grammarYourAnswer: "შენი პასუხი:", grammarCorrectAnswer: "სწორია:",
    grammarRepeat: "გამეორება", grammarLevels: "დონეები",
    gradeOutstanding: "შესანიშნავი", gradeGood: "კარგი", gradePass: "ჩაბარებული", gradeFail: "ჩაჭრილი",
    statStreak: "მიმდინარე სერია", statLongestStreak: "ყველაზე გრძელი სერია",
    conjTablesCta: "უღვლილების ცხრილები", conjTablesTitle: "უღვლილების ცხრილები", conjNoForm: "— (ფორმა არ არსებობს)",
    conjTablesDesc: "სრული ზმნის ცხრილები დროის მიხედვით",
    learningCta: "სწავლა", learningDesc: "საცნობარო ცხრილები და სასწავლო მასალები",
    genderTitle: "თქვენი სქესი",
    genderMale: "მამრობითი", genderFemale: "მდედრობითი", genderSkip: "არ მსურს მითითება",
    freezesTitle: "სერიის გაყინვები", freezesDesc: "ავტომატურად იცავს შენს სერიას, თუ დღეს გამოტოვებ",
    buyFreeze: (cost) => `ყიდვა ${cost} მონეტად`, freezesFull: "მაქსიმუმი მიღწეულია",
    byLevelTitle: "დონეების მიხედვით", byModeTitle: "რეჟიმების მიხედვით", noGamesYet: "ჯერ არ ითამაშე",
    categories: { food: "საკვები", travel: "მოგზაურობა", work: "სამუშაო", family: "ოჯახი", shopping: "შოპინგი", medicine: "მედიცინა", transport: "ტრანსპორტი", education: "განათლება", sports: "სპორტი" },
  },
  fr: {
    chooseLevel: "Choisissez votre niveau",
    levels: { A1: "Débutant", A2: "Élémentaire", B1: "Intermédiaire", B2: "Intermédiaire avancé", C1: "Avancé", C2: "Maîtrise" },
    chooseMode: "Choisissez un mode", vocab: "Vocabulaire", vocabDesc: "Devine le mot espagnol",
    conjugation: "Conjugaison", conjugationDesc: "Choisis la bonne forme du verbe",
    question: (n) => `Question ${n} sur 15`, correct: "Correct !", wrong: "Réessaie",
    congratsHigh: (g) => (g === "f" ? "Tu es la meilleure !" : g === "m" ? "Tu es le meilleur !" : "C'est le meilleur résultat !"), congratsMid: () => "Pas mal, continue à t'entraîner", congratsLow: () => "La prochaine fois sera meilleure",
    perfect: "Sans faute",
    mistakesLabel: "Erreurs", playAgain: "Rejouer", changeMode: "Changer de mode", changeLang: "Changer de langue", changeLevel: "Changer de niveau",
    statsTitle: "Statistiques", levelLabel: "Niveau", statGames: "Parties jouées", statWins: "Victoires",
    statCorrect: "Bonnes réponses", statIncorrect: "Réponses incorrectes", statPercent: "Précision",
    statXp: "XP total", statCoins: "Pièces gagnées", coinsLabel: "pièces",
    thematic: "Thématique", thematicDesc: "S'entraîner par thème", chooseCategory: "Choisis un thème", srsDue: "À réviser",
    listen: "Écouter", levelUp: (n) => `Niveau supérieur ! Tu es maintenant Lv.${n}`,
    grammarCta: "Tu préfères un vrai examen ? Essaie l'examen de grammaire",
    grammarTitle: "Examen de grammaire",
    grammarDesc: "40 questions à choix multiple par niveau, façon examen universitaire. Aucun indice pendant le test — corrections et explications à la fin.",
    grammarChooseLevel: "Choisis ton niveau",
    grammarRecent: "Tentatives récentes",
    grammarQuestionOf: (n, total) => `Question ${n} sur ${total}`,
    grammarPrev: "Précédent", grammarNext: "Suivant",
    grammarRemaining: (n) => `${n} restantes`, grammarFinish: "Terminer l'examen",
    grammarResult: "Résultat", grammarByTopic: "Par thème", grammarReview: "Corrigé",
    grammarYourAnswer: "Ta réponse :", grammarCorrectAnswer: "Correct :",
    grammarRepeat: "Recommencer", grammarLevels: "Niveaux",
    gradeOutstanding: "Excellent", gradeGood: "Bien", gradePass: "Admis", gradeFail: "Échec",
    statStreak: "Série actuelle", statLongestStreak: "Meilleure série",
    conjTablesCta: "Tableaux de conjugaison", conjTablesTitle: "Tableaux de conjugaison", conjNoForm: "— (pas de forme)",
    conjTablesDesc: "Consulte les tableaux complets par temps",
    learningCta: "Apprentissage", learningDesc: "Tableaux de référence et outils d'étude",
    genderTitle: "Votre genre",
    genderMale: "Homme", genderFemale: "Femme", genderSkip: "Préfère ne pas dire",
    freezesTitle: "Gels de série", freezesDesc: "Sauve automatiquement ta série si tu rates un jour",
    buyFreeze: (cost) => `Acheter pour ${cost} pièces`, freezesFull: "Maximum atteint",
    byLevelTitle: "Par niveau", byModeTitle: "Par mode", noGamesYet: "Pas encore joué",
    categories: { food: "Nourriture", travel: "Voyage", work: "Travail", family: "Famille", shopping: "Achats", medicine: "Médecine", transport: "Transport", education: "Éducation", sports: "Sport" },
  },
};

/* ---------------------------------------------------------------
   PROGRESS: XP, coins, level, persisted via window.storage
------------------------------------------------------------------*/
const XP_PER_CORRECT = 10;
const XP_PER_WIN = 150;
const COINS_PER_CORRECT = 2;
const COINS_PER_WIN = 25;
const COINS_PERFECT_BONUS = 15;
const STATS_KEY = "spanish-quiz-stats";
const ZERO_BREAKDOWN_STATS = { gamesPlayed: 0, wins: 0, correct: 0, incorrect: 0 };
const DEFAULT_STATS = {
  gamesPlayed: 0,
  wins: 0,
  correct: 0,
  incorrect: 0,
  totalXp: 0,
  coins: 0,
  // Daily streak: consecutive calendar days with at least one finished session.
  // Freezes are bought with coins and auto-spend to bridge exactly one missed
  // day each, so a single bad day doesn't wipe out the streak.
  streak: 0,
  longestStreak: 0,
  lastPlayedDate: null, // "YYYY-MM-DD" in the player's local time
  streakFreezes: 0,
  // Breakdown so the stats screen can show progress per CEFR level (vocab +
  // conjugation, both level-scoped) and per game mode. Thematic sessions
  // aren't scoped to one level, so they only count toward byMode.
  byLevel: Object.fromEntries(CEFR_LEVELS.map((lv) => [lv, { ...ZERO_BREAKDOWN_STATS }])),
  byMode: { vocab: { ...ZERO_BREAKDOWN_STATS }, conjugation: { ...ZERO_BREAKDOWN_STATS }, thematic: { ...ZERO_BREAKDOWN_STATS } },
};
const STREAK_FREEZE_COST = 60;
const STREAK_FREEZE_MAX = 2;

// Returns today's date as "YYYY-MM-DD" in the player's local timezone.
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Pure function: given the current stats, returns the updated streak fields
// for "today". Idempotent within a single day (playing 3 games today only
// counts once). Missed days are bridged automatically using freezes, one
// freeze per missed day; if there aren't enough freezes, the streak resets.
function computeStreakUpdate(stats) {
  const today = todayStr();
  if (stats.lastPlayedDate === today) {
    return { streak: stats.streak, longestStreak: stats.longestStreak, lastPlayedDate: today, streakFreezes: stats.streakFreezes };
  }
  if (!stats.lastPlayedDate) {
    return { streak: 1, longestStreak: Math.max(1, stats.longestStreak || 0), lastPlayedDate: today, streakFreezes: stats.streakFreezes || 0 };
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const last = new Date(stats.lastPlayedDate + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  const dayGap = Math.round((now - last) / msPerDay);
  const missedDays = dayGap - 1; // full inactive days strictly between last play and today

  if (missedDays <= 0) {
    // Consecutive day.
    const streak = (stats.streak || 0) + 1;
    return { streak, longestStreak: Math.max(streak, stats.longestStreak || 0), lastPlayedDate: today, streakFreezes: stats.streakFreezes || 0 };
  }
  if ((stats.streakFreezes || 0) >= missedDays) {
    // Freezes cover every missed day; streak survives.
    const streak = (stats.streak || 0) + 1;
    return {
      streak,
      longestStreak: Math.max(streak, stats.longestStreak || 0),
      lastPlayedDate: today,
      streakFreezes: (stats.streakFreezes || 0) - missedDays,
    };
  }
  // Not enough freezes: streak resets, freezes are left untouched.
  return { streak: 1, longestStreak: stats.longestStreak || 0, lastPlayedDate: today, streakFreezes: stats.streakFreezes || 0 };
}

// Triangular XP curve: level L requires 100 * L*(L-1)/2 total XP to reach.
function xpForLevel(level) {
  return Math.round((100 * (level - 1) * level) / 2);
}
function levelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

async function loadStats() {
  try {
    const res = await storage.get(STATS_KEY);
    return res ? { ...DEFAULT_STATS, ...JSON.parse(res.value) } : DEFAULT_STATS;
  } catch {
    return DEFAULT_STATS;
  }
}

async function saveStats(stats) {
  try {
    await storage.set(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error("stats save failed", e);
  }
}

/* ---------------------------------------------------------------
   ADAPTIVE REPETITION (SRS)
   Missed items are keyed by their Spanish word/sentence and marked
   "due" a couple of games later, so they resurface automatically.
------------------------------------------------------------------*/
const SRS_KEY = "spanish-quiz-srs";
// Games-until-next-review, indexed by consecutive clean passes ("reps").
// A miss always resets reps to 0, so the item comes back at the short
// interval again. Enough clean passes in a row "graduates" the item
// (it's removed from the queue entirely) instead of growing forever.
const SRS_INTERVALS = [2, 4, 8, 16, 30];

async function loadSrs() {
  try {
    const res = await storage.get(SRS_KEY);
    return res ? JSON.parse(res.value) : {};
  } catch {
    return {};
  }
}

async function saveSrs(srs) {
  try {
    await storage.set(SRS_KEY, JSON.stringify(srs));
  } catch (e) {
    console.error("srs save failed", e);
  }
}

// Puts any "due" items first, then fills the rest randomly, capped at 15.
function buildSessionPool(basePool, itemKeyFn, srs, gamesPlayed) {
  const dueKeys = new Set(
    Object.entries(srs)
      .filter(([, v]) => v.dueAtGame <= gamesPlayed)
      .map(([k]) => k)
  );
  const due = basePool.filter((item) => dueKeys.has(itemKeyFn(item)));
  const rest = basePool.filter((item) => !dueKeys.has(itemKeyFn(item)));
  return [...shuffle(due), ...shuffle(rest)].slice(0, 15);
}

/* ---------------------------------------------------------------
   HELPERS
------------------------------------------------------------------*/
// Turns a "#RRGGBB" accent color into an "rgba(r, g, b, alpha)" string,
// used to build the level/category-tinted glow on the stage card.
function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Full conjugation-table data: 11 tenses x 3 model verbs (hablar/comer/vivir —
// all fully regular, chosen deliberately so root+ending concatenation is
// always correct). "kind" controls how a tense renders:
//  - "simple": one word, root + colored ending (e.g. habl+o)
//  - "compound": two words, conjugated haber (colored) + fixed participle
//  - "imperative": 5 forms only, no "yo" (shown as "—")
const PRONOUNS = ["yo", "tú", "él/ella/usted", "nosotros", "vosotros", "ellos/ellas/ustedes"];
const CONJ_VERB_COLORS = { "-AR": "#E8B23D", "-ER": "#3FB68A", "-IR": "#7DD3FC" };

function simpleVerbs(roots, endingsByType) {
  return [
    { infinitive: roots.ar + "ar", type: "-AR", root: roots.ar, endings: endingsByType.ar, color: CONJ_VERB_COLORS["-AR"] },
    { infinitive: roots.er + "er", type: "-ER", root: roots.er, endings: endingsByType.er, color: CONJ_VERB_COLORS["-ER"] },
    { infinitive: roots.ir + "ir", type: "-IR", root: roots.ir, endings: endingsByType.ir, color: CONJ_VERB_COLORS["-IR"] },
  ];
}

const CONJ_TABLE_DATA = [
  {
    tense: "presente", label: "Presente de indicativo", kind: "simple",
    verbs: simpleVerbs({ ar: "habl", er: "com", ir: "viv" }, {
      ar: ["o", "as", "a", "amos", "áis", "an"],
      er: ["o", "es", "e", "emos", "éis", "en"],
      ir: ["o", "es", "e", "imos", "ís", "en"],
    }),
  },
  {
    tense: "preterito", label: "Pretérito indefinido", kind: "simple",
    verbs: simpleVerbs({ ar: "habl", er: "com", ir: "viv" }, {
      ar: ["é", "aste", "ó", "amos", "asteis", "aron"],
      er: ["í", "iste", "ió", "imos", "isteis", "ieron"],
      ir: ["í", "iste", "ió", "imos", "isteis", "ieron"],
    }),
  },
  {
    tense: "imperfecto", label: "Pretérito imperfecto", kind: "simple",
    verbs: simpleVerbs({ ar: "habl", er: "com", ir: "viv" }, {
      ar: ["aba", "abas", "aba", "ábamos", "abais", "aban"],
      er: ["ía", "ías", "ía", "íamos", "íais", "ían"],
      ir: ["ía", "ías", "ía", "íamos", "íais", "ían"],
    }),
  },
  {
    tense: "perfecto", label: "Pretérito perfecto", kind: "compound",
    verbs: [
      { infinitive: "hablar", type: "-AR", aux: ["he", "has", "ha", "hemos", "habéis", "han"], participle: "hablado", color: CONJ_VERB_COLORS["-AR"] },
      { infinitive: "comer", type: "-ER", aux: ["he", "has", "ha", "hemos", "habéis", "han"], participle: "comido", color: CONJ_VERB_COLORS["-ER"] },
      { infinitive: "vivir", type: "-IR", aux: ["he", "has", "ha", "hemos", "habéis", "han"], participle: "vivido", color: CONJ_VERB_COLORS["-IR"] },
    ],
  },
  {
    tense: "futuro", label: "Futuro simple", kind: "simple",
    verbs: simpleVerbs({ ar: "hablar", er: "comer", ir: "vivir" }, {
      ar: ["é", "ás", "á", "emos", "éis", "án"],
      er: ["é", "ás", "á", "emos", "éis", "án"],
      ir: ["é", "ás", "á", "emos", "éis", "án"],
    }),
  },
  {
    tense: "condicional", label: "Condicional simple", kind: "simple",
    verbs: simpleVerbs({ ar: "hablar", er: "comer", ir: "vivir" }, {
      ar: ["ía", "ías", "ía", "íamos", "íais", "ían"],
      er: ["ía", "ías", "ía", "íamos", "íais", "ían"],
      ir: ["ía", "ías", "ía", "íamos", "íais", "ían"],
    }),
  },
  {
    tense: "subjuntivo", label: "Presente de subjuntivo", kind: "simple",
    verbs: simpleVerbs({ ar: "habl", er: "com", ir: "viv" }, {
      ar: ["e", "es", "e", "emos", "éis", "en"],
      er: ["a", "as", "a", "amos", "áis", "an"],
      ir: ["a", "as", "a", "amos", "áis", "an"],
    }),
  },
  {
    tense: "pluscuamperfecto", label: "Pretérito pluscuamperfecto", kind: "compound",
    verbs: [
      { infinitive: "hablar", type: "-AR", aux: ["había", "habías", "había", "habíamos", "habíais", "habían"], participle: "hablado", color: CONJ_VERB_COLORS["-AR"] },
      { infinitive: "comer", type: "-ER", aux: ["había", "habías", "había", "habíamos", "habíais", "habían"], participle: "comido", color: CONJ_VERB_COLORS["-ER"] },
      { infinitive: "vivir", type: "-IR", aux: ["había", "habías", "había", "habíamos", "habíais", "habían"], participle: "vivido", color: CONJ_VERB_COLORS["-IR"] },
    ],
  },
  {
    tense: "imperativo", label: "Imperativo afirmativo", kind: "imperative",
    verbs: [
      { infinitive: "hablar", type: "-AR", forms: [null, "habla", "hable", "hablemos", "hablad", "hablen"], color: CONJ_VERB_COLORS["-AR"] },
      { infinitive: "comer", type: "-ER", forms: [null, "come", "coma", "comamos", "comed", "coman"], color: CONJ_VERB_COLORS["-ER"] },
      { infinitive: "vivir", type: "-IR", forms: [null, "vive", "viva", "vivamos", "vivid", "vivan"], color: CONJ_VERB_COLORS["-IR"] },
    ],
  },
  {
    tense: "subjuntivo_imperfecto", label: "Pretérito imperfecto de subjuntivo", kind: "simple",
    verbs: simpleVerbs({ ar: "habl", er: "com", ir: "viv" }, {
      ar: ["ara", "aras", "ara", "áramos", "arais", "aran"],
      er: ["iera", "ieras", "iera", "iéramos", "ierais", "ieran"],
      ir: ["iera", "ieras", "iera", "iéramos", "ierais", "ieran"],
    }),
  },
  {
    tense: "condicional_perfecto", label: "Condicional compuesto", kind: "compound",
    verbs: [
      { infinitive: "hablar", type: "-AR", aux: ["habría", "habrías", "habría", "habríamos", "habríais", "habrían"], participle: "hablado", color: CONJ_VERB_COLORS["-AR"] },
      { infinitive: "comer", type: "-ER", aux: ["habría", "habrías", "habría", "habríamos", "habríais", "habrían"], participle: "comido", color: CONJ_VERB_COLORS["-ER"] },
      { infinitive: "vivir", type: "-IR", aux: ["habría", "habrías", "habría", "habríamos", "habríais", "habrían"], participle: "vivido", color: CONJ_VERB_COLORS["-IR"] },
    ],
  },
];


function fmtGrammarTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Vocab / thematic mode: prompt = word in the user's native language, options = 4 Spanish words.
// filterFn decides which other bank words are eligible distractors (same level, or same category).
function buildVocabQuestion(word, lang, usedTexts, filterFn) {
  const promptText = word[lang];
  const correctEs = word.es;
  const pool = VOCAB_BANK.filter((w) => w.es !== word.es && filterFn(w));
  const unused = pool.filter((w) => !usedTexts.has(w.es));
  const source = unused.length >= 3 ? unused : pool;
  const distractors = shuffle(source).slice(0, 3).map((w) => w.es);
  usedTexts.add(correctEs);
  distractors.forEach((d) => usedTexts.add(d));
  const options = shuffle([
    { text: correctEs, correct: true },
    ...distractors.map((d) => ({ text: d, correct: false })),
  ]);
  return { prompt: promptText, options };
}

function buildConjQuestion(item) {
  const options = shuffle(item.options.map((o) => ({ text: o, correct: o === item.correct })));
  return { prompt: item.sentence, options };
}

// Speaks Spanish text aloud using the browser's built-in speech engine.
// Free, no API key, works offline once a Spanish voice is installed.
// Silently does nothing on browsers without speechSynthesis support.
function speakSpanish(text) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel(); // stop anything already playing
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-ES";
  utterance.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const esVoice = voices.find((v) => v.lang?.startsWith("es"));
  if (esVoice) utterance.voice = esVoice;
  window.speechSynthesis.speak(utterance);
}

function makeConfettiPieces(count, accent) {
  const colors = [COLORS.gold, accent || "#F4CD6A", COLORS.cream, COLORS.green];
  return Array.from({ length: count }).map((_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 170;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance - 90;
    return {
      id: i,
      color: colors[i % colors.length],
      delay: Math.random() * 0.2,
      duration: 1.5 + Math.random() * 0.7,
      tx: `${tx}px`,
      ty: `${ty}px`,
      rot: `${Math.floor(Math.random() * 600 - 300)}deg`,
      w: 5 + Math.random() * 5,
      h: 9 + Math.random() * 7,
    };
  });
}

// One-shot burst — generated once per mount, never loops.
function Confetti({ accent }) {
  const pieces = useMemo(() => makeConfettiPieces(46, accent), [accent]);
  return (
    <div className="pointer-events-none absolute left-1/2 top-20 h-0 w-0">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            backgroundColor: p.color,
            width: `${p.w}px`,
            height: `${p.h}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--tx": p.tx,
            "--ty": p.ty,
            "--rot": p.rot,
          }}
        />
      ))}
    </div>
  );
}

function ProgressLadder({ total, current, color = COLORS.gold }) {
  return (
    <div className="flex w-full gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 flex-1 rounded-full"
          style={{ backgroundColor: i <= current ? color : COLORS.panelBorder }}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------------------*/
export default function SpanishMillionaireQuiz() {
  const [screen, setScreen] = useState("language"); // language | gender | level | grammar | learningHub | conjTables | mode | category | playing | congrats | stats
  const [lang, setLang] = useState("en");
  const [gender, setGender] = useState(null); // "m" | "f" | null (prefer not to say) — used to pick correctly gendered phrasing where the language grammar requires it
  const [level, setLevel] = useState("A1");
  const [mode, setMode] = useState("vocab"); // vocab | conjugation | thematic
  const [category, setCategory] = useState("food");
  const [sessionItems, setSessionItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [wrongIdx, setWrongIdx] = useState([]);
  const [correctIdx, setCorrectIdx] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  const usedTextsRef = useRef(new Set());

  const [stats, setStats] = useState(DEFAULT_STATS);
  const [statsReady, setStatsReady] = useState(false);
  const [sessionReward, setSessionReward] = useState({ xp: 0, coins: 0 });
  const [levelUpTo, setLevelUpTo] = useState(null);
  const [sessionCoinDelta, setSessionCoinDelta] = useState(0);

  // Grammar exam state — deliberately separate from regular practice state:
  // you pick the level yourself, can navigate freely between questions, and
  // only get graded when you submit (no immediate right/wrong feedback, no
  // XP/coins/SRS involvement — this is a self-assessment, not a game round).
  const [grammarScreen, setGrammarScreen] = useState("intro"); // intro | exam | result
  const [conjTableTense, setConjTableTense] = useState(null); // null = tense picker, else a tense key
  const [grammarLevel, setGrammarLevel] = useState("A1");
  const [grammarQuestions, setGrammarQuestions] = useState([]);
  const [grammarAnswers, setGrammarAnswers] = useState([]);
  const [grammarIndex, setGrammarIndex] = useState(0);
  const [grammarSeconds, setGrammarSeconds] = useState(0);
  const [grammarHistory, setGrammarHistory] = useState([]);

  const [srs, setSrs] = useState({});
  const [srsReady, setSrsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadStats().then((s) => {
      if (mounted) {
        setStats(s);
        setStatsReady(true);
      }
    });
    loadSrs().then((s) => {
      if (mounted) {
        setSrs(s);
        setSrsReady(true);
      }
    });
    loadGrammarHistory().then((h) => {
      if (mounted) setGrammarHistory(h);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (grammarScreen !== "exam") return;
    const id = setInterval(() => setGrammarSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [grammarScreen]);

  function updateStats(updater) {
    setStats((prev) => {
      const next = updater(prev);
      saveStats(next);
      return next;
    });
  }

  function updateSrs(updater) {
    setSrs((prev) => {
      const next = updater(prev);
      saveSrs(next);
      return next;
    });
  }

  const langMeta = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  const t = UI[lang];
  const dir = langMeta.dir;

  // Returns the filter used to pick eligible distractors / pool items for a mode.
  function filterFor(selectedMode) {
    if (selectedMode === "thematic") return (w) => w.category === category;
    return (w) => w.level === level;
  }
  function itemKeyFor(selectedMode, item) {
    return selectedMode === "conjugation" ? item.sentence : item.es;
  }

  // The color that identifies the current session: category color in
  // thematic mode, level color otherwise (vocab/conjugation are both
  // scoped by CEFR level).
  function sessionAccent() {
    if (mode === "thematic") {
      const cat = CATEGORIES.find((c) => c.id === category);
      return cat ? cat.color : COLORS.gold;
    }
    return LEVEL_COLORS[level] || COLORS.gold;
  }

  function selectGender(g) {
    setGender(g);
    setScreen("level");
  }

  function selectLanguage(code) {
    setLang(code);
    setScreen("gender");
  }

  function selectLevel(lv) {
    setLevel(lv);
    setScreen("mode");
  }

  function buyStreakFreeze() {
    updateStats((prev) => {
      if (prev.coins < STREAK_FREEZE_COST || (prev.streakFreezes || 0) >= STREAK_FREEZE_MAX) return prev;
      return { ...prev, coins: prev.coins - STREAK_FREEZE_COST, streakFreezes: (prev.streakFreezes || 0) + 1 };
    });
  }

  function enterConjTables() {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setConjTableTense(null);
    setScreen("conjTables");
  }

  function enterLearningHub() {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setScreen("learningHub");
  }

  function enterGrammarSection() {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setGrammarScreen("intro");
    setScreen("grammar");
  }

  function startGrammarExam(lv) {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const picked = pickGrammarQuestions(lv, 40).map((qq) => {
      const { options, correct } = shuffleGrammarOptions(qq);
      return { ...qq, shuffledOptions: options, shuffledCorrect: correct };
    });
    setGrammarLevel(lv);
    setGrammarQuestions(picked);
    setGrammarAnswers(new Array(picked.length).fill(null));
    setGrammarIndex(0);
    setGrammarSeconds(0);
    setGrammarScreen("exam");
    setScreen("grammar");
  }

  function chooseGrammarAnswer(optionIdx) {
    setGrammarAnswers((prev) => prev.map((a, i) => (i === grammarIndex ? optionIdx : a)));
  }

  function finishGrammarExam() {
    const score = grammarQuestions.reduce(
      (acc, qq, i) => acc + (grammarAnswers[i] === qq.shuffledCorrect ? 1 : 0),
      0
    );
    const attempt = {
      level: grammarLevel,
      score,
      total: grammarQuestions.length,
      date: new Date().toISOString(),
      seconds: grammarSeconds,
    };
    const next = [attempt, ...grammarHistory].slice(0, 12);
    setGrammarHistory(next);
    saveGrammarHistory(next);
    if (statsReady) {
      updateStats((prev) => ({ ...prev, ...computeStreakUpdate(prev) }));
    }
    setGrammarScreen("result");
  }

  function selectCategory(cat) {
    setCategory(cat);
    startGame("thematic", cat);
  }

  function startGame(selectedMode, selectedCategory) {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const cat = selectedCategory || category;
    let basePool;
    if (selectedMode === "vocab") {
      basePool = VOCAB_BANK.filter((w) => w.level === level);
    } else if (selectedMode === "thematic") {
      basePool = VOCAB_BANK.filter((w) => w.category === cat);
    } else {
      const tiers = levelToConjTiers(level);
      basePool = CONJ_BANK.filter((c) => tiers.includes(c.tense));
    }
    const keyFn = (item) => itemKeyFor(selectedMode, item);
    const items = srsReady ? buildSessionPool(basePool, keyFn, srs, stats.gamesPlayed) : shuffle(basePool).slice(0, 15);
    usedTextsRef.current = new Set();
    setMode(selectedMode);
    setSessionItems(items);
    setIndex(0);
    setMistakes(0);
    setWrongIdx([]);
    setCorrectIdx(null);
    setLevelUpTo(null);
    setSessionCoinDelta(0);
    const filterFn = selectedMode === "thematic" ? (w) => w.category === cat : (w) => w.level === level;
    const q =
      selectedMode === "conjugation"
        ? buildConjQuestion(items[0])
        : buildVocabQuestion(items[0], lang, usedTextsRef.current, filterFn);
    setQuestion(q);
    setScreen("playing");
    if (statsReady) {
      updateStats((prev) => ({
        ...prev,
        gamesPlayed: prev.gamesPlayed + 1,
        byMode: {
          ...prev.byMode,
          [selectedMode]: { ...prev.byMode[selectedMode], gamesPlayed: prev.byMode[selectedMode].gamesPlayed + 1 },
        },
        byLevel:
          selectedMode === "thematic"
            ? prev.byLevel
            : { ...prev.byLevel, [level]: { ...prev.byLevel[level], gamesPlayed: prev.byLevel[level].gamesPlayed + 1 } },
      }));
    }
  }

  function handleAnswer(i, e) {
    if (correctIdx !== null || wrongIdx.includes(i)) return;
    e?.currentTarget?.blur();
    const currentKey = sessionItems[index] ? itemKeyFor(mode, sessionItems[index]) : null;
    if (question.options[i].correct) {
      setCorrectIdx(i);
      if (statsReady) {
        updateStats((prev) => ({ ...prev, coins: prev.coins + COINS_PER_CORRECT }));
      }
      setSessionCoinDelta((d) => d + COINS_PER_CORRECT);
      // Clean pass (no wrong clicks this round) on a previously-due item: push its next
      // review further out. Enough clean passes in a row graduates it out of the queue.
      if (srsReady && wrongIdx.length === 0 && currentKey && srs[currentKey]) {
        updateSrs((prev) => {
          const entry = prev[currentKey];
          const reps = (entry.reps || 0) + 1;
          const next = { ...prev };
          if (reps >= SRS_INTERVALS.length) {
            delete next[currentKey];
          } else {
            next[currentKey] = { ...entry, reps, dueAtGame: stats.gamesPlayed + SRS_INTERVALS[reps] };
          }
          return next;
        });
      }
      setTimeout(() => {
        const ni = index + 1;
        if (ni >= sessionItems.length) {
          const earnedXp = sessionItems.length * XP_PER_CORRECT + XP_PER_WIN;
          const sessionBonus = COINS_PER_WIN + (mistakes === 0 ? COINS_PERFECT_BONUS : 0);
          const earnedCoins = sessionCoinDelta + COINS_PER_CORRECT + sessionBonus;
          setSessionReward({ xp: earnedXp, coins: earnedCoins });
          const prevLevel = levelFromXp(stats.totalXp);
          const newLevel = levelFromXp(stats.totalXp + earnedXp);
          setLevelUpTo(newLevel > prevLevel ? newLevel : null);
          if (statsReady) {
            updateStats((prev) => {
              const modeStats = prev.byMode[mode];
              const nextModeStats = {
                ...modeStats,
                wins: modeStats.wins + 1,
                correct: modeStats.correct + sessionItems.length,
                incorrect: modeStats.incorrect + mistakes,
              };
              const levelStats = prev.byLevel[level];
              const nextLevelStats = {
                ...levelStats,
                wins: levelStats.wins + 1,
                correct: levelStats.correct + sessionItems.length,
                incorrect: levelStats.incorrect + mistakes,
              };
              const streakUpdate = computeStreakUpdate(prev);
              return {
                ...prev,
                wins: prev.wins + 1,
                correct: prev.correct + sessionItems.length,
                incorrect: prev.incorrect + mistakes,
                totalXp: prev.totalXp + earnedXp,
                coins: prev.coins + sessionBonus,
                byMode: { ...prev.byMode, [mode]: nextModeStats },
                byLevel: mode === "thematic" ? prev.byLevel : { ...prev.byLevel, [level]: nextLevelStats },
                ...streakUpdate,
              };
            });
          }
          setScreen("congrats");
        } else {
          const filterFn = filterFor(mode);
          const q =
            mode === "conjugation"
              ? buildConjQuestion(sessionItems[ni])
              : buildVocabQuestion(sessionItems[ni], lang, usedTextsRef.current, filterFn);
          setIndex(ni);
          setQuestion(q);
          setWrongIdx([]);
          setCorrectIdx(null);
        }
      }, 650);
    } else {
      setWrongIdx((prev) => [...prev, i]);
      setMistakes((m) => m + 1);
      if (statsReady) {
        updateStats((prev) => ({ ...prev, coins: Math.max(0, prev.coins - COINS_PER_CORRECT) }));
      }
      setSessionCoinDelta((d) => d - COINS_PER_CORRECT);
      if (srsReady && currentKey) {
        updateSrs((prev) => ({
          ...prev,
          [currentKey]: {
            misses: (prev[currentKey]?.misses || 0) + 1,
            reps: 0,
            dueAtGame: stats.gamesPlayed + SRS_INTERVALS[0],
          },
        }));
      }
    }
  }

  function replay() {
    if (mode === "thematic") {
      startGame("thematic", category);
    } else {
      startGame(mode);
    }
  }

  /* ---------------- SCREENS ---------------- */

  function renderLearningHubScreen() {
    return (
      <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-5 py-8">
        <button
          onClick={() => setScreen("mode")}
          className="ghost-btn mb-6 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          <ArrowLeft size={14} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
        </button>
        <h1 className="marquee mb-8 text-2xl" style={{ color: COLORS.gold }}>
          {t.learningCta}
        </h1>
        <div className="space-y-3">
          {/* More study tools land here over time — this is a menu, not a single screen. */}
          <button
            onClick={enterConjTables}
            className="stage-btn flex w-full items-center justify-between rounded-xl px-5 py-5 text-left"
          >
            <span>
              <span className="flex items-center gap-3 text-lg font-bold">
                <Table2 size={22} style={{ color: "#7DD3FC" }} />
                {t.conjTablesCta}
              </span>
              <span className="mt-1 block text-sm" style={{ color: COLORS.muted }}>
                {t.conjTablesDesc}
              </span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  function renderConjTablesScreen() {
    if (!conjTableTense) {
      const tenses = levelToConjTiers(level);
      const tables = CONJ_TABLE_DATA.filter((t2) => tenses.includes(t2.tense));
      return (
        <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-5 py-8">
          <button
            onClick={() => setScreen("learningHub")}
            className="ghost-btn mb-6 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <ArrowLeft size={14} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
          </button>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
            {level}
          </p>
          <h1 className="marquee mb-6 mt-1 text-2xl" style={{ color: "#7DD3FC" }}>
            {t.conjTablesTitle}
          </h1>
          <div className="space-y-3">
            {tables.map((tb) => (
              <button
                key={tb.tense}
                onClick={() => setConjTableTense(tb.tense)}
                className="option-btn flex w-full items-center justify-between rounded-xl px-5 py-4 text-left"
              >
                <span className="text-base font-medium" style={{ color: COLORS.cream }}>
                  {tb.label}
                </span>
                <ArrowRight size={16} style={{ color: COLORS.muted, transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
              </button>
            ))}
          </div>
        </div>
      );
    }

    const table = CONJ_TABLE_DATA.find((tb) => tb.tense === conjTableTense);
    if (!table) return null;
    return (
      <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-5 py-8">
        <button
          onClick={() => setConjTableTense(null)}
          className="ghost-btn mb-6 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          <ArrowLeft size={14} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
        </button>
        <h1 className="marquee mb-8 text-2xl" style={{ color: "#7DD3FC" }}>
          {table.label}
        </h1>

        <div className="space-y-6">
          {table.verbs.map((v) => (
            <div key={v.infinitive} className="stage-card rounded-2xl px-5 py-5">
              <div className="mb-4 flex items-baseline justify-between">
                <span className="text-lg font-bold" style={{ color: COLORS.cream }}>
                  {v.infinitive}
                </span>
                <span
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{ border: `2px solid ${v.color}66`, color: v.color }}
                >
                  {v.type}
                </span>
              </div>

              <div className="space-y-2">
                {PRONOUNS.map((pronoun, i) => (
                  <div key={pronoun} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs" style={{ color: COLORS.muted }}>
                      {pronoun}
                    </span>
                    <ArrowRight size={14} style={{ color: v.color, opacity: 0.6, transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
                    {table.kind === "simple" && (
                      <span className="text-base font-bold" style={{ color: COLORS.cream }}>
                        {v.root}
                        <span style={{ color: v.color }}>{v.endings[i]}</span>
                      </span>
                    )}
                    {table.kind === "compound" && (
                      <span className="text-base font-bold" style={{ color: COLORS.cream }}>
                        <span style={{ color: v.color }}>{v.aux[i]}</span> {v.participle}
                      </span>
                    )}
                    {table.kind === "imperative" &&
                      (v.forms[i] === null ? (
                        <span className="text-base" style={{ color: COLORS.muted }}>
                          {t.conjNoForm}
                        </span>
                      ) : (
                        <span className="text-base font-bold" style={{ color: v.color }}>
                          {v.forms[i]}
                        </span>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderLanguageScreen() {
    return (
      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12">
        <h1 className="marquee text-5xl" style={{ color: COLORS.gold, letterSpacing: "0.04em" }}>
          ESPAÑOL
        </h1>
        <p className="mt-2 text-xs uppercase tracking-widest" style={{ color: COLORS.muted }}>
          ¿Quién sabe más?
        </p>
        <p className="mb-4 mt-10 text-sm" style={{ color: COLORS.muted }}>
          Elige tu idioma
        </p>
        <div className="w-full space-y-3">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => selectLanguage(l.code)}
              className="stage-btn w-full rounded-xl py-4 text-lg font-semibold"
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderGenderScreen() {
    return (
      <div dir={dir} lang={lang} className="relative flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12">
        <button
          onClick={() => setScreen("language")}
          className="ghost-btn absolute left-5 top-5 flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          <ArrowLeft size={14} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
        </button>
        <h1 className="marquee mb-8 text-3xl" style={{ color: COLORS.gold }}>
          {t.genderTitle}
        </h1>
        <div className="w-full space-y-3">
          <button
            onClick={() => selectGender("m")}
            className="stage-btn flex w-full items-center justify-center gap-3 rounded-xl py-4 text-lg font-semibold"
          >
            <User size={20} style={{ color: COLORS.gold }} />
            {t.genderMale}
          </button>
          <button
            onClick={() => selectGender("f")}
            className="stage-btn flex w-full items-center justify-center gap-3 rounded-xl py-4 text-lg font-semibold"
          >
            <User size={20} style={{ color: COLORS.green }} />
            {t.genderFemale}
          </button>
          <button
            onClick={() => selectGender(null)}
            className="ghost-btn flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
          >
            <SkipForward size={16} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
            {t.genderSkip}
          </button>
        </div>
      </div>
    );
  }

  function renderLevelScreen() {
    return (
      <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12">
        <button onClick={() => setScreen("language")} className="ghost-btn mb-8 flex items-center gap-2 rounded-full px-4 py-2 text-sm">
          <Globe size={14} />
          {langMeta.name}
        </button>
        <h2 className="mb-8 text-center text-2xl font-bold" style={{ color: COLORS.gold }}>
          {t.chooseLevel}
        </h2>
        <div className="grid w-full grid-cols-2 gap-3">
          {CEFR_LEVELS.map((lv) => {
            const color = LEVEL_COLORS[lv];
            return (
              <button
                key={lv}
                onClick={() => selectLevel(lv)}
                className="stage-btn rounded-xl py-5 text-center"
                style={{ "--accent": color, borderColor: `${color}55` }}
              >
                <span className="marquee block text-3xl" style={{ color }}>
                  {lv}
                </span>
                <span className="mt-1 block text-xs" style={{ color: COLORS.muted }}>
                  {t.levels[lv]}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={enterGrammarSection}
          className="ghost-btn mt-6 rounded-full px-5 py-2 text-center text-xs font-bold"
          style={{ color: COLORS.gold }}
        >
          {t.grammarCta}
        </button>
      </div>
    );
  }

  function renderModeScreen() {
    return (
      <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => setScreen("language")} className="ghost-btn flex items-center gap-2 rounded-full px-3 py-2 text-xs">
            <Globe size={12} />
            {langMeta.name}
          </button>
          <button
            onClick={() => setScreen("level")}
            className="ghost-btn rounded-full px-3 py-2 text-xs font-bold"
            style={{ borderColor: `${LEVEL_COLORS[level]}66`, color: LEVEL_COLORS[level] }}
          >
            {level}
          </button>
          <button onClick={() => setScreen("stats")} className="ghost-btn flex items-center gap-2 rounded-full px-3 py-2 text-xs">
            {stats.streak > 0 && (
              <span className="flex items-center gap-1">
                <Flame size={12} style={{ color: "#F5793A" }} />
                {stats.streak}
              </span>
            )}
            <Coins size={12} style={{ color: COLORS.gold }} />
            {stats.coins} · Lv.{levelFromXp(stats.totalXp)}
          </button>
        </div>
        <h2 className="mb-8 text-center text-2xl font-bold" style={{ color: COLORS.gold }}>
          {t.chooseMode}
        </h2>
        <div className="w-full space-y-4">
          <button onClick={() => startGame("vocab")} className="stage-btn w-full rounded-xl px-5 py-5 text-left">
            <span className="flex items-center gap-3 text-lg font-bold">
              <BookOpen size={22} style={{ color: COLORS.gold }} />
              {t.vocab}
            </span>
            <span className="mt-1 block text-sm" style={{ color: COLORS.muted }}>
              {t.vocabDesc}
            </span>
          </button>
          <button onClick={() => setScreen("category")} className="stage-btn w-full rounded-xl px-5 py-5 text-left">
            <span className="flex items-center gap-3 text-lg font-bold">
              <Sparkles size={22} style={{ color: COLORS.gold }} />
              {t.thematic}
            </span>
            <span className="mt-1 block text-sm" style={{ color: COLORS.muted }}>
              {t.thematicDesc}
            </span>
          </button>
          <button onClick={() => startGame("conjugation")} className="stage-btn w-full rounded-xl px-5 py-5 text-left">
            <span className="flex items-center gap-3 text-lg font-bold">
              <Repeat2 size={22} style={{ color: COLORS.gold }} />
              {t.conjugation}
            </span>
            <span className="mt-1 block text-sm" style={{ color: COLORS.muted }}>
              {t.conjugationDesc}
            </span>
          </button>
          <button onClick={enterLearningHub} className="stage-btn w-full rounded-xl px-5 py-5 text-left">
            <span className="flex items-center gap-3 text-lg font-bold">
              <GraduationCap size={22} style={{ color: COLORS.gold }} />
              {t.learningCta}
            </span>
            <span className="mt-1 block text-sm" style={{ color: COLORS.muted }}>
              {t.learningDesc}
            </span>
          </button>
        </div>
      </div>
    );
  }

  function renderCategoryScreen() {
    return (
      <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12">
        <button onClick={() => setScreen("mode")} className="ghost-btn mb-8 rounded-full p-2" aria-label="back">
          <ArrowLeft size={16} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
        </button>
        <h2 className="mb-8 text-center text-2xl font-bold" style={{ color: COLORS.gold }}>
          {t.chooseCategory}
        </h2>
        <div className="grid w-full grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => selectCategory(c.id)}
                className="stage-btn flex flex-col items-center gap-2 rounded-xl py-5"
                style={{ "--accent": c.color, borderColor: `${c.color}55` }}
              >
                <Icon size={22} style={{ color: c.color }} />
                <span className="text-sm font-semibold">{t.categories[c.id]}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderGrammarScreen() {
    if (grammarScreen === "intro") {
      return (
        <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-5 py-8">
          <button
            onClick={() => setScreen("level")}
            className="ghost-btn mb-6 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <ArrowLeft size={14} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
          </button>
          <div className="flex items-center gap-3">
            <GraduationCap size={26} style={{ color: COLORS.gold }} />
            <h1 className="marquee text-3xl" style={{ color: COLORS.gold }}>
              {t.grammarTitle}
            </h1>
          </div>
          <p className="mt-3 text-sm" style={{ color: COLORS.muted }}>
            {t.grammarDesc}
          </p>

          <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
            {t.grammarChooseLevel}
          </h2>
          <div className="space-y-3">
            {GRAMMAR_LEVELS.map((lv) => (
              <button
                key={lv}
                onClick={() => startGrammarExam(lv)}
                className="option-btn flex w-full items-center gap-4 rounded-xl px-5 py-4 text-left"
              >
                <span className="marquee text-2xl" style={{ color: LEVEL_COLORS[lv] }}>
                  {lv}
                </span>
                <span className="text-sm" style={{ color: COLORS.muted }}>
                  {GRAMMAR_LEVEL_DESC[lv][lang] || GRAMMAR_LEVEL_DESC[lv].en}
                </span>
              </button>
            ))}
          </div>

          {grammarHistory.length > 0 && (
            <div className="mt-9">
              <h2
                className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                style={{ color: COLORS.muted }}
              >
                <ListChecks size={14} />
                {t.grammarRecent}
              </h2>
              <div className="space-y-2">
                {grammarHistory.map((h, i) => {
                  const pct = Math.round((h.score / h.total) * 100);
                  const g = grammarGrade(pct, t);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg px-4 py-3 text-sm"
                      style={{ backgroundColor: COLORS.panel, border: `1px solid ${COLORS.panelBorder}` }}
                    >
                      <span style={{ color: LEVEL_COLORS[h.level], fontWeight: 700 }}>{h.level}</span>
                      <span style={{ color: COLORS.muted }}>{new Date(h.date).toLocaleDateString()}</span>
                      <span style={{ color: g.color, fontWeight: 700 }}>
                        {h.score}/{h.total} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (grammarScreen === "exam" && grammarQuestions.length > 0) {
      const current = grammarQuestions[grammarIndex];
      const answeredCount = grammarAnswers.filter((a) => a !== null).length;
      const accent = LEVEL_COLORS[grammarLevel];
      return (
        <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-5 py-6" style={{ "--accent": accent }}>
          <div className="flex items-center justify-between">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ border: `2px solid ${accent}66`, color: accent }}
            >
              {grammarLevel}
            </span>
            <span className="flex items-center gap-2 text-xs" style={{ color: COLORS.muted }}>
              <Timer size={14} />
              {fmtGrammarTime(grammarSeconds)}
            </span>
          </div>

          <div className="mt-4 flex gap-1">
            {grammarQuestions.map((_, i) => (
              <span
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  backgroundColor:
                    i === grammarIndex ? COLORS.gold : grammarAnswers[i] !== null ? hexToRgba(COLORS.gold, 0.35) : COLORS.panelBorder,
                }}
              />
            ))}
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
            {t.grammarQuestionOf(grammarIndex + 1, grammarQuestions.length)} · {current.topic}
          </p>
          <h2 className="mt-3 text-xl font-bold leading-snug" style={{ color: COLORS.cream }}>
            {current.prompt}
          </h2>

          <div className="mt-6 space-y-3">
            {current.shuffledOptions.map((opt, i) => {
              const isSelected = grammarAnswers[grammarIndex] === i;
              const cls = `option-btn w-full flex items-center gap-3 rounded-xl px-4 py-4 text-left text-base font-medium ${
                isSelected ? "selected" : ""
              }`;
              return (
                <button key={i} onClick={() => chooseGrammarAnswer(i)} className={cls}>
                  <span className="letter-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{opt}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={() => setGrammarIndex((i) => Math.max(0, i - 1))}
              disabled={grammarIndex === 0}
              className="ghost-btn rounded-full px-4 py-3 text-sm disabled:opacity-40"
            >
              {t.grammarPrev}
            </button>
            {grammarIndex < grammarQuestions.length - 1 ? (
              <button
                onClick={() => setGrammarIndex((i) => i + 1)}
                className="gold-btn flex-1 rounded-full px-4 py-3 text-sm font-bold"
              >
                {t.grammarNext}
              </button>
            ) : (
              <button
                onClick={finishGrammarExam}
                disabled={answeredCount < grammarQuestions.length}
                className="gold-btn flex-1 rounded-full px-4 py-3 text-sm font-bold"
              >
                {answeredCount < grammarQuestions.length
                  ? t.grammarRemaining(grammarQuestions.length - answeredCount)
                  : t.grammarFinish}
              </button>
            )}
          </div>
        </div>
      );
    }

    if (grammarScreen === "result") {
      const score = grammarQuestions.reduce(
        (acc, qq, i) => acc + (grammarAnswers[i] === qq.shuffledCorrect ? 1 : 0),
        0
      );
      const pct = Math.round((score / grammarQuestions.length) * 100);
      const g = grammarGrade(pct, t);
      const byTopic = [];
      const topicIndex = {};
      grammarQuestions.forEach((qq, i) => {
        if (!(qq.topic in topicIndex)) {
          topicIndex[qq.topic] = byTopic.length;
          byTopic.push({ topic: qq.topic, ok: 0, total: 0 });
        }
        const entry = byTopic[topicIndex[qq.topic]];
        entry.total += 1;
        if (grammarAnswers[i] === qq.shuffledCorrect) entry.ok += 1;
      });

      return (
        <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-5 py-8">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
            {t.grammarResult} · {grammarLevel} · {fmtGrammarTime(grammarSeconds)}
          </p>
          <h1 className="marquee mt-2 text-6xl" style={{ color: g.color }}>
            {pct}%
          </h1>
          <p className="text-lg font-bold" style={{ color: g.color }}>
            {g.label} · {score}/{grammarQuestions.length}
          </p>

          <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
            {t.grammarByTopic}
          </h2>
          <div className="space-y-2">
            {byTopic.map((s) => (
              <div key={s.topic} className="flex items-center justify-between text-sm" style={{ color: COLORS.cream }}>
                <span>{s.topic}</span>
                <span style={{ color: s.ok === s.total ? COLORS.green : COLORS.muted }}>
                  {s.ok}/{s.total}
                </span>
              </div>
            ))}
          </div>

          <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
            {t.grammarReview}
          </h2>
          <div className="space-y-3">
            {grammarQuestions.map((qq, i) => {
              const ok = grammarAnswers[i] === qq.shuffledCorrect;
              return (
                <div
                  key={qq.id}
                  className="rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: COLORS.panel,
                    border: `1px solid ${ok ? hexToRgba(COLORS.green, 0.4) : hexToRgba(COLORS.red, 0.4)}`,
                  }}
                >
                  <div className="flex items-start gap-2">
                    {ok ? (
                      <Check size={16} style={{ color: COLORS.green, marginTop: 3 }} />
                    ) : (
                      <X size={16} style={{ color: COLORS.red, marginTop: 3 }} />
                    )}
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                      {qq.prompt}
                    </p>
                  </div>
                  {!ok && (
                    <p className="mt-2 text-xs" style={{ color: COLORS.red }}>
                      {t.grammarYourAnswer} {grammarAnswers[i] !== null ? qq.shuffledOptions[grammarAnswers[i]] : "—"}
                    </p>
                  )}
                  <p className="mt-1 text-xs" style={{ color: COLORS.green }}>
                    {t.grammarCorrectAnswer} {qq.shuffledOptions[qq.shuffledCorrect]}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
                    {qq.explanation}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex gap-3">
            <button
              onClick={() => startGrammarExam(grammarLevel)}
              className="gold-btn flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold"
            >
              <RotateCcw size={16} />
              {t.grammarRepeat}
            </button>
            <button onClick={() => setGrammarScreen("intro")} className="ghost-btn rounded-full px-4 py-3 text-sm">
              {t.grammarLevels}
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderPlayingScreen() {

    if (!question) return null;
    const accent = sessionAccent();
    const accentStyle = {
      "--accent": accent,
      "--accent-glow-outer": hexToRgba(accent, 0.2),
      "--accent-glow-inner": hexToRgba(accent, 0.3),
    };
    return (
      <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-5 py-6" style={accentStyle}>
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setScreen("mode")}
            className="ghost-btn rounded-full p-2"
            aria-label="back"
          >
            <ArrowLeft size={16} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
          </button>
          <span className="text-xs" style={{ color: COLORS.muted }}>
            {t.question(index + 1)}
          </span>
          <span className="text-xs" style={{ color: COLORS.muted }}>
            {t.mistakesLabel}: {mistakes}
          </span>
        </div>

        <ProgressLadder total={sessionItems.length} current={index} color={accent} />

        <div className="flex flex-1 flex-col justify-center">
          <div className="stage-card my-8 rounded-2xl px-6 py-10 text-center">
            <p className="text-3xl font-extrabold" style={{ color: COLORS.cream }}>
              {question.prompt}
            </p>
            {correctIdx !== null && typeof window !== "undefined" && window.speechSynthesis && (
              <button
                onClick={() => {
                  const correctText = question.options.find((o) => o.correct)?.text || "";
                  const toSpeak = mode === "conjugation" ? question.prompt.replace("__", correctText) : correctText;
                  speakSpanish(toSpeak);
                }}
                className="ghost-btn mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold"
                aria-label={t.listen}
              >
                <Volume2 size={16} />
                {t.listen}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {question.options.map((opt, i) => {
              const isCorrect = correctIdx === i;
              const isWrong = wrongIdx.includes(i);
              const cls = `option-btn w-full flex items-center gap-3 rounded-xl px-4 py-4 text-base font-medium ${
                isCorrect ? "correct" : ""
              } ${isWrong ? "wrong" : ""}`;
              return (
                <button key={i} disabled={isWrong || correctIdx !== null} onClick={(e) => handleAnswer(i, e)} className={cls}>
                  <span className="letter-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{opt.text}</span>
                  {isCorrect && (
                    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: COLORS.green }}>
                      +{XP_PER_CORRECT} XP · +{COINS_PER_CORRECT}
                      <Coins size={14} />
                      <Check size={20} />
                    </span>
                  )}
                  {isWrong && (
                    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: COLORS.red }}>
                      -{COINS_PER_CORRECT}
                      <Coins size={14} />
                      <X size={20} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderCongratsScreen() {
    const correctCount = sessionItems.length - mistakes;
    const headline = correctCount >= 12 ? t.congratsHigh(gender) : correctCount >= 9 ? t.congratsMid(gender) : t.congratsLow(gender);
    return (
      <div
        dir={dir}
        lang={lang}
        className="relative flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12 text-center"
      >
        <Confetti accent={sessionAccent()} />
        <Trophy size={64} style={{ color: COLORS.gold }} />
        <h2 className="mb-3 mt-6 text-2xl font-bold" style={{ color: COLORS.gold }}>
          {headline}
        </h2>
        <p className="mb-1 text-sm" style={{ color: COLORS.muted }}>
          {mistakes === 0 ? t.perfect : `${t.mistakesLabel}: ${mistakes}`}
        </p>
        <p className="mb-4 flex items-center gap-2 text-sm font-bold" style={{ color: COLORS.gold }}>
          +{sessionReward.xp} XP <Coins size={14} /> {sessionReward.coins >= 0 ? "+" : ""}
          {sessionReward.coins} {t.coinsLabel}
        </p>
        {levelUpTo !== null && (
          <p
            className="mb-6 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
            style={{ color: COLORS.stage, backgroundColor: COLORS.gold }}
          >
            <Sparkles size={16} />
            {t.levelUp(levelUpTo)}
          </p>
        )}
        <div className="w-full space-y-3">
          <button onClick={replay} className="gold-btn flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold">
            <RotateCcw size={18} />
            {t.playAgain}
          </button>
          <button onClick={() => setScreen("stats")} className="ghost-btn flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base">
            <Coins size={16} />
            {t.statsTitle}
          </button>
          <button onClick={() => setScreen("mode")} className="ghost-btn w-full rounded-xl py-4 text-base">
            {t.changeMode}
          </button>
          <button onClick={() => setScreen("level")} className="ghost-btn w-full rounded-xl py-4 text-base">
            {t.changeLevel}
          </button>
          <button
            onClick={() => setScreen("language")}
            className="ghost-btn flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base"
          >
            <Globe size={16} />
            {t.changeLang}
          </button>
        </div>
      </div>
    );
  }

  function renderStatsScreen() {
    const pct = stats.correct + stats.incorrect > 0 ? Math.round((stats.correct / (stats.correct + stats.incorrect)) * 100) : 0;
    const lvl = levelFromXp(stats.totalXp);
    const curFloor = xpForLevel(lvl);
    const nextFloor = xpForLevel(lvl + 1);
    const progress = nextFloor > curFloor ? (stats.totalXp - curFloor) / (nextFloor - curFloor) : 1;
    const dueCount = Object.values(srs).filter((v) => v.dueAtGame <= stats.gamesPlayed).length;
    const rows = [
      [t.statGames, stats.gamesPlayed],
      [t.statWins, stats.wins],
      [t.statCorrect, stats.correct],
      [t.statIncorrect, stats.incorrect],
      [t.statPercent, `${pct}%`],
      [t.statXp, stats.totalXp],
      [t.statCoins, stats.coins],
      [t.statStreak, stats.streak || 0],
      [t.statLongestStreak, stats.longestStreak || 0],
      [t.srsDue, dueCount],
    ];
    const breakdownPct = (s) => (s.correct + s.incorrect > 0 ? Math.round((s.correct / (s.correct + s.incorrect)) * 100) : null);
    const levelRows = CEFR_LEVELS.map((lv) => [lv, t.levels[lv], stats.byLevel?.[lv] || ZERO_BREAKDOWN_STATS]);
    const modeRows = ["vocab", "conjugation", "thematic"].map((m) => [m, t[m], stats.byMode?.[m] || ZERO_BREAKDOWN_STATS]);
    return (
      <div dir={dir} lang={lang} className="flex w-full max-w-sm flex-1 flex-col px-6 py-10">
        <button onClick={() => setScreen("mode")} className="ghost-btn mb-6 w-fit rounded-full p-2" aria-label="back">
          <ArrowLeft size={16} style={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }} />
        </button>
        <h2 className="mb-2 text-center text-2xl font-bold" style={{ color: COLORS.gold }}>
          {t.statsTitle}
        </h2>
        <p className="mb-3 text-center text-sm" style={{ color: COLORS.muted }}>
          {t.levelLabel} {lvl}
        </p>
        <div className="mb-8 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: COLORS.panelBorder }}>
          <div
            className="h-2 rounded-full"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`, backgroundColor: COLORS.gold }}
          />
        </div>
        <div className="stage-card rounded-xl px-5">
          {rows.map(([label, value], idx) => (
            <div
              key={label}
              className="flex items-center justify-between py-3"
              style={{ borderBottom: idx < rows.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none" }}
            >
              <span className="text-sm" style={{ color: COLORS.muted }}>
                {label}
              </span>
              <span className="text-base font-bold">{value}</span>
            </div>
          ))}
        </div>

        <div className="stage-card mt-6 flex items-center justify-between rounded-xl px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold" style={{ color: COLORS.cream }}>
              <Snowflake size={16} style={{ color: "#7DD3FC" }} />
              {t.freezesTitle} · {stats.streakFreezes || 0}/{STREAK_FREEZE_MAX}
            </p>
            <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
              {t.freezesDesc}
            </p>
          </div>
          {(stats.streakFreezes || 0) < STREAK_FREEZE_MAX ? (
            <button
              onClick={buyStreakFreeze}
              disabled={stats.coins < STREAK_FREEZE_COST}
              className="gold-btn shrink-0 rounded-full px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              {t.buyFreeze(STREAK_FREEZE_COST)}
            </button>
          ) : (
            <span className="shrink-0 text-xs" style={{ color: COLORS.muted }}>
              {t.freezesFull}
            </span>
          )}
        </div>

        <p className="mb-2 mt-8 text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
          {t.byLevelTitle}
        </p>
        <div className="stage-card rounded-xl px-5">
          {levelRows.map(([lv, label, s], idx) => {
            const p = breakdownPct(s);
            return (
              <div
                key={lv}
                className="flex items-center justify-between py-3"
                style={{ borderBottom: idx < levelRows.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none" }}
              >
                <span className="text-sm" style={{ color: COLORS.muted }}>
                  {label}
                </span>
                <span className="text-sm font-bold">{s.gamesPlayed === 0 ? t.noGamesYet : `${s.gamesPlayed} · ${p}%`}</span>
              </div>
            );
          })}
        </div>

        <p className="mb-2 mt-8 text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
          {t.byModeTitle}
        </p>
        <div className="stage-card mb-6 rounded-xl px-5">
          {modeRows.map(([m, label, s], idx) => {
            const p = breakdownPct(s);
            return (
              <div
                key={m}
                className="flex items-center justify-between py-3"
                style={{ borderBottom: idx < modeRows.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none" }}
              >
                <span className="text-sm" style={{ color: COLORS.muted }}>
                  {label}
                </span>
                <span className="text-sm font-bold">{s.gamesPlayed === 0 ? t.noGamesYet : `${s.gamesPlayed} · ${p}%`}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="quiz-root flex min-h-screen w-full flex-col items-center"
      style={{ backgroundColor: COLORS.stage, backgroundImage: STAGE_GLOW, color: COLORS.cream }}
    >
      <style>{GLOBAL_CSS}</style>
      {screen === "language" && renderLanguageScreen()}
      {screen === "gender" && renderGenderScreen()}
      {screen === "level" && renderLevelScreen()}
      {screen === "grammar" && renderGrammarScreen()}
      {screen === "learningHub" && renderLearningHubScreen()}
      {screen === "conjTables" && renderConjTablesScreen()}
      {screen === "mode" && renderModeScreen()}
      {screen === "category" && renderCategoryScreen()}
      {screen === "playing" && renderPlayingScreen()}
      {screen === "congrats" && renderCongratsScreen()}
      {screen === "stats" && renderStatsScreen()}
    </div>
  );
}
