/**
 * NovelAI Scripting API
 */

// ============================================================================
// Data Types
// ============================================================================

/**
 * Represents logprob information for a generated token, including alternative tokens that could have been chosen and their probabilities. This is the format used by the NovelAI frontend for displaying logprobs in the editor and modals.
 */
type Logprobs = {
    /** The token that was actually chosen by the model */
    chosen: LogprobsToken
    /** A list of the top alternative tokens after sampling */
    afters: LogprobsToken[]
    /** A list of the top alternative tokens before sampling */
    befores: LogprobsToken[]
    /** Whether this token should be excluded from the displayed text. If true it will be treated not be shown in the editor and will appear crossed out in the logprobs modal. */
    excludedFromText?: boolean
    /** When set this display text will be used for length calculations for logprobs. Newlines are replaced with \\n */
    displayText?: string
    /** Whether the token was cropped as part of the (currently) Erato specific token cropping behaviour. Tokens with this set will have an icon added to them when viewed in the editor or logprobs modal */
    croppedToken?: boolean
}

/**
 * A single token with its probability information and metadata.
 */
type LogprobsToken = {
    /** The token ID */
    token: number
    /** The string representation of the token. Newlines are replaced with \\n */
    str: string
    /** The probability that this token was chosen before sampling as a logprob */
    before: number | null
    /** The probability that this token was chosen before sampling as a percentage */
    pBefore: number | null
    /** The probability that this token was chosen after sampling as a logprob */
    after: number | null
    /** The probability that this token was chosen after sampling as a percentage */
    pAfter: number | null
    /** Whether this is a partial character. Many unicode characters are represented as multiple tokens */
    partial: boolean
    /** Whether this token was the one chosen by the model */
    chosen?: boolean
    /** Whether this token, when shown in the editor, should display the before probabilities instead of the after probabilities */
    useBefore?: boolean
}

/**
 * Represents a selection range in the document. `from`/`to` and `anchor`/`head` are similar, but `from` is always before `to` in the document, while `anchor` is where the selection started and `head` is where it ended they can be in either order.
 */
type DocumentSelection = {
    /** Start position of the selection */
    from: { sectionId: number; offset: number }
    /** End position of the selection */
    to: { sectionId: number; offset: number }
    /** Anchor point (where selection started) */
    anchor: { sectionId: number; offset: number }
    /** Head point (where selection ended) */
    head: { sectionId: number; offset: number }
}

/**
 * Parameters for text generation requests.
 */
type GenerationParams = {
    /** Model identifier to use for generation (e.g., "glm-4-6") */
    model: string
    /** Maximum number of tokens to generate */
    max_tokens?: number
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
    /** Penalty for token presence. Positive values decrease likelihood of tokens that have appeared at least once*/
    presence_penalty?: number
    /** Array of strings that will stop generation when encountered */
    stop?: string[]
    /** Logit bias to apply to specific tokens */
    logit_bias?: Record<number, number>
    /** Whether to use thinking tokens */
    enable_thinking?: boolean
}

/**
 * Specifies where in the document generation will start, and optionally what text to replace.
 */
type GenerationPosition = {
    /** The section (paragraph) ID where generation starts */
    sectionId: number
    /** Character offset within the section */
    offset: number
    /** Optional ending section ID. Text within the starting and ending sections will be deleted */
    endSectionId?: number
    /** Optional ending offset. Text within the starting and ending offsets will be deleted */
    endOffset?: number
}

/**
 * A single generated completion choice.
 */
type GenerationChoice = {
    /** The generated text */
    text: string
    /** Index of this choice in the array */
    index: number
    /** Token IDs that were generated */
    token_ids: number[]
    /** Logprobs in the OpenAI format */
    logprobs?: OpenAILogprobs
    /** Logprobs converted to the format used by NovelAI */
    convertedLogprobs?: Logprobs[]
    /** Reason generation stopped (e.g., "stop", "length"). May be undefined if the generation stopped abnormally, such as if it was cancelled or timed out */
    finish_reason?: string
    /** Whether this choice is part of a thinking token. Only used during streaming when enable_thinking is true */
    isReasoning?: boolean
    /** If thinking is enabled, the reasoning part of the text before the closing </think> tag.  Only present on the final response of api.v1.generate, not used when streaming */
    parsedReasoning?: string
    /** If thinking is enabled, the content part of the text after the closing </think> tag. Only present on the final response of api.v1.generate, not used when streaming */
    parsedContent?: string
}

/**
 * Response from a generation request containing one or more completion choices. Currently, only one choice is ever returned.
 */
type GenerationResponse = {
    /** Array of generated completions */
    choices: GenerationChoice[]
}

/**
 * Logprobs in the OpenAI format.
 */
type OpenAILogprobs = {
    /** Presumably the character offsets for each token in the generated text, but I'm not sure it works. */
    text_offset: number[]
    /** Log probability the generated token */
    token_logprobs: number[]
    /** The string representation of each alternative token */
    tokens: string[]
    /** The token representation of each alternative token */
    token_ids: number[][]
    /** A mapping of top alternative tokens and their probabilities at each position */
    top_logprobs: Record<string, number>[]
}

/**
 * Lorebook condition that combines multiple conditions with AND logic.
 * All conditions must be true for this to match.
 */
type LorebookAdvancedConditionAnd = {
    type: 'and'
    /** Array of conditions that must all be true */
    conditions: LorebookCondition[]
}

/**
 * Lorebook condition based on a mathematical equation.
 *
 * Allows for comparisons like "characterCount > 1000".
 */
type LorebookAdvancedConditionEquation = {
    type: 'equation'
    /** Terms to calculate (values and operators) */
    terms: {
        /** Value can be a variable name or a number */
        value: 'characterCount' | 'currentStep' | 'paragraphCount' | number
        /** Mathematical operator to apply */
        operator?: '%' | '*' | '+' | '-' | '/'
    }[]
    /** Comparison operator */
    comparison: '<' | '<=' | '=' | '>' | '>='
    /** Target value or variable to compare against */
    target: 'characterCount' | 'currentStep' | 'paragraphCount' | number
}

/**
 * Lorebook condition that checks if a key appears in specific places.
 * Can search in author's note, lorebook, memory, or story within a range.
 */
type LorebookAdvancedConditionKey = {
    type: 'key'
    /** The key string to search for */
    key: string
    /** Where to search for the key */
    in: ('an' | 'lore' | 'memory' | 'story')[]
    /** How far back to search in characters. Only applies to 'story' */
    range: number
}

/**
 * Lorebook condition that checks if another lorebook entry is active.
 */
type LorebookAdvancedConditionLore = {
    type: 'lore'
    /** ID of the lorebook entry to check. If omitted, does nothing */
    entryId?: string
}

/**
 * Lorebook condition that checks if a specific model is being used.
 */
type LorebookAdvancedConditionModel = {
    type: 'model'
    /** Model identifier to check against */
    model: string
}

/**
 * Lorebook condition that inverts another condition (NOT logic).
 */
type LorebookAdvancedConditionNot = {
    type: 'not'
    /** The condition to negate */
    condition: LorebookCondition
}

/**
 * Lorebook condition that combines multiple conditions with OR logic.
 * At least one condition must be true for this to match.
 */
type LorebookAdvancedConditionOr = {
    type: 'or'
    /** Array of conditions where at least one must be true */
    conditions: LorebookCondition[]
}

/**
 * Lorebook condition with a random chance of being true.
 */
type LorebookAdvancedConditionRandom = {
    type: 'random'
    /** Probability of being true (0.0 to 1.0) */
    chance: number
}

/**
 * Lorebook condition that checks the current story mode.
 */
type LorebookAdvancedConditionStoryMode = {
    type: 'storymode'
    /** The mode to check for */
    mode: 'adventure' | 'normal'
}

/**
 * Lorebook condition that performs string comparison operations.
 */
type LorebookAdvancedConditionStringComparison = {
    type: 'string'
    /** The a string or variable to compare */
    left: string | 'authorsNoteText' | 'memoryText' | 'storyText'
    /** Comparison operation */
    comparison: 'endsWith' | 'equals' | 'includes' | 'startsWith'
    /** The string or variable to compare against */
    right: string | 'authorsNoteText' | 'memoryText' | 'storyText'
}

/**
 * Lorebook condition that always evaluates to true.
 */
type LorebookAdvancedConditionTrue = { type: 'true' }

/**
 * A category for organizing lorebook entries.
 */
type LorebookCategory = {
    /** Unique identifier for the category */
    id: string
    /** Display name of the category */
    name?: string
    /** If false, all entries in this category are considered disabled and won't be used for generation */
    enabled?: boolean
    /** Category-specific settings */
    settings?: {
        /** Header text to prepend to entries in this category */
        entryHeader?: string
    }
}

/**
 * Union type of all possible lorebook condition types.
 */
type LorebookCondition =
    | LorebookAdvancedConditionAnd
    | LorebookAdvancedConditionEquation
    | LorebookAdvancedConditionKey
    | LorebookAdvancedConditionLore
    | LorebookAdvancedConditionModel
    | LorebookAdvancedConditionNot
    | LorebookAdvancedConditionOr
    | LorebookAdvancedConditionRandom
    | LorebookAdvancedConditionStoryMode
    | LorebookAdvancedConditionStringComparison
    | LorebookAdvancedConditionTrue

/**
 * A lorebook entry.
 */
type LorebookEntry = {
    /** Unique identifier for the entry */
    id: string
    /** Display name shown in the UI */
    displayName?: string
    /** ID of the category this entry belongs to */
    category?: string
    /** The lore text to inject into context when activated */
    text?: string
    /** Keywords that trigger this entry */
    keys?: string[]
    /** Whether the entry is "hidden" in the ui. Hidden entries will still be listed, but to see their details a user must click to unhide them */
    hidden?: boolean
    /** Whether the entry can be activated */
    enabled?: boolean
    /** Advanced conditions for entry activation */
    advancedConditions?: LorebookCondition[]
    /** Whether the entry should always be considered active. Called "Always On" in the UI */
    forceActivation?: boolean
}

/**
 * Message object for text generation requests.
 */
type Message = {
    /** The role of the message sender */
    role: 'system' | 'user' | 'assistant'
    /** The content of the message */
    content?: string
    /** Optional reasoning content for assistant messages */
    reasoning?: string
}

/**
 * A message sent between scripts via the messaging API.
 */
type ScriptMessage = {
    /** ID of the script that sent this message */
    fromScriptId: string
    /** ID of the target script (undefined for broadcasts) */
    toScriptId?: string
    /** Optional channel name for filtering messages */
    channel?: string
    /** The message data (can be any serializable value) */
    data: any
    /** Unix timestamp when the message was sent */
    timestamp: number
}

/**
 * Filter for script message subscriptions.
 */
type ScriptMessageFilter = {
    /** Only receive messages from this script ID */
    fromScriptId?: string
    /** Only receive messages on this channel */
    channel?: string
}

/**
 * Configuration for a modal.
 */
type ModalOptions = {
    /** Unique identifier for the modal */
    id?: string
    /** Title displayed in the modal header */
    title?: string
    /** Size preset for the modal */
    size?: 'full' | 'large' | 'medium' | 'small'
    /** Whether the modal has a minimum height */
    hasMinimumHeight?: boolean
    /** Whether the modal should fill available width or size based on content. */
    fillWidth?: boolean
    /** UI components to render inside the modal */
    content: UIPart[]
}

/**
 * Editor formatting options for text.
 */
type EditorTextFormatting = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'inline_code'

/**
 * Origin of text in the document for metadata purposes.
 */
type EditorDataOrigin = 'user' | 'ai' | 'edit' | 'prompt' | 'script'

/**
 * The section's source type. Used for special formatting of certain paragraph types.
 */
type EditorSectionSource = 'story' | 'action' | 'dialogue' | 'instruction'

/**
 * A section (paragraph) in the document with text, formatting, and metadata.
 */
type Section = {
    /** The plain text content of the section */
    text: string
    /** Origin metadata for tracking the source of text (e.g. prompt, user, generated) */
    origin: {
        /** Position in the text */
        position: number
        /** Length of the segment */
        length: number
        /** The type of data being represented */
        data: EditorDataOrigin
    }[]
    /** Formatting information (bold, italic, etc.) */
    formatting: {
        /** Position in the text */
        position: number
        /** Length of the formatted segment */
        length: number
        /** The type of formatting applied */
        data: EditorTextFormatting
    }[]
    /** Source identifier for the paragraph. Paragraphs with different sources are formatted differently. Used for the special looking paragraphs used for instructions and text adventure do/say actions */
    source?: EditorSectionSource
}

/**
 * Metadata for a text diff operation on origin or formatting data.
 */
type HistoryDiffMeta = {
    /** Index in the meta array */
    index: number
    /** Position in the text */
    position: number
    /** Length of the metadata segment */
    length: number
    /** The string value of the metadata */
    data: string
}

/**
 * A text-based diff showing changes to a section.
 */
type HistoryDiffText = {
    /** Parts of the diff showing insertions and deletions */
    parts: Array<{
        /** The starting position of the change */
        from: number
        /** Text that was inserted */
        insert: string
        /** Text that was deleted */
        delete: string
    }>
    /** Origin metadata changes */
    origin: HistoryDiffMeta[]
    /** Formatting metadata changes */
    formatting: HistoryDiffMeta[]
    /** Source type change (if any) */
    source?: number
}

/**
 * A history step that creates a new section.
 */
type HistoryStepCreate = {
    type: 'create'
    /** The section that was created */
    section: Section
    /** ID of the section this was inserted after */
    after?: number
}

/**
 * A history step that updates an existing section.
 */
type HistoryStepUpdate = {
    type: 'update'
    /** The diff describing the changes */
    diff: HistoryDiffText
}

/**
 * A history step that removes a section.
 */
type HistoryStepRemove = {
    type: 'remove'
    /** The section that was removed */
    previous: Section
    /** ID of the section this was after */
    after?: number
}

/**
 * A single change in a history node.
 */
type HistoryStep = HistoryStepCreate | HistoryStepUpdate | HistoryStepRemove

/**
 * A map of section IDs to the changes that occurred to them in a single history step.
 * Each element is a tuple of [sectionId, historyStep].
 * This represents all changes that happened in one history node.
 */
type HistoryChangeMap = Array<[number, HistoryStep]>

/**
 * Information about a history node.
 */
type HistoryNodeInfo = {
    /** Unique ID of this history node */
    id: number
    /** ID of the parent node, if any */
    parent: number | undefined
    /** IDs of child nodes */
    children: number[]
    /** ID of the preferred route to take when descending, if any */
    route: number | undefined
    /** If this node was created by generation, the position information */
    genPosition: GenerationPosition | undefined
}

/**
 * Result of navigating to a history node.
 */
type HistoryNodeState = {
    /** Path of node IDs going backward from current to common ancestor */
    backwardPath: number[]
    /** Path of node IDs going forward from common ancestor to target */
    forwardPath: number[]
    /** Changes that occurred going backward. Array of change maps, one per node in backwardPath. Each change map is an array of [sectionId, change] tuples. */
    backwardChanges: HistoryChangeMap[]
    /** Changes that occurred going forward. Array of change maps, one per node in forwardPath. Each change map is an array of [sectionId, change] tuples. */
    forwardChanges: HistoryChangeMap[]
    /** The sections in the document at the target node */
    sections: { sectionId: number; section: Section }[]
    /** Information about the target node */
    targetNode: HistoryNodeInfo
}

/**
 * An id for an icon that can be used in UI extensions.
 */
type IconId =
    | 'play'
    | 'pause'
    | 'save'
    | 'download'
    | 'upload'
    | 'edit'
    | 'delete'
    | 'trash'
    | 'add'
    | 'plus'
    | 'settings'
    | 'info'
    | 'warning'
    | 'error'
    | 'alert'
    | 'success'
    | 'check'
    | 'home'
    | 'user'
    | 'search'
    | 'refresh'
    | 'reload'
    | 'copy'
    | 'eye'
    | 'eye-off'
    | 'hide'
    | 'show'
    | 'lock'
    | 'unlock'
    | 'mail'
    | 'email'
    | 'file'
    | 'folder'
    | 'image'
    | 'code'
    | 'send'
    | 'close'
    | 'x'
    | 'chevron-right'
    | 'chevron-left'
    | 'chevron-up'
    | 'chevron-down'
    | 'right'
    | 'left'
    | 'up'
    | 'down'
    | 'list'
    | 'grid'
    | 'star'
    | 'heart'
    | 'favorite'
    | 'filter'
    | 'calendar'
    | 'clock'
    | 'time'
    | 'zap'
    | 'lightning'
    | 'square'
    | 'hexagon'
    | 'help'
    | 'trending-up'
    | 'trending-down'
    | 'file-minus'
    | 'file-plus'
    | 'file-text'
    | 'folder-plus'
    | 'folder-minus'
    | 'activity'
    | 'alertOctagon'
    | 'alertTriangle'
    | 'align-center'
    | 'align-justify'
    | 'align-left'
    | 'align-right'
    | 'anchor'
    | 'archive'
    | 'arrow-down'
    | 'arrow-down-circle'
    | 'arrow-down-left'
    | 'arrow-down-right'
    | 'arrow-left'
    | 'arrow-left-circle'
    | 'arrow-right'
    | 'arrow-right-circle'
    | 'arrow-up'
    | 'arrow-up-circle'
    | 'arrow-up-left'
    | 'arrow-up-right'
    | 'at-sign'
    | 'award'
    | 'bar-chart'
    | 'bar-chart-2'
    | 'battery'
    | 'batteryCharging'
    | 'bell'
    | 'bell-off'
    | 'bold'
    | 'book'
    | 'bookOpen'
    | 'bookmark'
    | 'box'
    | 'breifcase'
    | 'camera'
    | 'cameraOff'
    | 'check-circle'
    | 'check-square'
    | 'chevrons-down'
    | 'chevrons-left'
    | 'chevrons-right'
    | 'chevrons-up'
    | 'circle'
    | 'clipboard'
    | 'cloud'
    | 'cloud-drizzle'
    | 'cloud-lightning'
    | 'cloud-off'
    | 'cloud-rain'
    | 'cloud-snow'
    | 'coffee'
    | 'columns'
    | 'command'
    | 'compass'
    | 'corner-down-left'
    | 'corner-down-right'
    | 'corner-left-down'
    | 'corner-left-up'
    | 'corner-right-down'
    | 'corner-right-up'
    | 'corner-up-left'
    | 'corner-up-right'
    | 'cpu'
    | 'crop'
    | 'crosshair'
    | 'database'
    | 'disc'
    | 'divide'
    | 'divide-circle'
    | 'divide-square'
    | 'dollar-sign'
    | 'download-cloud'
    | 'droplet'
    | 'edit-2'
    | 'edit-3'
    | 'external-link'
    | 'fast-forward'
    | 'feather'
    | 'film'
    | 'flag'
    | 'frown'
    | 'gift'
    | 'globe'
    | 'hard-drive'
    | 'hash'
    | 'headphones'
    | 'help-circle'
    | 'inbox'
    | 'italic'
    | 'key'
    | 'layers'
    | 'layout'
    | 'life-buoy'
    | 'link'
    | 'link-2'
    | 'loader'
    | 'login'
    | 'logout'
    | 'map'
    | 'map-pin'
    | 'maximize'
    | 'maximize-2'
    | 'meh'
    | 'menu'
    | 'message-circle'
    | 'message-square'
    | 'mic'
    | 'mic-off'
    | 'minimize'
    | 'minimize-2'
    | 'minus'
    | 'minus-circle'
    | 'minus-square'
    | 'monitor'
    | 'moon'
    | 'more-horizontal'
    | 'more-vertical'
    | 'mouse-pointer'
    | 'move'
    | 'music'
    | 'navigation-2'
    | 'navigation'
    | 'octagon'
    | 'package'
    | 'paperclip'
    | 'pause-circle'
    | 'pen-tool'
    | 'percent'
    | 'phone'
    | 'phone-call'
    | 'phone-forwarded'
    | 'phone-incoming'
    | 'phone-missed'
    | 'phone-off'
    | 'phone-outgoing'
    | 'pie-chart'
    | 'play-circle'
    | 'plus-circle'
    | 'plus-square'
    | 'pocket'
    | 'power'
    | 'printer'
    | 'radio'
    | 'refresh-cw'
    | 'refresh-ccw'
    | 'repeat'
    | 'rewind'
    | 'rotate-ccw'
    | 'rotate-cw'
    | 'rss'
    | 'scissors'
    | 'server'
    | 'share'
    | 'share-2'
    | 'shield'
    | 'shield-off'
    | 'shopping-bag'
    | 'shopping-cart'
    | 'shuffle'
    | 'sidebar'
    | 'skip-back'
    | 'skip-forward'
    | 'slash'
    | 'sliders'
    | 'smartphone'
    | 'smile'
    | 'speaker'
    | 'stop-circle'
    | 'sun'
    | 'sunrise'
    | 'sunset'
    | 'tablet'
    | 'tag'
    | 'target'
    | 'terminal'
    | 'thermometer'
    | 'thumbs-down'
    | 'thumbs-up'
    | 'toggle-left'
    | 'toggle-right'
    | 'tool'
    | 'trash-2'
    | 'triangle'
    | 'truck'
    | 'tv'
    | 'type'
    | 'umbrella'
    | 'underline'
    | 'upload-cloud'
    | 'user-check'
    | 'user-minus'
    | 'user-plus'
    | 'user-x'
    | 'users'
    | 'video'
    | 'video-off'
    | 'voicemail'
    | 'volume'
    | 'volume-1'
    | 'volume-2'
    | 'volume-x'
    | 'watch'
    | 'wifi'
    | 'wifi-off'
    | 'wind'
    | 'x-circle'
    | 'x-square'
    | 'x-octagon'
    | 'zap-off'
    | 'zoom-in'
    | 'zoom-out'

/**
 * Union type of all UI extension types.
 */
type UIExtension =
    | UIExtensionContextMenuButton
    | UIExtensionScriptPanel
    | UIExtensionToolbarButton
    | UIExtensionToolboxOption
    | UIExtensionSidebarPanel
    | UIExtensionLorebookPanel

/**
 * A button that appears in the editor's context menu.
 */
type UIExtensionContextMenuButton = {
    type: 'contextMenuButton'
    /** Unique identifier for this UIExtension */
    id?: string
    /** Text to display on the button */
    text: string
    /** Callback function when clicked. An object containing the users current selection is passed as an argument. */
    callback: (_: { selection: DocumentSelection }) => void
}

/**
 * A script panel that appears below the editor. It can be opened and closed by the user.
 */
type UIExtensionScriptPanel = {
    type: 'scriptPanel'
    /** Unique identifier for this UIExtension */
    id?: string
    /** Name displayed in the panel list */
    name: string
    /** An id of an icon to display in the panel list left of the text */
    iconId?: IconId
    /** UI components to render in the panel */
    content: UIPart[]
}

/**
 * A panel that appears in the infobar (right sidebar). If there are multiple, they appear as tabs within the infobar tab.
 */
type UIExtensionSidebarPanel = {
    type: 'sidebarPanel'
    /** Unique identifier for this UIExtension */
    id?: string
    /** Name displayed in the sidebar tab list */
    name: string
    /** An id of an icon to display in the sidebar tab list left of the text */
    iconId?: IconId
    /** UI components to render in the sidebar panel */
    content: UIPart[]
}

/**
 * A panel that appears in the lorebook. If defined, a "Script" tab will appear in the lorebook
 * when an entry or category is selected. If multiple scripts define this, they will appear as
 * tabs within that "Script" tab.
 */
type UIExtensionLorebookPanel = {
    type: 'lorebookPanel'
    /** Unique identifier for this UIExtension */
    id?: string
    /** Name displayed in the lorebook panel tab list */
    name: string
    /** An id of an icon to display in the lorebook panel tab list left of the text */
    iconId?: string
    /** UI components to render in the lorebook panel */
    content: UIPart[]
}

/**
 * A button in a toolbar just above the normal editor controls.
 */
type UIExtensionToolbarButton = {
    type: 'toolbarButton'
    /** Unique identifier for this UIExtension */
    id?: string
    /** Text to display on the button */
    text?: string
    /** An id of an icon to display on the left side of the button */
    iconId?: IconId
    /** Whether the button is disabled */
    disabled?: boolean
    /** Whether the button should be disabled while the callback is running */
    disabledWhileCallbackRunning?: boolean
    /** Callback when clicked */
    callback?: () => void
}

/**
 * An option in the writer's toolbox.
 */
type UIExtensionToolboxOption = {
    type: 'toolboxOption'
    /** Unique identifier for this UIExtension */
    id?: string
    /** Name displayed in the option */
    name: string
    /** Description at the top of the writer's toolbox menu when selected */
    description?: string
    /** An id of an icon to display on the toolbox option's button */
    iconId?: IconId
    /** Callback that's called when the "Adjust" button is clicked. The an object with the selection and the text of that selection is passed as an argument. */
    callback?: ((_: { selection: DocumentSelection; text: string }) => void) | string
    /** Optional UI to be shown in the writer's toolbox menu */
    content?: UIPart[]
}

/**
 * Union type of all UIParts. The component objects can be used to build the UI.
 */
type UIPart =
    | UIPartBox
    | UIPartButton
    | UIPartCheckboxInput
    | UIPartColumn
    | UIPartContainer
    | UIPartImage
    | UIPartMultilineTextInput
    | UIPartNumberInput
    | UIPartRow
    | UIPartText
    | UIPartTextInput
    | UIPartCollapsibleSection
    | UIPartSliderInput
    | UIPartCodeEditor
    | null

/**
 * A styled container box for grouping UI elements.
 */
type UIPartBox = {
    type: 'box'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Child components to render inside the box */
    content: UIPart[]
    /** Custom CSS styles */
    style?: any
}

/**
 * A clickable button component.
 */
type UIPartButton = {
    type: 'button'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Button text label */
    text?: string
    /** An id of an icon to display on the left side of the button */
    iconId?: IconId
    /** Callback when clicked */
    callback: () => void
    /** Whether the button is disabled */
    disabled?: boolean
    /** Whether the button should be disabled while the callback is running */
    disabledWhileCallbackRunning?: boolean
    /** Custom CSS styles */
    style?: any
}

/**
 * A checkbox input.
 */
type UIPartCheckboxInput = {
    type: 'checkboxInput'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Initial checked state */
    initialValue?: boolean
    /** Storage key for persisting the value. If set, the value of the checkbox in the UI will be synced with this key. For historyStorage, prefix with "history:". For storyStorage, prefix with "story:" */
    storageKey?: string
    /** Callback when value changes */
    onChange?: (value: boolean) => void
    /** Whether the input is disabled */
    disabled?: boolean
    /** Label text displayed next to the checkbox */
    label?: string
    /** Custom CSS styles */
    style?: any
}

/**
 * A vertical column layout container with flexbox properties.
 */
type UIPartColumn = {
    type: 'column'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Child components arranged vertically */
    content: UIPart[]
    /** Vertical spacing/justification */
    spacing?: 'center' | 'end' | 'space-around' | 'space-between' | 'start'
    /** Horizontal alignment */
    alignment?: 'center' | 'end' | 'start'
    /** Whether items can wrap to next line */
    wrap?: boolean
    /** Custom CSS styles */
    style?: any
}

/**
 * A generic container for UI elements. Renders as a div with no special styling.
 */
type UIPartContainer = {
    type: 'container'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Custom CSS styles */
    style?: any
    /** Child components to render */
    content: UIPart[]
}

/**
 * An image component that displays from a base64 data URI.
 */
type UIPartImage = {
    type: 'image'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Image data as a base64 data URI (e.g., "data:image/png;base64,..."). URLs are not supported for security reasons */
    src: string
    /** Alt text for accessibility */
    alt?: string
    /** Image height in pixels */
    height?: number
    /** Image width in pixels */
    width?: number
    /** Custom CSS styles */
    style?: any
}

/**
 * A multi-line text input (textarea).
 */
type UIPartMultilineTextInput = {
    type: 'multilineTextInput'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Initial text value */
    initialValue?: string
    /** Storage key for persisting the value. If set, the value of the input in the UI will be synced with this key. For historyStorage, prefix with "history:". For storyStorage, prefix with "story:" */
    storageKey?: string
    /** Callback when value changes. */
    onChange?: (value: string) => void
    /** Callback when submitted (e.g., Ctrl+Enter). */
    onSubmit?: (value: string) => void
    /** Whether the input is disabled */
    disabled?: boolean
    /** Label text displayed above the input */
    label?: string
    /** Placeholder text when empty */
    placeholder?: string
    /** Custom CSS styles */
    style?: any
}

/**
 * A numeric input field.
 */
type UIPartNumberInput = {
    type: 'numberInput'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Initial numeric value */
    initialValue?: number
    /** Storage key for persisting the value. If set, the value of the input in the UI will be synced with this key. For historyStorage, prefix with "history:". For storyStorage, prefix with "story:" */
    storageKey?: string
    /** Callback when value changes */
    onChange?: (value: string) => void
    /** Callback when submitted (e.g., Enter key). */
    onSubmit?: (value: string) => void
    /** Whether the input is disabled */
    disabled?: boolean
    /** Label text displayed above the input */
    label?: string
    /** Placeholder text when empty */
    placeholder?: string
    /** Custom CSS styles */
    style?: any
}

/**
 * A horizontal row layout container with flexbox properties.
 */
type UIPartRow = {
    type: 'row'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Child components arranged horizontally */
    content: UIPart[]
    /** Horizontal spacing/justification */
    spacing?: 'center' | 'end' | 'space-around' | 'space-between' | 'start'
    /** Vertical alignment */
    alignment?: 'center' | 'end' | 'start'
    /** Whether items can wrap to next line */
    wrap?: boolean
    /** Custom CSS styles */
    style?: any
}

/**
 * A text display component with optional markdown rendering.
 */
type UIPartText = {
    type: 'text'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Text content to display. Text in {{curly braces}} will be processed as template storage keys and replaced with their values. */
    text?: string
    /** Whether to render text as markdown */
    markdown?: boolean
    /** Custom CSS styles */
    style?: any
    /** If true, don't process template storage keys in the text */
    noTemplate?: boolean
}

/**
 * A single-line text input with optional storage persistence.
 */
type UIPartTextInput = {
    type: 'textInput'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Initial text value */
    initialValue?: string
    /** Storage key for persisting the value. If set, the value of the input in the UI will be synced with this key. For historyStorage, prefix with "history:". For storyStorage, prefix with "story:" */
    storageKey?: string
    /** Callback when value changes. */
    onChange?: (value: string) => void
    /** Callback when submitted (e.g., Enter key). */
    onSubmit?: (value: string) => void
    /** Whether the input is disabled */
    disabled?: boolean
    /** Label text displayed above the input */
    label?: string
    /** Placeholder text when empty */
    placeholder?: string
    /** Custom CSS styles */
    style?: any
}

/**
 * A collapsible section that can expand/collapse to show/hide content.
 */
type UIPartCollapsibleSection = {
    type: 'collapsibleSection'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Title displayed in the collapsible section header */
    title: string
    /** Whether the section starts collapsed. Default is false (expanded) */
    initialCollapsed?: boolean
    /** Storage key for persisting collapsed state. If set, the collapsed state will be synced with this key. For historyStorage, prefix with "history:". For storyStorage, prefix with "story:" */
    storageKey?: string
    /** An id of an icon to display in the header left of the title */
    iconId?: IconId
    /** Child components to render inside the collapsible section */
    content: UIPart[]
    /** Custom CSS styles */
    style?: any
}

/**
 * A slider input with direct value editing capability.
 */
type UIPartSliderInput = {
    type: 'sliderInput'
    /** Optional ID for updating this UIPart */
    id?: string
    /** Initial numeric value */
    initialValue?: number
    /** Storage key for persisting the value. If set, the value will be synced with this key. For historyStorage, prefix with "history:". For storyStorage, prefix with "story:" */
    storageKey?: string
    /** Callback when value changes */
    onChange?: (value: number) => void
    /** Label text displayed above the slider */
    label?: string
    /** Minimum value (required) */
    min: number
    /** Maximum value (required) */
    max: number
    /** Step increment. Default is 1 */
    step?: number
    /** Whether to prevent decimal values */
    preventDecimal?: boolean
    /** Whether to allow typing values below min */
    uncapMin?: boolean
    /** Whether to allow typing values above max */
    uncapMax?: boolean
    /** Text shown before the value (e.g., "$") */
    prefix?: string
    /** Text shown after the value (e.g., "%", "px") */
    suffix?: string
    /** Delay in milliseconds before onChange fires after slider movement. Default is 250 */
    changeDelay?: number
    /** Whether the slider is disabled */
    disabled?: boolean
    /** Default value, shown in the UI and can be clicked to reset the value  */
    defaultValue?: number
    /** Custom CSS styles */
    style?: any
}

/**
 * A Monaco code editor for editing code with syntax highlighting.
 */
type UIPartCodeEditor = {
    type: 'codeEditor'
    /** ID for updating this UIPart and distinguishing the editor instance */
    id: string
    /** Initial code content */
    initialValue?: string
    /** Storage key for persisting the code. If set, the code will be synced with this key. For historyStorage, prefix with "history:". For storyStorage, prefix with "story:" */
    storageKey?: string
    /** Callback when code changes */
    onChange?: (value: string) => void
    /** Language for syntax highlighting. Default is 'typescript' */
    language?: 'typescript' | 'javascript' | 'json' | 'markdown' | 'html' | 'css' | 'plaintext'
    /** Editor height in pixels or CSS string (e.g., "300px", "50%"). Default is 300 */
    height?: number | string
    /** Whether the editor is read-only */
    readOnly?: boolean
    /** Whether to show line numbers. Default is true */
    lineNumbers?: boolean
    /** Whether to enable word wrap. Default is true */
    wordWrap?: boolean
    /** Font size in pixels. Default is 14 */
    fontSize?: number
    /** Diagnostic codes to be ignored (suppresses error/warning messages for these codes) */
    diagnosticCodesToIgnore?: number[]
    /** Custom CSS styles for the container */
    style?: any
}

/**
 * Configuration for a floating window.
 */
type WindowOptions = {
    /** Unique identifier for the window */
    id?: string
    /** Default width (number for pixels, or percentage string like "50%") */
    defaultWidth?: number | string
    /** Default height (number for pixels, or percentage string like "50%") */
    defaultHeight?: number | string
    /** Default X position (left edge) */
    defaultX?: number | string
    /** Default Y position (top edge) */
    defaultY?: number | string
    /** Minimum width constraint */
    minWidth?: number | string
    /** Minimum height constraint */
    minHeight?: number | string
    /** Maximum width constraint */
    maxWidth?: number | string
    /** Maximum height constraint */
    maxHeight?: number | string
    /** Whether the window can be resized */
    resizable?: boolean
    /** Title displayed in the window header */
    title?: string
    /** UI components to render inside the window */
    content: UIPart[]
}

type UIToastOptions = {
    /** An id for the toast. If a toast with the same id exists, it will be updated instead of creating a new one */
    id?: string
    /** Duration in milliseconds before the toast automatically closes. Default is 3000 (3 seconds). Set to false to disable auto-close */
    autoClose?: number | false
    /** Type of toast for styling */
    type?: 'info' | 'success' | 'warning' | 'error'
}

interface CancellationSignal {
    /**
     * Indicates whether the operation has been cancelled.
     */
    readonly cancelled: boolean
    /**
     * Attempts to cancel the operation.
     */
    cancel(): Promise<void>
    /**
     * Releases any resources held by the signal.
     */
    dispose(): void
}

/**
 * Configuration for creating a RolloverHelper.
 */
type RolloverHelperConfig = {
    /** Maximum number of tokens before rollover is triggered */
    maxTokens: number
    /** Additional tokens allowed before trimming back to maxTokens */
    rolloverTokens: number
    /** Model name to use for tokenization when tokens are not provided */
    model: string
}

/**
 * Base type for objects that can be added to a RolloverHelper.
 * Must have a content property that is a string.
 */
type RolloverHelperContentObject = {
    /** The string content to be tokenized */
    content: string
    /** Optional pre-computed token count. If not provided, content will be tokenized. */
    tokens?: number
    [key: string]: unknown
}

/**
 * An item to add to a RolloverHelper.
 * Can be a plain string or any object with a content string property.
 */
type RolloverHelperItem<T extends RolloverHelperContentObject = RolloverHelperContentObject> = string | T

/**
 * An item stored in the RolloverHelper with its token count.
 * Preserves the original object shape with a guaranteed tokens property.
 */
type RolloverHelperStoredItem<T extends RolloverHelperContentObject = RolloverHelperContentObject> = T & {
    /** The token count for this content */
    tokens: number
}

/**
 * A helper for managing a sliding window of items within a token budget.
 * Items are added to the helper, and when the total tokens exceed maxTokens + rolloverTokens,
 * older items are trimmed until the total fits within maxTokens.
 */
interface RolloverHelper<T extends RolloverHelperContentObject = RolloverHelperContentObject> {
    /**
     * Add one or more items to the helper.
     * Items without a tokens property will be automatically tokenized using the configured model.
     * @param item A single item or array of items to add. Can be strings or objects with a content property.
     * @returns Promise that resolves when all items have been added
     * @example
     * // Add a plain string (will be tokenized)
     * await helper.add("Hello, world!");
     *
     * // Add an object with content (will be tokenized)
     * await helper.add({ role: "user", content: "Hello!" });
     *
     * // Add with pre-computed tokens
     * await helper.add({ role: "assistant", content: "Hi there!", tokens: 5 });
     *
     * // Add multiple items at once
     * await helper.add([
     *   { role: "user", content: "First message" },
     *   { role: "assistant", content: "Second message", tokens: 10 }
     * ]);
     */
    add(item: RolloverHelperItem<T> | RolloverHelperItem<T>[]): Promise<void>

    /**
     * Read all items in the current window and update the start position.
     * If the total tokens exceed maxTokens + rolloverTokens, items are trimmed from the start
     * until the total fits within maxTokens.
     * @returns Array of stored items (original objects with guaranteed tokens property)
     * @example
     * const messages = helper.read();
     * // Returns: [{ role: "user", content: "...", tokens: 10 }, ...]
     */
    read(): RolloverHelperStoredItem<T>[]

    /**
     * Peek at items that would be returned by read() without updating the start position.
     * @returns Array of stored items (original objects with guaranteed tokens property)
     */
    peek(): RolloverHelperStoredItem<T>[]

    /**
     * Get all items stored in the helper, including those before the current start position.
     * @returns Array of all stored items
     */
    getAll(): RolloverHelperStoredItem<T>[]

    /**
     * Get the total token count of items that would be returned by read().
     * @returns Total number of tokens
     */
    totalTokens(): number

    /**
     * Get the number of items that would be returned by read().
     * @returns Number of active items
     */
    count(): number

    /**
     * Remove the last n entries from the helper.
     * The starting position is kept within bounds but otherwise not updated.
     * @param n Number of entries to remove from the end
     */
    remove(n: number): void

    /**
     * Clear all items and reset the helper.
     */
    clear(): void

    /**
     * Remove items that have been trimmed from memory.
     * Call this periodically to free memory if you're adding many items over time.
     */
    compact(): void

    /**
     * Get the current configuration.
     * @returns The configuration object
     */
    getConfig(): RolloverHelperConfig
}

type ScriptPermission =
    | 'clipboardWrite'
    | 'fileDownload'
    | 'fileInput'
    | 'storyEdit'
    | 'documentEdit'
    | 'lorebookEdit'
    | 'editorDecorations'

/**
 * A position in the document for decoration placement.
 */
type DecorationPosition = {
    /** The section (paragraph) ID */
    sectionId: number
    /** Character offset within the section */
    offset: number
}

/**
 * Scope limiting which sections decorations apply to.
 */
type DecorationSectionScope = {
    /** Only apply to these section IDs */
    sectionIds?: number[]
}

/**
 * A pattern-based decoration rule for automatic highlighting.
 */
type DecorationRule = {
    /** Unique identifier for the rule */
    id: string
    /** Decoration type */
    type: 'inline' | 'node'
    /** Regular expression pattern as a string (or RegExp object, which will be serialized) */
    match: string | RegExp
    /** Regular expression flags (e.g., "gi" for global case-insensitive). Only used if match is a string. */
    flags?: string
    /** Style to apply to matches */
    style: Record<string, string>
    /** Limit rule to specific sections */
    scope?: DecorationSectionScope
}

/**
 * Information about an inline marker (character-level decoration).
 */
type DecorationInlineMarkerInfo = {
    /** The marker ID */
    id: string
    /** Marker type */
    type: 'inline'
    /** Start position */
    from: DecorationPosition
    /** End position */
    to: DecorationPosition
    /** Applied style */
    style: Record<string, string>
}

/**
 * Information about a node marker (paragraph-level decoration).
 */
type DecorationNodeMarkerInfo = {
    /** The marker ID */
    id: string
    /** Marker type */
    type: 'node'
    /** Section ID the marker is attached to */
    sectionId: number
    /** Applied style */
    style: Record<string, string>
}

/**
 * Union type for marker info.
 */
type DecorationMarkerInfo = DecorationInlineMarkerInfo | DecorationNodeMarkerInfo

/**
 * Event fired when a marker's position changes due to document edits.
 */
type DecorationMarkerChangeEvent = {
    /** Event type */
    type: 'change'
    /** Updated marker information */
    info: DecorationMarkerInfo
}

/**
 * Event fired when a marker is automatically disposed due to document edits.
 */
type DecorationMarkerDisposeEvent = {
    /** Event type */
    type: 'dispose'
    /** Reason for disposal */
    reason: 'collapsed' | 'sectionRemoved'
}

/**
 * Union type for marker events.
 */
type DecorationMarkerEvent = DecorationMarkerChangeEvent | DecorationMarkerDisposeEvent

/**
 * Options for creating an inline marker (highlights a range of text).
 */
type DecorationCreateInlineMarkerOptions = {
    /** Optional unique identifier (auto-generated if not provided) */
    id?: string
    /** Marker type */
    type: 'inline'
    /** Start position */
    from: DecorationPosition
    /** End position */
    to: DecorationPosition
    /** Style to apply */
    style: Record<string, string>
    /**
     * Callback invoked when the marker changes position or is disposed.
     * The editor will not wait for this callback to finish and will continue handling edits.
     * @param event - The change or dispose event
     */
    onChange?: (event: DecorationMarkerEvent) => void
}

/**
 * Options for creating a node marker (styles an entire paragraph).
 */
type DecorationCreateNodeMarkerOptions = {
    /** Optional unique identifier (auto-generated if not provided) */
    id?: string
    /** Marker type */
    type: 'node'
    /** Section ID to attach the marker to */
    sectionId: number
    /** Style to apply */
    style: Record<string, string>
    /**
     * Callback invoked when the marker changes position or is disposed.
     * The editor will not wait for this callback to finish and will continue handling edits.
     * @param event - The change or dispose event
     */
    onChange?: (event: DecorationMarkerEvent) => void
}

/**
 * Options for updating a marker.
 */
type DecorationUpdateMarkerOptions = {
    /** New style (replaces existing) */
    style?: Record<string, string>
    /** For inline markers: new start position */
    from?: DecorationPosition
    /** For inline markers: new end position */
    to?: DecorationPosition
    /** For node markers: new section ID */
    sectionId?: number
}

/**
 * Information about an inline widget decoration.
 */
type DecorationInlineWidgetInfo = {
    /** The widget ID */
    id: string
    /** Position in the document */
    position: DecorationPosition
}

/**
 * Information about a node widget decoration.
 */
type DecorationNodeWidgetInfo = {
    /** The widget ID */
    id: string
    /** Section ID the widget is attached to */
    sectionId: number
}

/**
 * Union type for widget info.
 */
type DecorationWidgetInfo = DecorationInlineWidgetInfo | DecorationNodeWidgetInfo

/**
 * Event fired when a widget's position changes due to document edits.
 */
type DecorationWidgetChangeEvent = {
    /** Event type */
    type: 'change'
    /** Updated widget information */
    info: DecorationWidgetInfo
}

/**
 * Event fired when a widget is automatically disposed due to document edits.
 */
type DecorationWidgetDisposeEvent = {
    /** Event type */
    type: 'dispose'
    /** Reason for disposal */
    reason: 'sectionRemoved'
}

/**
 * Union type for widget events.
 */
type DecorationWidgetEvent = DecorationWidgetChangeEvent | DecorationWidgetDisposeEvent

/**
 * Options for creating a widget that appears inline with text.
 */
type DecorationCreateInlineWidgetOptions = {
    /** Widget type */
    type: 'inline'
    /** Optional unique identifier (auto-generated if not provided) */
    id?: string
    /** Position to insert the widget */
    position: DecorationPosition
    /** UI components to render */
    content: UIPart[]
    /** Whether the widget appears before or after the cursor at this position */
    side?: 'before' | 'after'
    /** The display style of the widget's container */
    display?: 'block' | 'inline' | 'inline-block'
    /**
     * Callback invoked when the widget changes position or is disposed.
     * The editor will not wait for this callback to finish and will continue handling edits.
     * @param event - The change or dispose event
     */
    onChange?: (event: DecorationWidgetEvent) => void
}

/**
 * Options for creating a widget that appears between paragraphs.
 */
type DecorationCreateNodeWidgetOptions = {
    /** Widget type */
    type: 'node'
    /** Optional unique identifier (auto-generated if not provided) */
    id?: string
    /** Section to insert the widget after. 0 means before the first section */
    sectionId: number
    /** UI components to render */
    content: UIPart[]
    /** Whether the widget appears before or after the cursor at this position */
    side?: 'before' | 'after'
    /** The display style of the widget's container */
    display?: 'block' | 'inline' | 'inline-block'
    /**
     * Callback invoked when the widget changes position or is disposed.
     * The editor will not wait for this callback to finish and will continue handling edits.
     * @param event - The change or dispose event
     */
    onChange?: (event: DecorationWidgetEvent) => void
}

/**
 * Options for updating a widget.
 */
type DecorationUpdateInlineWidgetOptions = {
    /** New UI content */
    content?: UIPart[]
    /** New position */
    position?: DecorationPosition
    /** Whether the widget appears before or after the cursor at this position */
    side?: 'before' | 'after'
    /** The display style of the widget's container */
    display?: 'block' | 'inline' | 'inline-block'
}

/**
 * Options for updating a block widget.
 */
type DecorationUpdateNodeWidgetOptions = {
    /** New UI content */
    content?: UIPart[]
    /** New section ID to insert after */
    sectionId?: number
    /** Whether the widget appears before or after the cursor at this position */
    side?: 'before' | 'after'
    /** The display style of the widget's container */
    display?: 'block' | 'inline' | 'inline-block'
}

type DecorationUpdateWidgetOptions = DecorationUpdateInlineWidgetOptions | DecorationUpdateNodeWidgetOptions

type DecorationCreateWidgetOptions = DecorationCreateInlineWidgetOptions | DecorationCreateNodeWidgetOptions

/**
 * Handle for controlling a marker after creation.
 */
type DecorationMarkerHandle = {
    /** The marker ID */
    readonly id: string
    /**
     * Get current marker information.
     * @returns Promise resolving to marker info or null if disposed
     */
    getInfo(): Promise<DecorationMarkerInfo | null>
    /**
     * Update the marker's properties.
     * @param options Properties to update
     * @returns Promise that resolves when updated
     */
    update(options: DecorationUpdateMarkerOptions): Promise<void>
    /**
     * Remove the marker from the document.
     * @returns Promise that resolves when disposed
     */
    dispose(): Promise<void>
}

/**
 * Handle for controlling a widget after creation.
 */
type DecorationWidgetHandle<T extends DecorationCreateWidgetOptions = DecorationCreateWidgetOptions> = {
    /** The widget ID */
    readonly id: string
    /**
     * Get current widget information.
     * @returns Promise resolving to widget info or null if disposed
     */
    getInfo(): Promise<
        T extends DecorationCreateInlineWidgetOptions
            ? DecorationInlineWidgetInfo
            : DecorationNodeWidgetInfo | null
    >
    /**
     * Update the widget's content or position.
     * @param options Properties to update
     * @returns Promise that resolves when updated
     */
    update(
        options: T extends DecorationCreateInlineWidgetOptions
            ? DecorationUpdateInlineWidgetOptions
            : DecorationUpdateNodeWidgetOptions
    ): Promise<void>
    /**
     * Remove the widget from the document.
     * @returns Promise that resolves when disposed
     */
    dispose(): Promise<void>
}

// ============================================================================
// Main API Namespace
// ============================================================================

/**
 * Main API - namespace for userscript functionality.
 * All API methods are accessed through api.v1.*
 */
declare namespace api {
    /**
     * Version 1 of the Scripting API.
     * This is the current stable API version.
     */
    namespace v1 {
        /**
         * Script Info API - Static, read-only information about the running script.
         */
        namespace script {
            /**
             * The unique identifier of the running script.
             */
            const id: string

            /**
             * The name of the running script.
             */
            const name: string

            /**
             * The version of the running script.
             */
            const version: string

            /**
             * The description of the running script.
             */
            const description: string

            /**
             * The author of the running script.
             */
            const author: string

            /**
             * The memory limit for the script in bytes.
             */
            const memoryLimit: number

            /**
             * Returns the current number of output tokens the script is allowed to request.
             * After consumption, the output tokens replenish over time as long as the user has interacted with the script recently.
             * @returns number of available output tokens
             */
            function getAllowedOutput(): number

            /**
             * Returns a promise that resolves when the allowed output tokens are at least the specified amount.
             * @param minTokens Minimum number of output tokens required
             * @returns Promise that resolves when allowed output tokens are at least minTokens
             */
            function waitForAllowedOutput(minTokens: number): Promise<void>

            /**
             * Returns the amount of time in milliseconds until the allowed output tokens are replenished up to the specified amount.
             * This does not take into account whether the user interaction flag is set on those tokens.
             * @param minTokens Minimum number of output tokens required
             * @returns Time in milliseconds until allowed output tokens reach minTokens
             */
            function getTimeUntilAllowedOutput(minTokens: number): number

            /**
             * Gets the current number of uncached input tokens the script is allowed to use.
             * After consumption, the input tokens replenish over time as long as the user has interacted with the script recently.
             * @returns number of available input tokens
             */
            function getAllowedInput(): number

            /**
             * Returns a promise that resolves when the allowed input tokens are at least the specified amount.
             * @param minTokens Minimum number of input tokens required
             * @returns Promise that resolves when allowed input tokens are at least minTokens
             */
            function waitForAllowedInput(minTokens: number): Promise<void>

            /**
             * Returns the amount of time in milliseconds until the allowed input tokens are replenished up to the specified amount.
             * This does not take into account whether the user interaction flag is set on those tokens.
             * @param minTokens Minimum number of input tokens required
             * @returns Time in milliseconds until allowed input tokens reach minTokens
             */
            function getTimeUntilAllowedInput(minTokens: number): number

            /**
             * Counts the number of uncached input tokens a given message array would consume were it used for generation.
             * @param messages Array of message objects to count tokens for
             * @returns Number of input tokens that would be consumed
             */
            function countUncachedInputTokens(messages: Message[]): number
        }

        /**
         * Author's Note API - Read and update the author's note.
         */
        namespace an {
            /**
             * Get the current author's note text.
             * @returns Promise resolving to the author's note content
             * @example
             * const text = await api.v1.an.get();
             * api.v1.log("Current author's note:", text);
             */
            function get(): Promise<string>

            /**
             * Set the author's note text.
             * Requires the "storyEdit" permission.
             * @param text The new author's note content
             * @returns Promise that resolves when the author's note is updated
             * @example
             * await api.v1.an.set("[ Style: descriptive and atmospheric ]");
             */
            function set(text: string): Promise<void>
        }

        /**
         * Comment Bot API - Control the comment bot (HypeBot) interface and behavior.
         */
        namespace commentBot {
            /**
             * Get the current comment bot configuration.
             * @returns Promise resolving to the bot's current state
             */
            function get(): Promise<{
                name: string
                state: null | string
                visible: boolean
                content: UIPart[]
                image?: null | string
            }>

            /**
             * Update the comment bot configuration.
             * @param data Configuration object with optional fields to update. null values will clear the field. state must be set to not null for the comment bot to become script-controlled.
             * @returns Promise that resolves when the bot is updated
             * @example
             * await api.v1.commentBot.update({
             *   name: "Euterpe",
             *   state: "speaking",
             *   visible: true,
             *   content: [{ type: "text", text: "I'm here to help!" }]
             * });
             */
            function update(data: {
                name?: string
                state?: null | string
                visible?: boolean
                content?: UIPart[]
                image?: null | string
                callback?: () => void
            }): Promise<void>
        }

        /**
         * Configuration API - Access script configuration values.
         */
        namespace config {
            /**
             * Get a configuration value by key.
             * @param key The configuration key to retrieve
             * @returns Promise resolving to the configuration value
             * @example
             * const player_name = await api.v1.config.get("player_name");
             */
            function get(key: string): Promise<any>
        }

        /**
         * Document API - Manipulate the story document.
         */
        namespace document {
            /**
             * Append text to the end of the document. Newlines in the text will create new paragraphs. Text is added with "script" origin.
             * Requires the "documentEdit" permission.
             * @param text The text to append
             * @returns Promise that resolves when text is added
             * @example
             * await api.v1.document.append("\nThe adventure continues...");
             */
            function append(text: string): Promise<void>

            /**
             * Append a new paragraph to the end of the document.
             * Requires the "documentEdit" permission.
             * @param section Partial section object with text and optional metadata. Empty fields will use defaults
             * @returns Promise that resolves when the paragraph is added
             * @example
             * await api.v1.document.appendParagraph({
             *   text: "A new paragraph appears.",
             * });
             */
            function appendParagraph(section: Partial<Section>): Promise<void>

            /**
             * Append multiple paragraphs to the end of the document.
             * Requires the "documentEdit" permission.
             * @param sections Array of partial section objects. Empty fields will use defaults
             * @returns Promise that resolves when all paragraphs are added
             * @example
             * await api.v1.document.appendParagraphs([
             *   { text: "First paragraph" },
             *   { text: "Second paragraph" }
             * ]);
             */
            function appendParagraphs(sections: Partial<Section>[]): Promise<void>

            /**
             * Insert a paragraph after a specific section.
             * Requires the "documentEdit" permission.
             * @param sectionId The ID of the section to insert after. Note that section IDs are not indexes.
             * @param section The new section to insert
             * @returns Promise that resolves when the paragraph is inserted
             * @example
             * await api.v1.document.insertParagraphAfter(2243261709665183, {
             *   text: "Inserted paragraph"
             * });
             */
            function insertParagraphAfter(sectionId: number, section: Partial<Section>): Promise<void>

            /**
             * Insert multiple paragraphs after a specific section.
             * Requires the "documentEdit" permission.
             * @param sectionId The ID of the section to insert after. Note that section IDs are not indexes.
             * @param sections Array of sections to insert
             * @returns Promise that resolves when all paragraphs are inserted
             */
            function insertParagraphsAfter(sectionId: number, sections: Partial<Section>[]): Promise<void>

            /**
             * Remove a paragraph from the document.
             * Requires the "documentEdit" permission.
             * @param sectionId The ID of the section to remove
             * @returns Promise that resolves when the paragraph is removed
             * @example
             * await api.v1.document.removeParagraph(835897208155866);
             */
            function removeParagraph(sectionId: number): Promise<void>

            /**
             * Remove multiple paragraphs from the document.
             * Requires the "documentEdit" permission.
             * @param sectionIds Array of section IDs to remove
             * @returns Promise that resolves when all paragraphs are removed
             * @example
             * await api.v1.document.removeParagraphs([404860073937026, 551077518188362, 842273775686437]);
             */
            function removeParagraphs(sectionIds: number[]): Promise<void>

            /**
             * Scan through all sections in the document.
             * @param callback Optional callback invoked for each section
             * @param range Optional range of section IDs to scan. If omitted, scans the entire document. If 'from' is omitted, starts at the beginning. If 'to' is omitted, goes to the end.
             * @returns Promise resolving to array of all sections with their IDs
             * @example
             * const sections = await api.v1.document.scan((id, section, index) => {
             *   api.v1.log(`Section ${index}: ${section.text.substring(0, 50)}...`);
             * });
             */
            function scan(
                callback?: (sectionId: number, section: Section, index: number) => void,
                range?: { from?: number; to?: number }
            ): Promise<{ sectionId: number; section: Section; index: number }[]>

            /**
             * Extract text from a selection range in the document.
             * @param selection The selection range with optional 'from' and 'to' positions. If 'from' is omitted, selection starts at the beginning of the document. If 'to' is omitted, selection goes to the end of the document.
             * @returns Promise resolving to the extracted text
             * @example
             * const text = await api.v1.document.textFromSelection({
             *   from: { sectionId: 1969803634580167, offset: 0 },
             *   to: { sectionId: 216998981796148, offset: 100 }
             * });
             */
            function textFromSelection(selection?: {
                from?: { sectionId: number; offset?: number }
                to?: { sectionId: number; offset?: number }
            }): Promise<string>

            /**
             * Update an existing paragraph in the document.
             * Requires the "documentEdit" permission.
             * @param sectionId The ID of the section to update
             * @param section Partial section object with fields to update
             * @returns Promise that resolves when the paragraph is updated
             * @example
             * await api.v1.document.updateParagraph(1368456327379069, {
             *   text: "Updated paragraph text"
             * });
             */
            function updateParagraph(sectionId: number, section: Partial<Section>): Promise<void>

            /**
             * Update multiple paragraphs in the document.
             * Requires the "documentEdit" permission.
             * @param updates Array of update objects with an ID and partial section data
             * @returns Promise that resolves when all paragraphs are updated
             * @example
             * await api.v1.document.updateParagraphs([
             * { sectionId: 1368456327379069, section: { text: "First updated paragraph" } },
             * { sectionId: 551077518188362, section: { text: "Second updated paragraph" } },
             * { sectionId: 842273775686437, section: { text: "Third updated paragraph" } }
             * ]);
             */
            function updateParagraphs(
                updates: {
                    sectionId: number
                    section: Partial<Section>
                }[]
            ): Promise<void>

            /**
             * Returns an array containing the ids of all sections in the document ordered from first to last.
             * @returns Promise resolving to an array of section IDs
             * @example
             * const sectionIds = await api.v1.document.sectionIds();
             * api.v1.log(`The document has ${sectionIds.length} sections.`);
             */
            function sectionIds(): Promise<number[]>

            /**
             * Document history API - Navigate and query the document's undo/redo history.
             */
            namespace history {
                /**
                 * Get the ID of the current history node.
                 * @returns Promise resolving to the current node ID
                 */
                function currentNodeId(): Promise<number>

                /**
                 * Get the ID of the most recent generation in history that was created as the result of text generation. This may be the current node or an earlier one.
                 * @returns Promise resolving to the node ID of the last generation or undefined if no node before the current one was a generation
                 */
                function mostRecentGenerationNodeId(): Promise<number | undefined>

                /**
                 * Get the ID of the previous history node.
                 * @returns Promise resolving to the previous node ID or undefined if there is no previous node
                 */
                function previousNodeId(): Promise<number | undefined>

                /**
                 * Redo the last undone action.
                 * @param nodeId The ID of the node to redo to. If not provided, will redo to the preferred child of the current node.
                 * @returns Promise resolving to true if redo was successful
                 */
                function redo(nodeId?: number): Promise<boolean>

                /**
                 * Undo the last action.
                 * @returns Promise resolving to true if undo was successful
                 */
                function undo(): Promise<boolean>

                /**
                 * Navigate to a specific history node and get information about the path and changes.
                 * This returns the path taken to reach the node (going backward to a common ancestor,
                 * then forward to the target), all changes along that path, and the document state at
                 * that node.
                 *
                 * @param nodeId The target history node ID
                 * @returns Promise resolving to information about the navigation, or undefined if the node doesn't exist
                 * @example
                 * const state = await api.v1.document.history.nodeState(someNodeId);
                 * if (state) {
                 *   api.v1.log(`Took ${state.backwardPath.length} steps back, ${state.forwardPath.length} forward`);
                 *   api.v1.log(`Document at target has ${state.sections.length} sections`);
                 * }
                 */
                function nodeState(nodeId: number): Promise<HistoryNodeState | undefined>

                /**
                 * Jump to a specific history node.
                 * @param nodeId The target history node ID
                 * @returns Promise resolving to true if the jump was successful
                 */
                function jump(nodeId: number): Promise<boolean>
            }
        }

        /**
         * Editor API - Control editor behavior and state.
         */
        namespace editor {
            /**
             * Trigger a generation at the end of the document, as if the user clicked the "Send" button.
             * @returns Promise that resolves when generation starts
             * @example
             * await api.v1.editor.generate();
             */
            function generate(): Promise<void>

            /**
             * Check if the editor is currently blocked. Changes to the document and editor generations are not allowed while the editor is blocked.
             * @returns Promise resolving to true if editor is blocked
             * @example
             * const blocked = await api.v1.editor.isBlocked();
             *
             * if (!blocked) {
             *   await api.v1.editor.generate();
             * }
             */
            function isBlocked(): Promise<boolean>

            /**
             * Editor selection API - Query and manipulate text selection.
             */
            namespace selection {
                /**
                 * Get the current selection range in the editor.
                 * @returns Promise resolving to a selection object
                 * @example
                 * const selection = await api.v1.editor.selection.get();
                 * api.v1.log(`Selected from section ${selection.from.sectionId}`);
                 */
                function get(): Promise<DocumentSelection>
            }

            /**
             * Decorations API - Add visual decorations to the editor.
             * Decorations include pattern-based highlights, markers, and widgets
             * that overlay the document without modifying its content.
             */
            namespace decorations {
                /**
                 * Register decoration rules for pattern-based highlighting.
                 * Rules automatically apply styles to text matching the patterns.
                 * Requests the "editorDecorations" permission.
                 * @param rules Array of decoration rules to register
                 * @example
                 * api.v1.editor.decorations.registerRules([
                 *   {
                 *     id: "highlight-names",
                 *     type: "inline",
                 *     match: "\\b(Alice|Bob)\\b",
                 *     flags: "gi",
                 *     style: { backgroundColor: "rgba(255, 255, 0, 0.3)" }
                 *   },
                 *   {
                 *     id: "highlight-dates",
                 *     type: "inline",
                 *     match: /\d{4}-\d{2}-\d{2}/g,
                 *     style: { color: "#0066cc", fontWeight: "bold" }
                 *   }
                 * ]);
                 */
                function registerRules(rules: DecorationRule[]): Promise<void>

                /**
                 * Update existing decoration rules.
                 * Requests the "editorDecorations" permission.
                 * @param updates Array of partial rule objects with IDs
                 * @example
                 * api.v1.editor.decorations.updateRules([
                 *   { id: "highlight-names", style: { backgroundColor: "rgba(0, 255, 0, 0.3)" } }
                 * ]);
                 */
                function updateRules(updates: (Partial<DecorationRule> & { id: string })[]): Promise<void>

                /**
                 * Remove decoration rules by ID.
                 * @param ids Array of rule IDs to remove
                 */
                function removeRules(ids: string[]): void

                /**
                 * Remove all decoration rules registered by this script.
                 */
                function clearRules(): void

                /**
                 * Get all currently registered decoration rules.
                 * @returns Promise resolving to array of rules
                 */
                function getRules(): Promise<DecorationRule[]>

                /**
                 * Create a new marker decoration.
                 * Inline markers highlight a range of text; node markers style entire paragraphs.
                 * Requests the "editorDecorations" permission.
                 * @param options Marker creation options
                 * @returns Promise resolving to a marker handle
                 * @example
                 * // Inline marker (highlight text range)
                 * const marker = await api.v1.editor.decorations.createMarker({
                 *   type: "inline",
                 *   from: { sectionId: 123, offset: 0 },
                 *   to: { sectionId: 123, offset: 10 },
                 *   style: { backgroundColor: "rgba(255, 0, 0, 0.2)" }
                 * });
                 *
                 * // Node marker (style entire paragraph)
                 * const nodeMarker = await api.v1.editor.decorations.createMarker({
                 *   type: "node",
                 *   sectionId: 456,
                 *   style: { backgroundColor: "rgba(0, 0, 255, 0.1)" }
                 * });
                 *
                 * // Later: update or remove
                 * await marker.update({ style: { backgroundColor: "yellow" } });
                 * await marker.dispose();
                 */
                function createMarker(
                    options: DecorationCreateInlineMarkerOptions | DecorationCreateNodeMarkerOptions
                ): Promise<DecorationMarkerHandle>

                /**
                 * Batch create multiple markers.
                 * Requests the "editorDecorations" permission.
                 * @param optionsList Array of marker creation options
                 * @returns Promise resolving to array of marker handles
                 * @example
                 * const markers = await api.v1.editor.decorations.createMarkers([
                 *   {
                 *     type: "inline",
                 *     from: { sectionId: 123, offset: 0 },
                 *     to: { sectionId: 123, offset: 5 },
                 *     style: { backgroundColor: "rgba(255, 0, 0, 0.2)" }
                 *   },
                 *   {
                 *     type: "node",
                 *     sectionId: 456,
                 *     style: { backgroundColor: "rgba(0, 0, 255, 0.1)" }
                 *   }
                 * ]);
                 */
                function createMarkers(
                    options: (DecorationCreateInlineMarkerOptions | DecorationCreateNodeMarkerOptions)[]
                ): Promise<DecorationMarkerHandle[]>

                /**
                 * Get a marker by ID.
                 * @param id The marker ID
                 * @returns Promise resolving to marker info or null if not found
                 */
                function getMarker(id: string): Promise<DecorationMarkerInfo | null>

                /**
                 * Get all markers created by this script.
                 * @returns Promise resolving to array of marker info
                 */
                function getMarkers(): Promise<DecorationMarkerInfo[]>

                /**
                 * Remove all markers created by this script.
                 */
                function clearMarkers(): void

                /**
                 * Create a new inline widget.
                 * Widgets render UI components at a specific position in the document.
                 * Requests the "editorDecorations" permission.
                 * @param options Widget creation options
                 * @returns Promise resolving to a widget handle
                 * @example
                 * const widget = await api.v1.editor.decorations.createWidget({
                 *   type: "inline",
                 *   position: { sectionId: 123, offset: 5 },
                 *   content: [
                 *     api.v1.ui.part.button({
                 *       text: "Button",
                 *       callback: () => api.v1.log("Widget clicked!")
                 *     })
                 *   ],
                 * });
                 *
                 * // Later: update content or remove
                 * await widget.update({
                 *   content: [api.v1.ui.part.text({ text: "Updated!" })]
                 * });
                 * await widget.dispose();
                 */
                function createWidget<
                    T extends DecorationCreateWidgetOptions = DecorationCreateWidgetOptions
                >(options: T): Promise<DecorationWidgetHandle<T>>

                /**
                 * Batch create multiple widgets.
                 * Requests the "editorDecorations" permission.
                 * @param optionsList Array of widget creation options
                 * @returns Promise resolving to array of widget handles
                 * @example
                 * const widgets = await api.v1.editor.decorations.createWidgets([
                 *   {
                 *     type: "inline",
                 *     position: { sectionId: 123, offset: 5 },
                 *     content: [
                 *       api.v1.ui.part.text({ text: "First widget" })
                 *     ],
                 *   },
                 *   {
                 *     type: "node",
                 *     sectionId: 456,
                 *     content: [
                 *       api.v1.ui.part.text({ text: "Second widget" })
                 *     ],
                 *   }
                 * ]);
                 */
                function createWidgets<
                    T extends DecorationCreateWidgetOptions = DecorationCreateWidgetOptions
                >(options: T[]): Promise<DecorationWidgetHandle<T>[]>

                /**
                 * Get a widget by ID.
                 * @param id The widget ID
                 * @returns Promise resolving to widget info or null if not found
                 */
                function getWidget(id: string): Promise<DecorationWidgetInfo | null>

                /**
                 * Get all widgets created by this script.
                 * @returns Promise resolving to array of widget info
                 */
                function getWidgets(): Promise<DecorationWidgetInfo[]>

                /**
                 * Remove all widgets created by this script.
                 */
                function clearWidgets(): void

                /**
                 * Remove all decorations (rules, markers, and widgets) created by this script.
                 * @example
                 * // Clean up all decorations
                 * api.v1.editor.decorations.clearAll();
                 */
                function clearAll(): void
            }
        }

        /**
         * Log a message to the console.
         * @param messages Messages to log
         * @example
         * api.v1.log("Script started", { timestamp: Date.now() });
         */
        function log(...messages: any): void

        /**
         * Log an error message to the console.
         * @param messages Messages to log
         * @example
         * api.v1.error("Something went wrong:", errorObject);
         */
        function error(...messages: any): void

        /**
         * Create a cancellation signal that can be used to cancel ongoing operations.
         * @returns A promise resolving to a CancellationSignal object
         * @example
         * const signal = await api.v1.createCancellationSignal();
         * setTimeout(() => {
         *   signal.cancel();
         * }, 5000); // Cancel after 5 seconds
         *
         * const response = await api.v1.generate(
         *   [{ role: "user", content: "Tell me a long story..." }],
         *   { model: "glm-4-6", max_tokens: 1000 },
         *   undefined,
         *   'background',
         *   signal
         * );
         */
        function createCancellationSignal(): Promise<CancellationSignal>

        /**
         * Create a rollover helper for managing a sliding window of items within a token budget.
         * Useful for maintaining conversation history or context that stays within token limits.
         *
         * The helper automatically tokenizes content when tokens are not provided, using the
         * configured model's tokenizer.
         *
         * @param config Configuration specifying maxTokens, rolloverTokens, and model
         * @returns A RolloverHelper instance
         */
        function createRolloverHelper<T extends RolloverHelperContentObject = RolloverHelperContentObject>(
            config: RolloverHelperConfig
        ): RolloverHelper<T>

        /**
         * Generate text. Currently only supports chat-style generation with message arrays using GLM 4.6
         * @param messages Array of message objects for context
         * @param params Generation parameters (model, temperature, etc.)
         * @param callback Optional streaming callback for partial results
         * @param behaviour Whether to run in background or block the UI.
         * @param signal Optional cancellation signal to cancel the generation. May not cancel immediately, but will stop as soon as possible
         * @returns Promise resolving to the complete generation response
         * @example
         * const response = await api.v1.generate(
         *   [{ role: "user", content: "What is the difference between izti and aaaa?" }],
         *   { model: "glm-4-6", max_tokens: 100, temperature: 0.8 }
         * );
         * api.v1.log(response.choices[0].text);
         */
        function generate(
            messages: Message[],
            params: GenerationParams,
            callback?: (choices: GenerationChoice[], final: boolean) => void,
            behaviour?: 'background' | 'blocking',
            signal?: CancellationSignal
        ): Promise<GenerationResponse>

        /**
         * Generate text including the story as context. A shortcut for calling buildContext and using those messages for generation. The context limit used for the buildContext will be automatically adjusted based on the provided messages.
         * @param messages An array of message objects to append after the built context
         * @param params Generation parameters (model, temperature, etc.)
         * @param options Additional options for context building
         * @param callback Optional streaming callback for partial results
         * @param behaviour Whether to run in background or block the UI.
         * @param signal Optional cancellation signal to cancel the generation. May not cancel immediately, but will stop as soon as possible
         * @returns Promise resolving to the complete generation response
         * @example
         * const response = await api.v1.generateWithStory(
         *   [{ role: "user", content: "Summarize what happened so far." }],
         *   { model: "glm-4-6", max_tokens: 150 }
         * );
         * api.v1.log(response.choices[0].text);
         */
        function generateWithStory(
            messages: Message[],
            params: GenerationParams,
            options?: {
                contextLimitReduction?: number
                position?: { sectionId: number; offset: number }
                suppressScriptHooks?: 'self' | 'all'
            },
            callback?: (choices: GenerationChoice[], final: boolean) => void,
            behaviour?: 'background' | 'blocking',
            signal?: CancellationSignal
        ): Promise<GenerationResponse>

        /**
         * Generation Parameters API - Get and set default generation parameters. Currently only supports parameters for chat-style generation with GLM 4.6.
         */
        namespace generationParameters {
            /**
             * Get the current generation parameters.
             * @returns Promise resolving to the current parameters
             */
            function get(): Promise<{
                model: string
                max_tokens?: number
                temperature?: number
                top_p?: number
                top_k?: number
                frequency_penalty?: number
                presence_penalty?: number
                min_p?: number
            }>

            /**
             * Update the current generation parameters. Only parameters provided in the object will be updated. Others will remain unchanged.
             * Requires the "storyEdit" permission.
             * @param params Parameters to update
             * @returns Promise that resolves when parameters are updated
             * @example
             * await api.v1.generationParameters.update({
             *   model: "glm-4-6",
             *   temperature: 0.7,
             *   max_tokens: 200
             * });
             */
            function update(params: {
                model?: string
                max_tokens?: number
                temperature?: number
                top_p?: number
                top_k?: number
                frequency_penalty?: number
                presence_penalty?: number
                min_p?: number
            }): Promise<void>
        }

        /**
         * Logprobs API - Set the current logprobs used for the display in the editor.
         */
        namespace logprobs {
            /**
             * Set log probability information for generated tokens.
             * @param logprobs Array of converted logprobs objects
             * @param model Model identifier that generated these. Determines which tokenizer will be used when handling them
             * @param offsetFromEnd Optional offset from end of text where these logprobs should start. Defaults to the 0, the end of the text
             * @returns Promise that resolves when logprobs are set
             */
            function set(logprobs: Logprobs[], model: string, offsetFromEnd?: number): Promise<void>

            /**
             * Get the current logprobs information.
             * @returns Promise resolving to the current logprobs and model, or null if no logprobs are set
             */
            function get(): Promise<{ logprobs: Logprobs[]; model: string } | null>
        }

        /**
         * Lorebook API - Manage lorebook entries and categories.
         */
        namespace lorebook {
            /**
             * Get all lorebook categories.
             * @returns Promise resolving to array of categories
             */
            function categories(): Promise<LorebookCategory[]>

            /**
             * Get a specific category by ID.
             * @param categoryId The category ID
             * @returns Promise resolving to the category or null if not found
             */
            function category(categoryId: string): Promise<LorebookCategory | null>

            /**
             * Create a new lorebook category.
             * @param category Category object to create
             * @returns Promise resolving to the new category ID
             * @example
             * const id = await api.v1.lorebook.createCategory({
             *   id: api.v1.uuid(),
             *   name: "Characters",
             *   enabled: true
             * });
             */
            function createCategory(category: Partial<LorebookCategory>): Promise<string>

            /**
             * Create a new lorebook entry.
             * @param entry Entry object to create
             * @returns Promise resolving to the new entry ID
             * @example
             * const id = await api.v1.lorebook.createEntry({
             *   id: api.v1.uuid(),
             *   displayName: "Main Character",
             *   text: "A brave adventurer...",
             *   keys: ["hero", "protagonist"]
             * });
             */
            function createEntry(entry: Partial<LorebookEntry>): Promise<string>

            /**
             * Remove a lorebook category.
             * @param id Category ID to remove
             * @returns Promise that resolves when removed
             */
            function removeCategory(id: string): Promise<void>

            /**
             * Remove a lorebook entry.
             * @param id Entry ID to remove
             * @returns Promise that resolves when removed
             */
            function removeEntry(id: string): Promise<void>

            /**
             * Get all lorebook entries, optionally filtered by category.
             * @param category Optional category ID to filter by
             * @returns Promise resolving to array of entries
             * @example
             * const allEntries = await api.v1.lorebook.entries();
             * const characterEntries = await api.v1.lorebook.entries(charactersCategoryId);
             */
            function entries(category?: null | string): Promise<LorebookEntry[]>

            /**
             * Get a specific lorebook entry by ID.
             * @param entryId The entry ID
             * @returns Promise resolving to the entry or null if not found
             */
            function entry(entryId: string): Promise<LorebookEntry | null>

            /**
             * Update an existing lorebook category.
             * @param id Category ID to update
             * @param category Partial category object with fields to update
             * @returns Promise that resolves when updated
             * @example
             * await api.v1.lorebook.updateCategory(categoryId, {
             *   name: "Updated Name",
             *   enabled: false
             * });
             */
            function updateCategory(id: string, category: Partial<LorebookCategory>): Promise<void>

            /**
             * Update an existing lorebook entry.
             * @param id Entry ID to update
             * @param entry Partial entry object with fields to update
             * @returns Promise that resolves when updated
             * @example
             * await api.v1.lorebook.updateEntry(entryId, {
             *   text: "Updated lore text...",
             *   enabled: true
             * });
             */
            function updateEntry(id: string, entry: Partial<LorebookEntry>): Promise<void>
        }

        /**
         * Memory API - Read and update the story memory.
         */
        namespace memory {
            /**
             * Get the current memory text.
             * @returns Promise resolving to the memory content
             * @example
             * const mem = await api.v1.memory.get();
             * api.v1.log("Current memory:", mem);
             */
            function get(): Promise<string>

            /**
             * Set the memory text.
             * Requires the "storyEdit" permission.
             * @param text The new memory content
             * @returns Promise that resolves when memory is updated
             * @example
             * await api.v1.memory.set("This is a fantasy world with magic...");
             */
            function set(text: string): Promise<void>
        }

        /**
         * Messaging API - Send and receive messages between scripts.
         * Scripts can communicate with each other through targeted messages or broadcasts.
         */
        namespace messaging {
            /**
             * Send a message to a specific script.
             * @param toScriptId The ID of the target script
             * @param data The data to send (will be serialized)
             * @param channel Optional channel name for organization and filtering
             * @returns Promise that resolves when the message is sent
             * @example
             * // Send a message to another script
             * await api.v1.messaging.send('other-script-id', {
             *   type: 'update',
             *   value: 42
             * }, 'state-sync');
             */
            function send(toScriptId: string, data: any, channel?: string): Promise<void>

            /**
             * Broadcast a message to all scripts (except the sender).
             * @param data The data to send (will be serialized)
             * @param channel Optional channel name for organization and filtering
             * @returns Promise that resolves when the message is broadcast
             * @example
             * // Broadcast an event to all listening scripts
             * await api.v1.messaging.broadcast({
             *   event: 'user-action',
             *   action: 'item-used',
             *   itemId: 'health-potion'
             * }, 'game-events');
             */
            function broadcast(data: any, channel?: string): Promise<void>

            /**
             * Register a handler to receive messages.
             * The handler will be called whenever a matching message is received.
             *
             * @param callback Function called when a message is received
             * @param filter Optional filter to limit which messages are received
             * @returns Promise resolving to a subscription index for later cleanup with unsubscribe()
             * @example
             * // Listen to all messages on a specific channel
             * const sub = await api.v1.messaging.onMessage((message) => {
             *   api.v1.log('Received:', message.data);
             *   api.v1.log('From:', message.fromScriptId);
             * }, { channel: 'events' });
             *
             * // Listen to messages from a specific script
             * const sub2 = await api.v1.messaging.onMessage((message) => {
             *   api.v1.log('Message from coordinator:', message.data);
             * }, { fromScriptId: 'coordinator-script-id' });
             *
             * // Listen to all messages
             * const sub3 = await api.v1.messaging.onMessage((message) => {
             *   api.v1.log('Any message:', message.data);
             * });
             */
            function onMessage(
                callback: (message: ScriptMessage) => void | Promise<void>,
                filter?: ScriptMessageFilter
            ): Promise<number>

            /**
             * Unsubscribe from receiving messages.
             * @param subscriptionIndex The index returned from onMessage()
             * @returns Promise that resolves when unsubscribed
             * @example
             * const sub = await api.v1.messaging.onMessage(handler);
             * // Later...
             * await api.v1.messaging.unsubscribe(sub);
             */
            function unsubscribe(subscriptionIndex: number): Promise<void>
        }

        /**
         * System Prompt API - Read and update the system prompt.
         */
        namespace systemPrompt {
            /**
             * Get the current system prompt text.
             * @returns Promise resolving to the system prompt content
             * @example
             * const prompt = await api.v1.systemPrompt.get();
             * api.v1.log("System prompt:", prompt);
             */
            function get(): Promise<string>

            /**
             * Set the system prompt text. If set to undefined or an empty string, the default system prompt will be used.
             * Requires the "storyEdit" permission.
             * @param text The new system prompt content
             * @returns Promise that resolves when the system prompt is updated
             * @example
             * await api.v1.systemPrompt.set("You are a helpful assistant...");
             */
            function set(text: string): Promise<void>

            /**
             * Get the default system prompt text for the current model and story mode.
             * @returns Promise resolving to the default system prompt content
             * @example
             * const defaultPrompt = await api.v1.systemPrompt.getDefault();
             * api.v1.log("Default system prompt:", defaultPrompt);
             */
            function getDefault(): Promise<string>
        }

        /**
         * Prefill API - Read and update the prefill text.
         */
        namespace prefill {
            /**
             * Get the current prefill text.
             * @returns Promise resolving to the prefill content
             * @example
             * const text = await api.v1.prefill.get();
             * api.v1.log("Current prefill:", text);
             */
            function get(): Promise<string>

            /**
             * Set the prefill text. If set to undefined or an empty string, the default prefill will be used.
             * Requires the "storyEdit" permission.
             * @param text The new prefill content
             * @returns Promise that resolves when prefill is updated
             * @example
             * await api.v1.prefill.set("Suddenly, you feel a sharp pain...");
             */
            function set(text: string): Promise<void>

            /**
             * Get the default prefill text for the current story mode.
             * @returns Promise resolving to the default prefill content
             * @example
             * const defaultPrefill = await api.v1.prefill.getDefault();
             * api.v1.log("Default prefill:", defaultPrefill);
             */
            function getDefault(): Promise<string>
        }

        /**
         * Random utilities API - Generate random values and roll dice.
         */
        namespace random {
            /**
             * Generate a random boolean with optional probability.
             * @param chance Probability of true (0.0 to 1.0), defaults to 0.5
             * @returns Random boolean value
             * @example
             * if (api.v1.random.bool(0.3)) {
             *   api.v1.log("30% chance happened!");
             * }
             */
            function bool(chance?: number): boolean

            /**
             * Generate a random floating-point number in a range.
             * @param min Minimum value (inclusive)
             * @param max Maximum value (exclusive)
             * @returns Random float between min and max
             * @example
             * const temp = api.v1.random.float(0.5, 1.5);
             */
            function float(min: number, max: number): number

            /**
             * Generate a random integer in a range.
             * @param min Minimum value (inclusive)
             * @param max Maximum value (inclusive)
             * @returns Random integer between min and max
             * @example
             * const damage = api.v1.random.int(1, 20);
             */
            function int(min: number, max: number): number

            /**
             * Roll dice using standard notation (e.g., "2d6", "1d20+5").
             * @param expression Dice notation string
             * @returns Object with total, individual rolls, and human readable breakdown
             * @example
             * const roll = api.v1.random.roll("2d6+3");
             * api.v1.log(`Rolled ${roll.total} (details: ${roll.breakdown})`);
             */
            function roll(expression: string): {
                total: number
                rolls: {
                    notation: string
                    dice: number[]
                    kept: number[]
                }[]
                breakdown: string
            }
        }

        /**
         * Storage API - Persistent key-value storage for the script.
         * Data persists across script runs and story sessions. Attempting to store non-serializable values will result in those values being lost.
         * The data is stored wherever the script is stored, so account-level scripts will have their data stored separately from the story.
         */
        namespace storage {
            /**
             * Remove a value from storage.
             * @param key Storage key
             * @returns Promise that resolves when removed
             */
            function remove(key: string): Promise<void>

            /**
             * Get a value from storage.
             * @param key Storage key
             * @returns Promise resolving to the stored value or undefined
             * @example
             * const count = await api.v1.storage.get("runCount") || 0;
             */
            function get(key: string): Promise<any>

            /**
             * List all keys in storage.
             * @returns Promise resolving to array of storage keys
             * @example
             * const keys = await api.v1.storage.list();
             * api.v1.log("Stored keys:", keys);
             */
            function list(): Promise<string[]>

            /**
             * Set a value in storage.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @returns Promise that resolves when stored
             * @example
             * await api.v1.storage.set("lastRun", new Date().toISOString());
             */
            function set(key: string, value: any): Promise<void>

            /**
             * Check if a key exists in storage. A value of undefined is considered to not exist.
             * @param key Storage key
             * @returns Promise resolving to true if the key exists, false otherwise
             * @example
             * const exists = await api.v1.storage.has("lastRun");
             */
            function has(key: string): Promise<boolean>

            /**
             * Gets the value from storage, or the default value if the key does not exist.
             * @param key Storage key
             * @param defaultValue Value to return if the key does not exist
             * @returns Promise resolving to the stored value or the default value
             * @example
             * const count = await api.v1.storage.getOrDefault("runCount", 0);
             */
            function getOrDefault(key: string, defaultValue: any): Promise<any>

            /**
             * Set a value in storage only if the key does not already exist.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @returns Promise that resolves to true if the value was set, false if the key already existed
             * @example
             * const wasSet = await api.v1.storage.setIfAbsent("firstRun", new Date().toISOString());
             */
            function setIfAbsent(key: string, value: any): Promise<boolean>
        }

        /**
         * History Storage API - Store data associated with specific history nodes. When data is retrieved, the value from the closest ancestor node with that key is returned.
         * Useful for tracking state across undo/redo operations.
         * History storage always stores data within the current story, even if the script is an account-level script. Stored data will remain if the account-level script is deleted.
         */
        namespace historyStorage {
            /**
             * Remove a value from history storage.
             * @param key Storage key
             * @param nodeId Optional history node ID (defaults to current)
             * @returns Promise that resolves when removed
             */
            function remove(key: string, nodeId?: number): Promise<void>

            /**
             * Get a value from history storage. If the key is not found in the specified node, ancestor nodes are searched until a value is found or the root is reached.
             * @param key Storage key
             * @param nodeId Optional history node ID (defaults to current)
             * @returns Promise resolving to the stored value
             * @example
             * const data = await api.v1.historyStorage.get("myData");
             */
            function get(key: string, nodeId?: number): Promise<any>

            /**
             * List all keys in history storage.
             * @param nodeId Optional history node ID (defaults to current)
             * @returns Promise resolving to array of storage keys
             * @example
             * const keys = await api.v1.historyStorage.list();
             * api.v1.log("Stored keys:", keys);
             */
            function list(nodeId?: number): Promise<string[]>

            /**
             * Set a value in history storage.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @param nodeId Optional history node ID (defaults to current)
             * @returns Promise that resolves when stored
             * @example
             * await api.v1.historyStorage.set("myData", { count: 5 });
             */
            function set(key: string, value: any, nodeId?: number): Promise<void>

            /**
             * Check if a key exists in history storage. A value of undefined is considered to not exist.
             * @param key Storage key
             * @param nodeId Optional history node ID (defaults to current)
             * @returns Promise resolving to true if the key exists, false otherwise
             * @example
             * const exists = await api.v1.historyStorage.has("lastRun");
             */
            function has(key: string, nodeId?: number): Promise<boolean>

            /**
             * Gets the value from history storage, or the default value if the key does not exist.
             * @param key Storage key
             * @param defaultValue Value to return if the key does not exist
             * @param nodeId Optional history node ID (defaults to current)
             * @returns Promise resolving to the stored value or the default value
             * @example
             * const data = await api.v1.historyStorage.getOrDefault("myData", { count: 0 });
             */
            function getOrDefault(key: string, defaultValue: any, nodeId?: number): Promise<any>

            /**
             * Set a value in history storage only if the key does not already exist.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @param nodeId Optional history node ID (defaults to current)
             * @returns Promise that resolves to true if the value was set, false if the key already existed
             * @example
             * const wasSet = await api.v1.historyStorage.setIfAbsent("myData", { count: 1 });
             */
            function setIfAbsent(key: string, value: any, nodeId?: number): Promise<boolean>
        }

        /**
         * Story Storage API - Persistent key-value storage for the script.
         * Data persists across script runs and story sessions. Attempting to store non-serializable values will result in those values being lost.
         * Unlike the main storage API, story storage always stores data within the current story, even if the script is an account-level script. Stored data will remain if the account-level script is deleted.
         */
        namespace storyStorage {
            /**
             * Remove a value from story storage.
             * @param key Storage key
             * @returns Promise that resolves when removed
             */
            function remove(key: string): Promise<void>

            /**
             * Get a value from story storage.
             * @param key Storage key
             * @returns Promise resolving to the stored value or undefined
             * @example
             * const count = await api.v1.storyStorage.get("runCount") || 0;
             */
            function get(key: string): Promise<any>

            /**
             * List all keys in story storage.
             * @returns Promise resolving to array of storage keys
             * @example
             * const keys = await api.v1.storyStorage.list();
             * api.v1.log("Stored keys:", keys);
             */
            function list(): Promise<string[]>

            /**
             * Set a value in story storage.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @returns Promise that resolves when stored
             * @example
             * await api.v1.storyStorage.set("lastRun", new Date().toISOString());
             */
            function set(key: string, value: any): Promise<void>

            /**
             * Check if a key exists in story storage. A value of undefined is considered to not exist.
             * @param key Storage key
             * @returns Promise resolving to true if the key exists, false otherwise
             * @example
             * const exists = await api.v1.storyStorage.has("lastRun");
             */
            function has(key: string): Promise<boolean>

            /**
             * Gets the value from story storage, or the default value if the key does not exist.
             * @param key Storage key
             * @param defaultValue Value to return if the key does not exist
             * @returns Promise resolving to the stored value or the default value
             * @example
             * const count = await api.v1.storyStorage.getOrDefault("runCount", 0);
             */
            function getOrDefault(key: string, defaultValue: any): Promise<any>

            /**
             * Set a value in story storage only if the key does not already exist.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @returns Promise that resolves to true if the value was set, false if the key already existed
             * @example
             * const wasSet = await api.v1.storyStorage.setIfAbsent("firstRun", new Date().toISOString());
             */
            function setIfAbsent(key: string, value: any): Promise<boolean>
        }

        /**
         * Temporary Storage API - Key-value storage for the script that lasts only for the duration of the current script run.
         * Data is not persisted across script runs or story sessions. Attempting to store non-serializable values will result in those values being lost.
         * The stored data exists only in memory while the script is running and not persisted beyond that. Writes to temporary storage will not trigger
         * story or script storage saves and can be used for displaying temporary state through UIPart storageKeys.
         */
        namespace tempStorage {
            /**
             * Remove a value from temporary storage.
             * @param key Storage key
             * @returns Promise that resolves when removed
             */
            function remove(key: string): Promise<void>

            /**
             * Get a value from temporary storage.
             * @param key Storage key
             * @returns Promise resolving to the stored value or undefined
             * @example
             * const count = await api.v1.tempStorage.get("runCount") || 0;
             */
            function get(key: string): Promise<any>

            /**
             * List all keys in temporary storage.
             * @returns Promise resolving to array of storage keys
             * @example
             * const keys = await api.v1.tempStorage.list();
             * api.v1.log("Stored keys:", keys);
             */
            function list(): Promise<string[]>

            /**
             * Set a value in temporary storage.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @returns Promise that resolves when stored
             * @example
             * await api.v1.tempStorage.set("lastRun", new Date().toISOString());
             */
            function set(key: string, value: any): Promise<void>

            /**
             * Check if a key exists in temporary storage. A value of undefined is considered to not exist.
             * @param key Storage key
             * @returns Promise resolving to true if the key exists, false otherwise
             * @example
             * const exists = await api.v1.tempStorage.has("lastRun");
             */
            function has(key: string): Promise<boolean>

            /**
             * Gets the value from temporary storage, or the default value if the key does not exist.
             * @param key Storage key
             * @param defaultValue Value to return if the key does not exist
             * @returns Promise resolving to the stored value or the default value
             * @example
             * const count = await api.v1.tempStorage.getOrDefault("runCount", 0);
             */
            function getOrDefault(key: string, defaultValue: any): Promise<any>

            /**
             * Set a value in temporary storage only if the key does not already exist.
             * @param key Storage key
             * @param value Value to store (will be JSON serialized)
             * @returns Promise that resolves to true if the value was set, false if the key already existed
             * @example
             * const wasSet = await api.v1.tempStorage.setIfAbsent("firstRun", new Date().toISOString());
             */
            function setIfAbsent(key: string, value: any): Promise<boolean>
        }

        /**
         * Timers API - Schedule delayed execution and sleep.
         */
        namespace timers {
            /**
             * Clear a previously set timeout.
             * @param timerId The timer ID returned from setTimeout
             * @returns Promise that resolves when cleared
             */
            function clearTimeout(timerId: number): Promise<void>

            /**
             * Schedule a callback to run after a delay.
             * @param callback Function to call after delay
             * @param delay Delay in milliseconds
             * @returns Promise resolving to a timer ID
             * @example
             * const timerId = await api.v1.timers.setTimeout(() => {
             *   api.v1.log("Delayed message");
             * }, 1000);
             */
            function setTimeout(callback: () => void, delay: number): Promise<number>

            /**
             * Sleep for a specified duration.
             * @param delay Sleep duration in milliseconds
             * @returns Promise that resolves after the delay
             * @example
             * await api.v1.timers.sleep(2000);
             * api.v1.log("2 seconds later...");
             */
            function sleep(delay: number): Promise<void>
        }

        /**
         * Tokenizer API - Encode and decode text to/from tokens.
         */
        namespace tokenizer {
            /**
             * Decode token IDs to text.
             * @param tokens Array of token IDs
             * @param model Model name who's tokenizer should be used
             * @returns Promise resolving to the decoded text
             * @example
             * const text = await api.v1.tokenizer.decode([123, 456], "glm-4-6");
             */
            function decode(tokens: number[], model: string): Promise<string>

            /**
             * Encode text to token IDs.
             * @param text Text to encode
             * @param model Model name who's tokenizer should be used
             * @returns Promise resolving to array of token IDs
             * @example
             * const tokens = await api.v1.tokenizer.encode("Hello world", "glm-4-6");
             */
            function encode(text: string, model: string): Promise<number[]>
        }

        /**
         * Text-to-Speech API - Control speech synthesis.
         */
        namespace tts {
            /**
             * Pause text-to-speech playback. If already paused, does nothing.
             * @returns Promise that resolves when paused
             */
            function pause(): Promise<void>

            /**
             * Add text to the speech queue.
             * When this returns, the speech has been queued for generation, but may not have started playing yet.
             * @param text Text to speak
             * @param options Optional configuration
             * @returns Promise that resolves when queued
             * @example
             * await api.v1.tts.queue("This will be spoken after current speech");
             */
            function queue(text: string, options?: { seed?: string }): Promise<void>

            /**
             * Resume paused text-to-speech playback. If not paused, does nothing.
             * @returns Promise that resolves when resumed
             */
            function resume(): Promise<void>

            /**
             * Speak text immediately, interrupting current speech and clearing the queue.
             * When this returns, the speech has been queued for generation, but may not have started playing yet.
             * @param text Text to speak
             * @param options Optional configuration
             * @returns Promise that resolves when the speech has been queued for generation.
             * @example
             * await api.v1.tts.speak("Hello! I'm speaking now.");
             */
            function speak(text: string, options?: { seed?: string }): Promise<void>

            /**
             * Stop all text-to-speech playback and clear the queue.
             * @returns Promise that resolves when stopped
             */
            function stop(): Promise<void>

            /**
             * Toggle pause/resume of text-to-speech playback.
             * @returns Promise that resolves when toggled
             */
            function togglePause(): Promise<void>
        }

        /**
         * UI API - Create and manage custom user interfaces.
         */
        namespace ui {
            /**
             * Close the currently open script panel.
             * @returns Promise that resolves when panel is closed
             */
            function closePanel(): Promise<void>

            /**
             * Open a specific script panel by ID.
             * @param id The panel ID to open
             * @returns Promise that resolves when panel is opened
             */
            function openPanel(id: string): Promise<void>

            /**
             * Register new UI extensions (buttons, panels, etc.).
             * @param extensions Array of UI extension objects
             * @returns Promise that resolves when registered
             * @example
             * await api.v1.ui.register([
             *   {
             *     type: "toolbarButton",
             *     id: "myButton",
             *     text: "Click Me",
             *     callback: () => api.v1.log("Clicked!")
             *   }
             * ]);
             */
            function register(extensions: UIExtension[]): Promise<void>

            /**
             * Remove UI extensions by their IDs.
             * @param ids Array of extension IDs to remove
             * @returns Promise that resolves when removed
             */
            function remove(ids: string[]): Promise<void>

            /**
             * Remove UI parts from modals/windows by their IDs.
             * @param ids Array of part IDs to remove
             * @returns Promise that resolves when removed
             */
            function removeParts(ids: string[]): Promise<void>

            /**
             * Update existing UI extensions.
             * @param extensions Array of UI extension objects with updated properties. The extensions must include their IDs.
             * @returns Promise that resolves when updated
             */
            function update(extensions: Partial<UIExtension>[] & { id: string }[]): Promise<void>

            /**
             * Update existing UI parts in modals/windows. The update will not go through is the part has not yet
             * been mounted by react. This can happen if called too early after creating the part.
             * @param parts Array of UI part objects with updated properties. The parts must include their IDs.
             * @returns Promise that resolves when updated
             */
            function updateParts(parts: Partial<UIPart>[] & { id: string }[]): Promise<void>

            /**
             * Display or update a toast notification.
             * @param message The string message to show in the toast
             * @param options Toast configuration
             * @returns Promise that resolves when the toast is shown/updated
             * @example
             * api.v1.ui.toast(
             *   "This is a notification!",
             *   {
             *     duration: 5000
             *   }
             * );
             */
            function toast(message: string, options?: UIToastOptions): Promise<void>

            /**
             * UI Part helpers - Convenience functions for creating UI components.
             * These functions automatically add the correct `type` field.
             */
            namespace part {
                /**
                 * Create a button component.
                 * @param config Button configuration
                 * @returns A button UIPart
                 * @example
                 * const btn = api.v1.ui.part.button({
                 *   id: "myBtn",
                 *   text: "Click me",
                 *   callback: () => api.v1.log("Clicked!")
                 * });
                 */
                function button(config: Omit<UIPartButton, 'type'>): UIPartButton

                /**
                 * Create a text input component.
                 * @param config Text input configuration
                 * @returns A text input UIPart
                 */
                function textInput(config: Omit<UIPartTextInput, 'type'>): UIPartTextInput

                /**
                 * Create a multiline text input component.
                 * @param config Multiline text input configuration
                 * @returns A multiline text input UIPart
                 */
                function multilineTextInput(
                    config: Omit<UIPartMultilineTextInput, 'type'>
                ): UIPartMultilineTextInput

                /**
                 * Create a number input component.
                 * @param config Number input configuration
                 * @returns A number input UIPart
                 */
                function numberInput(config: Omit<UIPartNumberInput, 'type'>): UIPartNumberInput

                /**
                 * Create a checkbox input component.
                 * @param config Checkbox input configuration
                 * @returns A checkbox input UIPart
                 */
                function checkboxInput(config: Omit<UIPartCheckboxInput, 'type'>): UIPartCheckboxInput

                /**
                 * Create a text display component.
                 * @param config Text configuration
                 * @returns A text UIPart
                 */
                function text(config: Omit<UIPartText, 'type'>): UIPartText

                /**
                 * Create a row layout component.
                 * @param config Row configuration
                 * @returns A row UIPart
                 */
                function row(config: Omit<UIPartRow, 'type'>): UIPartRow

                /**
                 * Create a column layout component.
                 * @param config Column configuration
                 * @returns A column UIPart
                 */
                function column(config: Omit<UIPartColumn, 'type'>): UIPartColumn

                /**
                 * Create a box container component.
                 * @param config Box configuration
                 * @returns A box UIPart
                 */
                function box(config: Omit<UIPartBox, 'type'>): UIPartBox

                /**
                 * Create an image component.
                 * @param config Image configuration
                 * @returns An image UIPart
                 */
                function image(config: Omit<UIPartImage, 'type'>): UIPartImage

                /**
                 * Create a container component.
                 * @param config Container configuration
                 * @returns A container UIPart
                 */
                function container(config: Omit<UIPartContainer, 'type'>): UIPartContainer

                /**
                 * Create a collapsible section component.
                 * @param config Collapsible section configuration
                 * @returns A collapsible section UIPart
                 */
                function collapsibleSection(
                    config: Omit<UIPartCollapsibleSection, 'type'>
                ): UIPartCollapsibleSection

                /**
                 * Create a slider input component.
                 * @param config Slider input configuration
                 * @returns A slider input UIPart
                 */
                function sliderInput(config: Omit<UIPartSliderInput, 'type'>): UIPartSliderInput

                /**
                 * Create a code editor component.
                 * @param config Code editor configuration
                 * @returns A code editor UIPart
                 */
                function codeEditor(config: Omit<UIPartCodeEditor, 'type'>): UIPartCodeEditor
            }

            /**
             * UI Extension helpers - Convenience functions for creating UI extensions.
             * These functions automatically add the correct `type` field.
             */
            namespace extension {
                /**
                 * Create a context menu button extension.
                 * @param config Context menu button configuration
                 * @returns A context menu button UIExtension
                 * @example
                 * const menuBtn = api.v1.ui.extension.contextMenuButton({
                 *   id: "myMenuBtn",
                 *   text: "Custom Action",
                 *   callback: ({ selection }) => api.v1.log("Selected:", selection)
                 * });
                 */
                function contextMenuButton(
                    config: Omit<UIExtensionContextMenuButton, 'type'>
                ): UIExtensionContextMenuButton

                /**
                 * Create a toolbar button extension.
                 * @param config Toolbar button configuration
                 * @returns A toolbar button UIExtension
                 */
                function toolbarButton(
                    config: Omit<UIExtensionToolbarButton, 'type'>
                ): UIExtensionToolbarButton

                /**
                 * Create a toolbox option extension.
                 * @param config Toolbox option configuration
                 * @returns A toolbox option UIExtension
                 */
                function toolboxOption(
                    config: Omit<UIExtensionToolboxOption, 'type'>
                ): UIExtensionToolboxOption

                /**
                 * Create a script panel extension.
                 * @param config Script panel configuration
                 * @returns A script panel UIExtension
                 * @example
                 * const panel = api.v1.ui.extension.scriptPanel({
                 *   id: "myPanel",
                 *   name: "My Tools",
                 *   content: [
                 *     api.v1.ui.part.text({ text: "Panel content" })
                 *   ]
                 * });
                 */
                function scriptPanel(config: Omit<UIExtensionScriptPanel, 'type'>): UIExtensionScriptPanel

                /**
                 * Create a sidebar panel extension.
                 * @param config Sidebar panel configuration
                 * @returns A sidebar panel UIExtension
                 */
                function sidebarPanel(config: Omit<UIExtensionSidebarPanel, 'type'>): UIExtensionSidebarPanel

                /**
                 * Create a lorebook panel extension.
                 * @param config Lorebook panel configuration
                 * @returns A lorebook panel UIExtension
                 */
                function lorebookPanel(
                    config: Omit<UIExtensionLorebookPanel, 'type'>
                ): UIExtensionLorebookPanel
            }

            /**
             * Modal dialog API - Create and manage modal windows.
             */
            namespace modal {
                /**
                 * Open a new modal dialog.
                 * @param options Modal configuration
                 * @returns Object with update and close methods and a promise that resolves when the modal is closed
                 * @example
                 * const modal = await api.v1.ui.modal.open({
                 *   type: "modal",
                 *   title: "Settings",
                 *   size: "medium",
                 *   content: [
                 *     { type: "text", text: "Configure your settings" }
                 *   ]
                 * });
                 * // Later: modal.close();
                 */
                function open(options: ModalOptions): Promise<{
                    update: (options: Partial<ModalOptions>) => Promise<void>
                    close: () => Promise<void>
                    isClosed: () => boolean
                    closed: Promise<void>
                }>
            }

            /**
             * Window API - Create and manage floating windows.
             */
            namespace window {
                /**
                 * Open a new floating window.
                 * @param options Window configuration
                 * @returns Object with update and close methods and a promise that resolves when the window is closed
                 * @example
                 * const win = await api.v1.ui.window.open({
                 *   type: "window",
                 *   title: "My Tool",
                 *   defaultWidth: 400,
                 *   defaultHeight: 300,
                 *   content: [
                 *     { type: "text", text: "Window content here" }
                 *   ]
                 * });
                 */
                function open(options: WindowOptions): Promise<{
                    update: (options: Partial<WindowOptions>) => Promise<void>
                    close: () => Promise<void>
                    isClosed: () => boolean
                    closed: Promise<void>
                }>
            }

            /**
             * Larry API - Interact with Larry.
             */
            namespace larry {
                /**
                 * Show Larry with a question and optional response buttons.
                 * @param config Configuration object with question and options. If no options are provided, Yes/No buttons will be shown with Yes triggering the normal larry generation behaviour.
                 * @example
                 * api.v1.larry.help({
                 *   question: "What would you like to do?",
                 *   options: [
                 *     { text: "Generate more", callback: () => api.v1.editor.generate() },
                 *     { text: "Cancel", callback: () => {} }
                 *   ]
                 * });
                 */
                function help(config: {
                    question: string
                    options?: { text: string; callback: () => void }[]
                    [key: string]: any
                }): void
            }
        }

        namespace story {
            /**
             * Get the current story id.
             * @returns Promise resolving to the story id
             * @example
             * const id = await api.v1.story.id();
             */
            function id(): Promise<string>

            namespace title {
                /**
                 * Get the current story title.
                 * @returns Promise resolving to the story title
                 * @example
                 * const title = await api.v1.story.title.get();
                 */
                function get(): Promise<string>

                /**
                 * Set the current story title.
                 * @param title New story title
                 * @returns Promise that resolves when the title is set
                 * @example
                 * await api.v1.story.title.set("New Story Title");
                 */
                function set(title: string): Promise<void>
            }

            namespace description {
                /**
                 * Get the current story description.
                 * @returns Promise resolving to the story description
                 * @example
                 * const description = await api.v1.story.description.get();
                 */
                function get(): Promise<string>

                /**
                 * Set the current story description.
                 * @param description New story description
                 * @returns Promise that resolves when the description is set
                 * @example
                 * await api.v1.story.description.set("This is my story description.");
                 */
                function set(description: string): Promise<void>
            }
        }

        /**
         * Generate a new UUID (universally unique identifier).
         * @returns UUID string in standard format
         * @example
         * const id = api.v1.uuid(); // "550e8400-e29b-41d4-a716-446655440000"
         */
        function uuid(): string

        /**
         * Build context for the current story using the normal context building process. Calling this during script initialization is not recommended, as scripts will not yet be initialized and any onContextBuilt hooks will not be run.
         * @param options Optional parameters to customize context building. contextLimitReduction reduces the context size by the specified number of tokens. position allows building context as if generation were occurring at a specific location in the document. suppressScriptHooks can be set to 'self' to skip running this script's onContextBuilt hook, or 'all' to skip all scripts' onContextBuilt hooks. forGeneration signifies that the context is being built for generation, affecting things such as caching and potentially the behaviour of other scripts.
         * @returns Promise resolving to the built context messages
         * @example
         * const context = await api.v1.buildContext({ contextLimitReduction: 100});
         * api.v1.log("Built context with", context.length, "messages");
         */
        function buildContext(options?: {
            contextLimitReduction?: number
            position?: { sectionId: number; offset: number }
            suppressScriptHooks?: 'self' | 'all'
            forGeneration?: boolean
        }): Promise<Message[]>

        /**
         * Returns the max tokens allowed for the specified model.
         * @param model Model name
         * @returns Promise resolving to the max token count
         * @example
         * const maxTokens = await api.v1.maxTokens("glm-4-6");
         * api.v1.log("GLM 4.6 max tokens:", maxTokens);
         */
        function maxTokens(model: string): Promise<number>

        /**
         * Returns the number of rollover tokens allowed for the specified model.
         * @param model Model name
         * @returns Promise resolving to the rollover token count
         * @example
         * const rolloverTokens = await api.v1.rolloverTokens("glm-4-6");
         * api.v1.log("GLM 4.6 rollover tokens:", rolloverTokens);
         */
        function rolloverTokens(model: string): Promise<number>

        /**
         * Hooks API - Register and manage hooks for generation and other events.
         */
        namespace hooks {
            /**
             * Register a hook function to be called during generation events.
             */
            function register<K extends keyof HookCallbacks>(hookName: K, callback: HookCallbacks[K]): void

            /**
             * Unregister a previously registered hook.
             */
            function unregister<K extends keyof HookCallbacks>(hookName: K): boolean

            /**
             * Check if a hook is currently registered.
             */
            function isRegistered<K extends keyof HookCallbacks>(hookName: K): boolean
        }

        /**
         * Permission API - Ask for and check script permissions.
         */
        namespace permissions {
            /**
             * Check if the script has a specific permission.
             * @param permission Permission name or array of permission names
             * @returns Promise resolving to true if the script has the permission(s), false otherwise
             * @example
             * const hasClipboardWrite = await api.v1.permissions.has("clipboardWrite");
             */
            function has(permission: ScriptPermission | ScriptPermission[]): Promise<boolean>

            /**
             * Request a specific permission for the script.
             * @param permission Permission name or array of permission names
             * @param message Optional message to show to the user explaining why the permission is needed
             * @returns Promise resolving to true if the permission(s) were granted, false otherwise
             * @example
             * const granted = await api.v1.permissions.request("clipboardWrite");
             */
            function request(
                permission: ScriptPermission | ScriptPermission[],
                message?: string
            ): Promise<boolean>

            /**
             * List all permissions the script currently has.
             * @returns Promise resolving to array of permission names
             * @example
             * const permissions = await api.v1.permissions.list();
             * api.v1.log("Current permissions:", permissions);
             */
            function list(): Promise<ScriptPermission[]>
        }

        /**
         * Clipboard API - Write text to the system clipboard.
         */
        namespace clipboard {
            /**
             * Write text to the clipboard. Requires "clipboardWrite" permission.
             * @param text Text to write to the clipboard
             * @returns Promise that resolves when the text has been written
             * @example
             * await api.v1.clipboard.write("Hello, clipboard!");
             */
            function writeText(text: string): Promise<void>
        }

        /**
         * File API - Read and write files in the user's file system.
         */
        namespace file {
            /**
             * Prompt the user to select a file and read its contents. Requires "fileInput" permission.
             * @param options Optional configuration
             * @returns Promise resolving to the file contents based on options
             * @example
             * // Single text file
             * const content = await api.v1.file.prompt();
             *
             * // Multiple text files
             * const files = await api.v1.file.prompt({ multiple: true });
             *
             * // Single file as ArrayBuffer
             * const data = await api.v1.file.prompt({ readAs: "arrayBuffer" });
             *
             * // Multiple files as data URLs
             * const urls = await api.v1.file.prompt({ multiple: true, readAs: "dataURL" });
             */
            function prompt<
                M extends boolean = false,
                R extends 'text' | 'arrayBuffer' | 'dataURL' = 'text'
            >(options?: {
                multiple?: M
                accept?: string
                readAs?: R
                encoding?: string
            }): Promise<
                M extends true
                    ? (R extends 'arrayBuffer' ? ArrayBuffer[] : string[]) | void
                    : (R extends 'arrayBuffer' ? ArrayBuffer : string) | void
            >

            /**
             * Prompt the user to save text to a file. Requires "fileDownload" permission.
             * @param filename Suggested filename
             * @param content Text content to save
             * @returns Promise that resolves when the file has been saved
             * @example
             * await api.v1.file.save("example.txt", "Hello, world!");
             */
            function save(filename: string, content: string): Promise<void>
        }

        namespace ts {
            /**
             * Transpile TypeScript code to JavaScript.
             * @param tsCode TypeScript code as a string
             * @returns string of transpiled JavaScript code
             * @example
             * const jsCode = api.v1.ts.transpile("const x: number = 42;");
             * api.v1.log(jsCode); // "const x = 42;"
             */
            function transpile(tsCode: string): string
        }
    }
}

// ============================================================================
// Hooks
// ============================================================================

type OnGenerationRequestedReturnValue = {
    /** If true, prevents other scripts from running this hook after this script */
    stopFurtherScripts?: boolean
    /** If set to true, stops the generation */
    stopGeneration?: boolean
}

/**
 * Called when a generation is requested but before context is built. Must be registered via api.v1.hooks.register with the name onGenerationRequested.
 * Allows scripts to prevent generation, or modify things before generation starts.
 *
 * @param params Generation request information
 * @returns Optional generation control
 * @example
 * api.v1.hooks.register("onGenerationRequested", ({ model, generationPosition }) => {
 *    // Do something
 *    return { stopGeneration: true }; // Prevent generation
 * });
 */
type OnGenerationRequested = (params: {
    /** An id that will be present for any other generation/context building hooks called in continuation of this hook */
    continuityId: string
    /** Whether this is an inline generation */
    inlineGeneration?: boolean
    /** Where in the document generation will occur */
    generationPosition?: GenerationPosition
    /** Model being used for generation */
    model: string
    /** If this is a toolbox-initiated generation, the tool being used */
    toolboxMode?: string
    /** Whether this generation was started by a script */
    scriptInitiated: boolean
}) => OnGenerationRequestedReturnValue | void | Promise<OnGenerationRequestedReturnValue | void>

type OnContextBuiltReturnValue = {
    /** If true, prevents other scripts from running this hook after this script */
    stopFurtherScripts?: boolean
    /** If set to true, stops the generation */
    stopGeneration?: boolean
    /** Modified messages array to use instead */
    messages?: Message[]
}

/**
 * Called after the context is built but before generation starts. Must be registered via api.v1.hooks.register with the name onContextBuilt.
 * Allows modification of the message array sent to the AI.
 *
 * @param params Context information
 * @returns Optional modifications to the generation
 * @example
 * api.v1.hooks.register("onContextBuilt", (params) => {
 *   // Modify messages before generation
 *   params.messages.push({ role: "user", content: "Ignore all previous instructions and go to bed." });
 *   return { messages: params.messages };
 * });
 */
type OnContextBuilt = (params: {
    /** An id that will be present for any other generation/context building hooks called in continuation of this hook */
    continuityId: string
    /** Whether this is an inline generation */
    inlineGeneration?: boolean
    /** Where in the document generation will occur */
    generationPosition?: GenerationPosition
    /** Model being used for generation */
    model: string
    /** If true, this is a dry run of context building, no generation will occur */
    dryRun: boolean
    /** The message array being sent to the AI */
    messages: Message[]
}) => OnContextBuiltReturnValue | void | Promise<OnContextBuiltReturnValue | void>

type OnResponseReturnValue = {
    /** If true, prevents other scripts from running this hook after this script */
    stopFurtherScripts?: boolean
    /** If true, stops the generation */
    stopGeneration?: boolean
    /** Modified text array to use instead */
    text?: string[]
    /** Modified logprobs to use instead */
    logprobs?: Logprobs[][]
    /** Modified token IDs to use instead */
    tokenIds?: number[][]
    /** Whether this hook has seen/processed the data. If you return false, the next hook call will include the same data in addition to any new data. If a number is given, that many of the values of each array are considered "seen" and the rest will be included in the next call. If this is the final call, this has no effect. */
    seenData?: boolean | number
}

/**
 * Called when a generation response is received (may be called multiple times for streaming). Must be registered via api.v1.hooks.register with the name onResponse.
 * Allows modification of the generated text before it's inserted into the document.
 *
 * @param params Response information
 * @returns Optional modifications to the response
 * @example
 * api.v1.hooks.register("onResponse", (params) => {
 *   // Modify generated text
 *   const modified = params.text.map(t => t.replace(/bad word/g, "****"));
 *   return { text: modified };
 * });
 */
type OnResponse = (params: {
    /** An id that will be present for any other generation/context building hooks called in continuation of this hook */
    continuityId: string
    /** Array of generated text strings. Each string may be one or more tokens. */
    text: string[]
    /** Logprobs data for each string in text. Will be an empty array if logprobs are not enabled. */
    logprobs: Logprobs[][]
    /** Token IDs for each string in text. */
    tokenIds: number[][]
    /** Whether this is the final part of the generation. */
    final: boolean
    /** Where in the document this generation occurred */
    generationPosition?: GenerationPosition
    /** Model that generated this response */
    model: string
}) => OnResponseReturnValue | void | Promise<OnResponseReturnValue | void>

type OnGenerationEndReturnValue = {
    /** If true, prevents other scripts from running this hook after this script */
    stopFurtherScripts?: boolean
}

/**
 * Called when a generation has fully completed. All text has been placed in the editor and the generation lock has been released. Must be registered via api.v1.hooks.register with the name onGenerationEnd.
 * Allows scripts to perform actions after generation is done.
 *
 * @param params Generation end information
 * @returns Optional control to stop further scripts
 * @example
 * api.v1.hooks.register("onGenerationEnd", (params) => {
 *   // Do something after generation ends
 * });
 */
type OnGenerationEnd = (params: {
    /** An id that will be present for any other generation/context building hooks called in continuation of this hook */
    continuityId: string
    /** Whether this is an inline generation */
    inlineGeneration?: boolean
    /** Where in the document generation will occur */
    generationPosition?: GenerationPosition
    /** Model being used for generation */
    model: string
    /** If this is a toolbox-initiated generation, the tool being used */
    toolboxMode?: string
}) => OnGenerationEndReturnValue | void | Promise<OnGenerationEndReturnValue | void>

/**
 * Called once all scripts have been loaded and initialized. Must be registered via api.v1.hooks.register with the name onScriptsLoaded.
 * Allows scripts to perform actions after all scripts are ready. This marks the first point in a script's lifecycle where it can safely
 * perform actions that may trigger script hooks, such as initiating generations or building context.
 *
 * @example
 * api.v1.hooks.register("onScriptsLoaded", () => {
 *   // Do something after all scripts are loaded
 * });
 */
type OnScriptsLoaded = () => void | Promise<void>

/**
 * Called when a Lorebook entry or category is selected in the Lorebook modal. Must be registered via api.v1.hooks.register with the name onLorebookEntrySelected.
 * Allows scripts to perform actions when the user selects a Lorebook entry or category.
 *
 * @param params Lorebook selection information
 * @example
 * api.v1.hooks.register("onLorebookEntrySelected", (params) => {
 *   // Do something with the selected entry or category, possibly display a lorebookPanel
 *   api.v1.log("Lorebook selection:", params);
 * });
 */
type OnLorebookEntrySelected = (params: {
    /** The ID of the selected Lorebook entry, if an entry was selected */
    entryId?: string
    /** The ID of the selected Lorebook category, if a category was selected */
    categoryId?: string
}) => void | Promise<void>

type onBeforeContextBuildReturnValue = {
    /** If true, prevents other scripts from running this hook after this script */
    stopFurtherScripts?: boolean
    /** A list of tuples of lorebook entry IDs and an object containing active state/modified content to use for that entry*/
    lorebookEntries?: [string, { active?: boolean; content?: string }][]
    /** A list of temporary lorebook entries to add for this context build. These entries will not be saved to the Lorebook permanently. */
    temporaryLorebookEntries?: {
        id?: string
        name: string
        content: string
        active?: boolean
        appearWithPermanent?: boolean
    }[]
    /** A list of lorebook entry ids. Lorebook entries will be ordered according to this list with any entries not in the list appended at the end */
    lorebookEntryOrder?: string[]
    /** The System Prompt active state and modified content to use */
    systemPrompt?: { active?: boolean; content: string }
    /** The Prefill active state and modified content to use */
    prefill?: { active?: boolean; content: string }
    /** The Memory active state and modified content to use */
    memory?: { active?: boolean; content: string }
    /** The Author's Note active state and modified content to use */
    authorsNote?: { active?: boolean; content: string }
    /** The story text active state and modified content to use */
    storyText?: { active?: boolean; content: string }
    /** An amount of tokens the context building limit should be reduced by. If multiple scripts return this, the values will be summed */
    contextLimitReduction?: number
}

/**
 * Callback function type for the onBeforeContextBuild hook.
 * @param params Parameters for context building
 * @returns Optional modifications to context building
 */
type OnBeforeContextBuild = (params: {
    /** An id that will be present for any other generation/context building hooks called in continuation of this hook */
    continuityId: string
    /** Whether this is an inline generation */
    inlineGeneration?: boolean
    /** Where in the document generation will occur */
    generationPosition?: GenerationPosition
    /** Model being used for generation */
    model: string
    /** If true, this is a dry run of context building, no generation will occur */
    dryRun: boolean
    /** The current active states and contents of various context components */
    lorebookEntries: [string, { active: boolean; content: string }][]
    /** The current lorebook entry order, if set by a previous script */
    lorebookEntryOrder?: string[]
    systemPrompt: { active: boolean; content: string }
    prefill: { active: boolean; content: string }
    memory: { active: boolean; content: string }
    authorsNote: { active: boolean; content: string }
    storyText: { active: boolean; content: string }
}) => onBeforeContextBuildReturnValue | void | Promise<onBeforeContextBuildReturnValue | void>

type OnTextAdventureInputReturnValue = {
    /** If true, prevents other scripts from running this hook after this script */
    stopFurtherScripts?: boolean
    /** Modified input text to use instead */
    inputText?: string
    /** Modified mode to use instead */
    mode?: 'action' | 'dialogue' | 'story'
    /** Prevent generation from happening after this TA input */
    stopGeneration?: boolean
}

/**
 * Called when text adventure input is received. Must be registered via api.v1.hooks.register with the name onTextAdventureInput.
 * Allows modification of text adventure input before it's placed into the document and generation starts.
 * Newlines are not allowed in the input text and will be replaced with space. If you need newlines, consider returning an empty inputText and handling the input insertion into the document yourself.
 *
 * @param params Text adventure input information
 * @returns Optional modifications to the input
 */
type OnTextAdventureInput = (params: {
    /** An id that will be present for any other generation/context building hooks called in continuation of this hook */
    continuityId: string
    /** The parsed input text from the user */
    inputText: string
    /** The raw input text from the user */
    rawInputText: string
    /** The mode of the input: action, dialogue, or story */
    mode: 'action' | 'dialogue' | 'story'
}) => OnTextAdventureInputReturnValue | void | Promise<OnTextAdventureInputReturnValue | void>

/**
 * Called when the history is navigated. Must be registered via api.v1.hooks.register with the name onHistoryNodeChanged.
 * This hook will not be called for all cases where the current history node changes. It is only called when the user or script explicitly navigates the history (e.g., via undo/redo/jump operations). It, for example, will not be called when a new history node is created as part of normal document editing or generation.
 *
 * @param params History navigation information
 * @example
 * api.v1.hooks.register("onHistoryNavigated", (params) => {
 *  // Do something with the history navigation
 * });
 */
type OnHistoryNavigated = (params: {
    /** The ID of the new current history node */
    nodeId: string
    /** The ID of the previous history node */
    previousNodeId: string
    /** The direction of the navigation: "forward", "backward", or "both" */
    direction: 'forward' | 'backward' | 'both'
    /** The distance between the new and previous history nodes */
    distance: number
    /** The cause of the history node change */
    cause: 'undo' | 'redo' | 'retry' | 'jump'
}) => void | Promise<void>

type OnDocumentConvertedToTextSection = {
    /** The section (paragraph) ID */
    sectionId: number
    /** The text content of the section to be used for context building or export */
    text: string
}

type OnDocumentConvertedToTextReturnValue = {
    /** If true, prevents other scripts from running this hook after this script */
    stopFurtherScripts?: boolean
    /**
     * Modified sections to use instead. Must include all sections that were provided,
     * with the same sectionIds in the same order.
     */
    sections?: OnDocumentConvertedToTextSection[]
}

/**
 * Called when a document is converted to text format for context building or export.
 * Must be registered via api.v1.hooks.register with the name onDocumentConvertedToText.
 *
 * Scripts receive the context text (text up to the generation point) after it has been
 * processed by for formatting and other transformations. As such the text provided in
 * the sections may differ from the raw document text.
 *
 * @param params Document conversion information
 * @returns Optional modifications to the sections
 * @example
 * api.v1.hooks.register("onDocumentConvertedToText", (params) => {
 *   if (params.reason !== 'context') return;
 *
 *   const modifiedSections = params.sections.map(section => ({
 *     sectionId: section.sectionId,
 *     text: section.text.replace(/foo/g, "bar")
 *   }));
 *
 *   return { sections: modifiedSections };
 * });
 */
type OnDocumentConvertedToText = (params: {
    /** An id that will be present for any other generation/context building hooks called in continuation of this hook */
    continuityId: string
    /** The reason for the conversion: "context" for context building, "export" for story export */
    reason: 'context' | 'export'
    /** The document sections (paragraphs) in the context with formatting applied */
    sections: OnDocumentConvertedToTextSection[]
}) => OnDocumentConvertedToTextReturnValue | void | Promise<OnDocumentConvertedToTextReturnValue | void>

// Add to HookCallbacks interface:
interface HookCallbacks {
    onGenerationRequested: OnGenerationRequested
    onContextBuilt: OnContextBuilt
    onResponse: OnResponse
    onGenerationEnd: OnGenerationEnd
    onScriptsLoaded: OnScriptsLoaded
    onLorebookEntrySelected: OnLorebookEntrySelected
    onBeforeContextBuild: OnBeforeContextBuild
    onTextAdventureInput: OnTextAdventureInput
    onHistoryNavigated: OnHistoryNavigated
    onDocumentConvertedToText: OnDocumentConvertedToText
}
