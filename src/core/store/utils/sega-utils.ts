import { RootState } from "../types";
import { FIELD_CONFIGS, FieldID, DulfsFieldID } from "../../../config/field-definitions";

export function findBlankItems(state: RootState): Array<{ id: string, type: 'field' | 'list', targetId: string }> {
    const blanks: Array<{ id: string, type: 'field' | 'list', targetId: string }> = [];

    // 1. Check Structured Fields
    for (const config of FIELD_CONFIGS) {
        if (config.id === FieldID.Brainstorm) continue;
        
        const isList = config.layout === "list";
        let hasContent = false;
        
        if (isList) {
            const list = state.story.dulfs[config.id as DulfsFieldID] || [];
            hasContent = list.length > 0;
            
            if (!hasContent) {
                 // Check if queued
                 const requestId = `gen-list-${config.id}`;
                 const isQueued = state.runtime.queue.some(r => r.id === requestId) || state.runtime.activeRequest?.id === requestId;
                 if (!isQueued) {
                     blanks.push({ id: requestId, type: 'list', targetId: config.id });
                 }
            } else {
                // If list has items, check if items hold content (Lorebook entry content)
                // SEGA v1 checked "Linked Lorebooks". 
                // Here we check DulfsItem content.
                for (const item of list) {
                     const itemContent = item.content;
                     if (!itemContent || itemContent.trim().length === 0) {
                         const requestId = `gen-item-${item.id}`; // Matches fields.ts naming
                         const isQueued = state.runtime.queue.some(r => r.id === requestId) || state.runtime.activeRequest?.id === requestId;
                         if (!isQueued) {
                             // Use field generation for item content
                             // Target ID format: FieldID:ItemID
                             blanks.push({ id: requestId, type: 'field', targetId: `${config.id}:${item.id}` });
                         }
                     }
                }
            }
        } else {
            const content = state.story.fields[config.id]?.content;
            hasContent = !!(content && content.trim().length > 0);
            
            if (!hasContent) {
                const requestId = `gen-${config.id}`;
                const isQueued = state.runtime.queue.some(r => r.id === requestId) || state.runtime.activeRequest?.id === requestId;
                if (!isQueued) {
                    blanks.push({ id: requestId, type: 'field', targetId: config.id });
                }
            }
        }
    }
    
    return blanks;
}
