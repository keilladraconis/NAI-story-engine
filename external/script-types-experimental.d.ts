/**
 * NovelAI Scripting API - Experimental
 *
 * Definitions in this file are gated behind the `experimentalScriptingApi`
 * user setting. They are not part of the public scripting API and may change
 * or be removed without notice.
 */

/**
 * Identifier for a sampler exposed through the scripting API.
 */
type SamplerId = 'temperature' | 'top_k' | 'top_p' | 'min_p'

/**
 * The enabled state of a sampler in the story's generation settings.
 */
type SamplerState = {
    /** The sampler this state belongs to */
    id: SamplerId
    /**
     * Whether the sampler is enabled. The value of a disabled sampler is ignored during
     * generation. `temperature` is always enabled and cannot be disabled
     */
    enabled: boolean
}

/**
 * Basic information about a generation settings preset.
 */
type PresetInfo = {
    /** Unique id of the preset */
    id: string
    /** Display name of the preset */
    name: string
    /** The model the preset is for */
    model: string
    /** Whether this is a built-in default preset. Default presets cannot be modified or deleted */
    isDefault: boolean
    /** Optional description of the preset */
    description?: string
}

/**
 * The generation parameters stored in a preset, limited to the parameters the
 * scripting API exposes. Parameters the preset's model does not support are omitted
 * and cannot be set. Note that a preset does not control the output length; use
 * `api.v1.generationParameters.update` to change `max_tokens`.
 */
type PresetParameters = {
    /** Sampling temperature. Higher values result in more random outputs */
    temperature?: number
    /** Nucleus sampling threshold. Only tokens with cumulative probability < top_p are considered */
    top_p?: number
    /** Top-k sampling. Only the k most likely tokens are considered */
    top_k?: number
    /** Min-p sampling. Removes tokens with probability below this threshold */
    min_p?: number
    /** Penalty for token frequency. Positive values decrease likelihood of a token appearing based on the number of times that token has appeared so far */
    frequency_penalty?: number
    /** Penalty for token presence. Positive values decrease likelihood of tokens that have appeared at least once */
    presence_penalty?: number
    /** Enabled state of the preset's samplers. See `SamplerState` for how disabled samplers behave */
    samplers?: SamplerState[]
}

declare namespace api {
    namespace v1 {
        namespace generationParameters {
            /**
             * Get the enabled state of the samplers available on the current model.
             * The value of a disabled sampler is ignored during generation, even if it was
             * set through `update`. Samplers the current model does not support are omitted.
             * @returns Promise resolving to the samplers and their enabled state
             * @example
             * const samplers = await api.v1.generationParameters.getSamplers();
             * const topK = samplers.find((s) => s.id === "top_k");
             * if (topK && !topK.enabled) {
             *   await api.v1.generationParameters.setSamplerEnabled("top_k", true);
             * }
             */
            function getSamplers(): Promise<SamplerState[]>

            /**
             * Enable or disable a sampler in the story's generation settings.
             * Requires the "storyEdit" permission.
             * Throws if the current model does not support the sampler, or when attempting
             * to disable `temperature`, which is always applied during generation.
             * @param sampler The sampler to change
             * @param enabled Whether the sampler should be enabled
             * @returns Promise that resolves when the sampler state is updated
             */
            function setSamplerEnabled(sampler: SamplerId, enabled: boolean): Promise<void>
        }

        /**
         * Presets API - Manage generation settings presets.
         */
        namespace presets {
            /**
             * List the available presets: the default presets for the story's current model
             * and all of your account's presets (which each specify their model).
             * @returns Promise resolving to basic information about each preset
             */
            function list(): Promise<PresetInfo[]>

            /**
             * Get a preset, including its generation parameters.
             * Throws if no preset with the given id exists.
             * @param id Id of the preset
             * @returns Promise resolving to the preset
             */
            function get(id: string): Promise<PresetInfo & { parameters: PresetParameters }>

            /**
             * Get the preset currently selected for the story.
             * @returns Promise resolving to the current preset, or undefined if the selected
             * preset no longer exists. `dirty` is true when the story's generation settings
             * have been changed since the preset was applied
             */
            function getCurrent(): Promise<(PresetInfo & { dirty: boolean }) | undefined>

            /**
             * Apply a preset to the story's generation settings.
             * Requires the "storyEdit" permission.
             * Throws if the preset does not exist or is not compatible with the story's current model.
             * @param id Id of the preset to apply
             * @returns Promise that resolves when the preset is applied
             */
            function select(id: string): Promise<void>

            /**
             * Create a new preset for the story's current model. Parameters that are not
             * provided are taken from the model's first default preset.
             * Requires the "presetEdit" permission.
             * @param options The name of the preset and optionally its parameters
             * @returns Promise resolving to the created preset
             * @example
             * const preset = await api.v1.presets.create({
             *   name: "Good Preset",
             *   parameters: { temperature: 0.6, samplers: [{ id: "min_p", enabled: true }] },
             * });
             * await api.v1.presets.select(preset.id);
             */
            function create(options: { name: string; parameters?: PresetParameters }): Promise<PresetInfo>

            /**
             * Update a preset. Only the provided fields are changed. Only your account's
             * presets can be updated, not default presets. If the preset is currently
             * selected for the story, the story's settings are not changed; select the
             * preset again to apply the updated values.
             * Requires the "presetEdit" permission.
             * @param id Id of the preset to update
             * @param options New name and/or parameters
             * @returns Promise resolving to the updated preset
             */
            function update(
                id: string,
                options: { name?: string; parameters?: PresetParameters }
            ): Promise<PresetInfo>

            /**
             * Delete a preset. Only your account's presets can be deleted, not default presets.
             * If the preset is currently selected for the story, the story falls back to the
             * default preset.
             * Requires the "presetEdit" permission.
             * @param id Id of the preset to delete
             * @returns Promise that resolves when the preset is deleted
             */
            function remove(id: string): Promise<void>

            /**
             * Save the story's current generation settings to a preset.
             * With a name, saves them as a new preset and selects it for the story.
             * Without a name, saves them into the currently selected preset; throws if the
             * current preset is not one of your account's presets.
             * Requires the "presetEdit" permission.
             * @param name Optional name for a new preset
             * @returns Promise resolving to the saved preset
             */
            function saveCurrent(name?: string): Promise<PresetInfo>
        }

        namespace editor {
            /**
             * Block or unblock the editor. While blocked, the user cannot edit the story and other
             * scripts cannot change the document or trigger generations. The blocking script is
             * unaffected and can keep editing and generating.
             * Only one script can block the editor at a time; blocking while another script holds
             * a block throws an error. A script's block is released automatically when it is unloaded.
             * @param blocked Whether the editor should be blocked
             * @param generating Whether the Send button should show the generation animation while blocked. Default false
             * @param onCancel Called when the user presses the cancel button shown with the generation animation. The block is not released automatically; call `editor.block(false)` to release it
             * @example
             * await api.v1.editor.block(true, true, async () => {
             *   // The user asked to cancel, stop working and unblock
             *   await api.v1.editor.block(false);
             * });
             * // ... make document changes, generate, etc. ...
             * await api.v1.editor.block(false);
             */
            function block(blocked: boolean, generating?: boolean, onCancel?: () => void): Promise<void>
        }

        namespace document {
            /**
             * Group all document edits made inside the callback into a single undo step.
             * Without this, each edit (append, appendParagraph, updateParagraph, etc.) is its own
             * history step, which can be annoying to undo/redo when making multiple edits in a row.
             * @param callback Performs the document edits. May be async; it is awaited.
             * @example
             * await api.v1.document.transaction(async () => {
             *   await api.v1.generate(messages, params, (choices) => {
             *     api.v1.document.append(choices[0].text);
             *   });
             * });
             */
            function transaction(callback: () => void | Promise<void>): Promise<void>
        }
    }
}
