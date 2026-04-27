import type { Runtime } from '@langchain/langgraph';
import type { GraphState } from '../graph.ts';
import { PreferencesService } from '../../services/preferencesService.ts';

export function createSavePreferencesNode(preferencesService: PreferencesService) {
  return async (state: GraphState, runtime?: Runtime): Promise<Partial<GraphState>> => {
    if(!state.extractedPreferences) return {} 

    const userId = String(runtime?.context?.userId) || String(state.userId)  || 'unknown';

    await preferencesService.mergePreferences(userId, state.extractedPreferences)

    return {
      extractedPreferences: undefined, // Clear extracted preferences from state after saving
      
    };
  };
}
