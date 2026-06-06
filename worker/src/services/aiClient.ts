import type { AIConfig, AIAnalysis } from '../types';

function parseAIJson(raw: string): AIAnalysis {
  // Strip markdown code fences that models sometimes add despite instructions
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text) as AIAnalysis;
}

const SYSTEM_PROMPT = `You are an expert Unraid system administrator and Linux syslog analyst.
You will be given a block of Unraid system logs or Docker container logs.
Your job is to identify issues, explain root causes, and suggest concrete fix steps.

Respond ONLY with a valid JSON object in this exact shape:
{
  "severity": "ok" | "warning" | "critical",
  "summary": "<2-3 sentence plain-English summary>",
  "findings": [
    {
      "issue": "<short name of the issue>",
      "cause": "<explanation of root cause>",
      "fix": "<concrete steps to resolve, numbered if multi-step>"
    }
  ]
}

If logs appear healthy with no issues, return severity "ok", a positive summary, and an empty findings array.`;

async function callClaude(apiKey: string, model: string, logText: string): Promise<AIAnalysis> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: logText }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return parseAIJson(data.content[0]!.text);
}

async function callGemini(apiKey: string, model: string, logText: string): Promise<AIAnalysis> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${logText}` }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return parseAIJson(data.candidates[0]!.content.parts[0]!.text);
}

async function callOpenAI(apiKey: string, model: string, logText: string): Promise<AIAnalysis> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: logText },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return parseAIJson(data.choices[0]!.message.content);
}

export async function analyzeLog(config: AIConfig, logText: string, modelOverride?: string): Promise<AIAnalysis> {
  const model = modelOverride ?? config.default_model;
  switch (config.provider) {
    case 'claude':  return callClaude(config.api_key, model, logText);
    case 'gemini':  return callGemini(config.api_key, model, logText);
    case 'openai':  return callOpenAI(config.api_key, model, logText);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
