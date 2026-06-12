/** Picks the most natural browser voice available for executive briefings. */
export function pickBriefingVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const score = (v: SpeechSynthesisVoice): number => {
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    let s = 0;

    if (name.includes('natural') || name.includes('neural') || name.includes('online')) s += 40;
    if (name.includes('google') && (name.includes('us') || name.includes('uk'))) s += 30;
    if (name.includes('microsoft')) s += 25;
    if (name.includes('zira') || name.includes('aria') || name.includes('jenny') || name.includes('sonia')) s += 20;
    if (name.includes('samantha') || name.includes('karen') || name.includes('daniel')) s += 18;
    if (lang === 'en-us') s += 15;
    if (lang === 'en-gb') s += 12;
    if (lang.startsWith('en-in')) s += 8;
    if (lang.startsWith('en')) s += 5;
    if (v.localService) s += 3;
    if (name.includes('desktop')) s -= 5;

    return s;
  };

  return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Makes CRM summary text easier for speech engines to read aloud. */
export function normalizeBriefingForSpeech(text: string): string {
  return text
    .replace(/₹\s?/g, 'rupees ')
    .replace(/\s+/g, ' ')
    .trim();
}
