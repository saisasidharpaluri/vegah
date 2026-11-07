export interface AnalysisResult {
  characters: number;
  words: number;
  sentences: number;
  estimatedReadingSeconds: number;
}

export function analyzeText(text: string): AnalysisResult {
  const normalized = text.trim();
  const words = normalized ? normalized.split(/\s+/u).length : 0;
  const sentences = normalized ? (normalized.match(/[.!?]+(?=\s|$)/gu) ?? []).length || 1 : 0;
  return {
    characters: text.length,
    words,
    sentences,
    estimatedReadingSeconds: Math.ceil((words / 200) * 60),
  };
}
