import type { Runtime } from '@langchain/langgraph';
import { OpenRouterService } from '../../services/openrouterService.ts';
import type { GraphState } from '../graph.ts';
import { ChatResponseSchema, getSystemPrompt, getUserPromptTemplate } from '../../prompts/v1/chatResponse.ts';
import { AIMessage, HumanMessage } from 'langchain';

import { PreferencesService } from '../../services/preferencesService.ts';
import { config } from '../../config.ts';

const KNOWN_GENRES = [
  'rock',
  'metal',
  'pop',
  'indie',
  'jazz',
  'blues',
  'reggae',
  'ska',
  'eletrônica',
  'eletronica',
  'electronic',
  'hip hop',
  'rap',
  'sertanejo',
  'mpb',
  'funk',
  'samba',
  'pagode',
  'forró',
  'forro',
  'k-pop',
  'classical',
  'clássica',
  'classica',
];

function extractNameFromText(userMessage: string): string | undefined {
  const match = userMessage.match(/(?:meu nome é|me chamo|sou o|sou a|sou)\s+([a-zA-ZÀ-ÿ'-]+)/i);
  return match?.[1];
}

function extractGenresFromText(userMessage: string): string[] {
  const normalizedMessage = userMessage.toLowerCase();
  const matches = KNOWN_GENRES.filter((genre) => normalizedMessage.includes(genre));
  return [...new Set(matches)];
}

export function createChatNode(llmClient: OpenRouterService, preferencesService: PreferencesService) {
  return async (state: GraphState, runtime?: Runtime): Promise<Partial<GraphState>> => {

    const userId = String(runtime?.context?.userId) || String(state.userId)  || 'unknown';

    const userContext = state.userContext?? await preferencesService.getBasicInfo(userId)

    const systemPrompt = getSystemPrompt(userContext)

    const conversationHistory = state.messages.map(msg => `${HumanMessage.isInstance(msg) ? 'Human' : 'AI'}: ${msg.content}`).join('\n');

    const userMessage = state.messages.at(-1)?.text as string || '';

    const userPrompt = getUserPromptTemplate(userMessage, conversationHistory)

    const result = await llmClient.generateStructured(systemPrompt, userPrompt, ChatResponseSchema);

    if(!result.success || !result.data) {
      console.error('Error generating response:', result.error);
      return { messages: [ new AIMessage( ' Desculpe, encontrei um erro. Pode tentar novamente?') ]}; // Return current state without changes on error
    }
    
    console.log('LLM Response:', result.data); // Log the structured response from the LLM for debugging
    const response = result.data;

    const totalMessages = state.messages.length + 1; // +1 for the new user message

    const needsSummarization = totalMessages >= config.maxMessagesToSummarize; // Set threshold for when to summarize


    const inferredName = extractNameFromText(userMessage);
    const inferredGenres = extractGenresFromText(userMessage);

    const preferencesFromLLM = response.preferences ?? {};
    const mergedFavoriteGenres = [
      ...(preferencesFromLLM.favoriteGenres ?? []),
      ...inferredGenres,
    ];

    const extractedPreferences = response.shouldSavePreferences
      ? {
        ...preferencesFromLLM,
        name: preferencesFromLLM.name ?? inferredName,
        favoriteGenres: mergedFavoriteGenres.length > 0 ? [...new Set(mergedFavoriteGenres)] : undefined,
      }
      : undefined;

    return {
      messages: [
        new AIMessage(response.message), // Keep existing messages
      ],
      extractedPreferences,
      needsSummarization: needsSummarization, // Indicate that we want to summarize the conversation history after this response
    };
  };
}
