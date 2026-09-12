// Server-only. Never import this from a Client Component — GEMINI_API_KEY
// must never reach the browser bundle. No 'server-only' package dependency
// is added for this (avoiding a new dependency per project guidelines); the
// runtime guard below is the same pattern used by lib/supabase/admin.ts.
//
// Uses Gemini's gemini-embedding-2 model via a plain fetch() call — no SDK
// dependency. The model previously used here was deprecated and shut down
// 2026-01-14; gemini-embedding-2 is the current stable replacement.
// gemini-embedding-2 defaults to 3072-dim output but supports an
// `output_dimensionality` request parameter (128-3072, with 768/1536/3072
// as the documented recommended sizes) — set to 768 here to match the
// schema's existing VECTOR(768) columns (donations.food_embedding,
// ngo_requirements.requirement_embedding) exactly, so no migration or
// schema change is needed.
//
// Endpoint/auth header/request body verified against
// https://ai.google.dev/gemini-api/docs/embeddings. The RESPONSE shape,
// however, was verified empirically against a live call (2026-09-05) rather
// than trusted from documentation: that call returned the same singular
// `{ embedding: { values: [...] } }` shape as the prior (now-defunct) model,
// not the plural `{ embeddings: [{ values: [...] }] }` the docs page
// described. extractEmbeddingValues() accepts either shape defensively, but
// treats the empirically-confirmed singular one as primary.
//
// Embedding generation is best-effort everywhere it's called from: a
// donation or requirement must still be creatable if this fails (missing
// key, rate limit, network error, etc.) — callers catch and log, never let
// this block the mutation it's attached to.

const EMBEDDING_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent'
const OUTPUT_DIMENSIONS = 768

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (typeof window !== 'undefined') {
    throw new Error('generateEmbedding() must never be called from client-side code.')
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[embeddings] GEMINI_API_KEY is not configured; skipping embedding generation.')
    return null
  }

  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    const response = await fetch(EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text: trimmed }] },
        output_dimensionality: OUTPUT_DIMENSIONS,
      }),
    })

    if (!response.ok) {
      // Never include the response body here — it can echo back request
      // details; status/statusText is enough to diagnose from logs.
      console.error(`[embeddings] Gemini request failed: ${response.status} ${response.statusText}`)
      return null
    }

    const payload: unknown = await response.json()
    const values = extractEmbeddingValues(payload)

    if (!values || values.length !== OUTPUT_DIMENSIONS) {
      console.error(`[embeddings] unexpected embedding shape (expected ${OUTPUT_DIMENSIONS} dimensions)`)
      return null
    }

    return values
  } catch (error) {
    console.error('[embeddings] failed to generate embedding:', error)
    return null
  }
}

function extractEmbeddingValues(payload: unknown): number[] | null {
  if (!payload || typeof payload !== 'object') return null

  // Primary, empirically-confirmed shape: { embedding: { values: [...] } }.
  const singular = (payload as { embedding?: unknown }).embedding
  if (singular && typeof singular === 'object') {
    const values = (singular as { values?: unknown }).values
    if (Array.isArray(values) && values.every((v) => typeof v === 'number')) return values
  }

  // Defensive fallback for the plural shape Google's own docs describe:
  // { embeddings: [{ values: [...] }] }.
  const plural = (payload as { embeddings?: unknown }).embeddings
  if (Array.isArray(plural) && plural.length > 0) {
    const first = plural[0]
    if (first && typeof first === 'object') {
      const values = (first as { values?: unknown }).values
      if (Array.isArray(values) && values.every((v) => typeof v === 'number')) return values
    }
  }

  return null
}
