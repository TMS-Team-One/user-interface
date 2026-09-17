import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import type { FileClassification } from '../../shared/types'

// The same model the chat agent uses by default.
const MODEL = 'gpt-4o-mini'

const Classification = z.object({
  kind: z.enum(['gerber', 'drill', 'step', 'netlist', 'unknown']),
  layerType: z
    .enum(['copper', 'soldermask', 'silkscreen', 'solderpaste', 'drill', 'outline'])
    .nullable(),
  layerSide: z.enum(['top', 'bottom', 'inner', 'all']).nullable()
})

const INSTRUCTIONS =
  'You classify files exported from PCB design tools for an automatic board tester. ' +
  'Decide what the file is from its name and first lines. layerType and layerSide only ' +
  'apply to Gerber layers; use null otherwise. Answer "unknown" when unsure.'

// The key from the environment, or from the app's .env where the agent keeps it.
function openAiApiKey(): string | null {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  try {
    const match = /^OPENAI_API_KEY=(.+)$/m.exec(
      readFileSync(join(app.getAppPath(), '.env'), 'utf8')
    )
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

/**
 * Asks the model what an unrecognised file is. Only reached when the
 * deterministic rules in shared/file-kinds.ts give "unknown". Returns null
 * without a key, so the app works without credentials. Nothing in this
 * repository exercises the call.
 */
export async function classifyFileWithAi(
  fileName: string,
  head: string
): Promise<FileClassification | null> {
  const apiKey = openAiApiKey()
  if (!apiKey) return null

  const client = new OpenAI({ apiKey })
  const response = await client.responses.parse({
    model: MODEL,
    instructions: INSTRUCTIONS,
    input: `File name: ${fileName}\n\nFirst lines:\n${head}`,
    text: { format: zodTextFormat(Classification, 'classification') }
  })
  return response.output_parsed
}
