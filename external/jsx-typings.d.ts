// JSX type declarations for NovelAI scripting API

// ============================================================================
// Store type
// ============================================================================

interface ScriptStore<T> {
    /** Get the current value. */
    get(): T
    /** Set a new value, or pass a function to update based on the previous value. */
    set(value: T | ((prev: T) => T)): void
    /** Subscribe to changes. Returns an unsubscribe function. */
    subscribe(listener: () => void): () => void
}

// ============================================================================
// Preact types namespace
// ============================================================================

declare namespace preact {
    interface VNode<P = {}> {
        type: string | Function
        props: P & { children?: ComponentChildren }
        key?: string | number | null
    }

    type ComponentChild = VNode | string | number | boolean | null | undefined | ComponentChild[]
    type ComponentChildren = ComponentChild | ComponentChild[]

    interface Context<T> {
        Provider: (props: { value: T; children?: ComponentChildren }) => VNode
        Consumer: (props: { children: (value: T) => ComponentChildren }) => VNode
    }
}

// ============================================================================
// Event types
// ============================================================================

interface ScriptEventTarget {
    nodeName: string
    nodeType: number
    id: string
    className: string
    style: ScriptCSSProperties
    attributes: { name: string; value: string }[]
    childNodes: any[]
    children: any[]
    parentNode: ScriptEventTarget | null
    value?: string
    checked?: boolean
    name?: string
    type?: string
    disabled?: boolean
    readOnly?: boolean
    selectedIndex?: number
    [key: string]: any
}

interface ScriptEvent {
    type: string
    target: ScriptEventTarget
    currentTarget: ScriptEventTarget
    bubbles: boolean
    cancelable: boolean
    defaultPrevented: boolean
    eventPhase: number
    isTrusted: boolean
    timeStamp: number
}

interface ScriptMouseEvent extends ScriptEvent {
    clientX: number
    clientY: number
    pageX: number
    pageY: number
    screenX: number
    screenY: number
    offsetX: number
    offsetY: number
    movementX: number
    movementY: number
    button: number
    buttons: number
    altKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    metaKey: boolean
    detail: number
}

interface ScriptKeyboardEvent extends ScriptEvent {
    key: string
    code: string
    altKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    metaKey: boolean
    repeat: boolean
    isComposing: boolean
    location: number
}

interface ScriptFocusEvent extends ScriptEvent {}

interface ScriptInputEvent extends ScriptEvent {
    inputType?: string
    data?: string
    isComposing?: boolean
}

interface ScriptPointerEvent extends ScriptMouseEvent {
    pointerId: number
    pointerType: string
    pressure: number
    tangentialPressure: number
    width: number
    height: number
    tiltX: number
    tiltY: number
    twist: number
    isPrimary: boolean
}

interface ScriptTouchEvent extends ScriptEvent {
    altKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    metaKey: boolean
}

interface ScriptUIEvent extends ScriptEvent {
    detail: number
}

// ============================================================================
// CSS style properties
// ============================================================================

interface ScriptCSSProperties {
    [key: string]: string | number | undefined
}

// ============================================================================
// Common HTML attributes
// ============================================================================

interface ScriptHTMLAttributes<T = HTMLElement> {
    children?: preact.ComponentChildren
    key?: string | number | null
    ref?: { current: T | null } | ((el: T | null) => void)
    id?: string
    class?: string
    className?: string
    style?: ScriptCSSProperties | string
    title?: string
    tabIndex?: number
    role?: string
    hidden?: boolean
    draggable?: boolean
    lang?: string
    dir?: string
    slot?: string
    part?: string
    spellcheck?: boolean | 'true' | 'false'
    contentEditable?: boolean | 'true' | 'false' | 'inherit' | 'plaintext-only'
    translate?: 'yes' | 'no'
    enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
    inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'

    // ARIA
    'aria-label'?: string
    'aria-labelledby'?: string
    'aria-describedby'?: string
    'aria-hidden'?: boolean | 'true' | 'false'
    'aria-live'?: 'off' | 'polite' | 'assertive'
    'aria-atomic'?: boolean | 'true' | 'false'
    'aria-busy'?: boolean | 'true' | 'false'
    'aria-disabled'?: boolean | 'true' | 'false'
    'aria-expanded'?: boolean | 'true' | 'false'
    'aria-selected'?: boolean | 'true' | 'false'
    'aria-checked'?: boolean | 'true' | 'false' | 'mixed'
    'aria-pressed'?: boolean | 'true' | 'false' | 'mixed'
    'aria-haspopup'?: boolean | 'true' | 'false' | 'menu' | 'dialog' | 'listbox' | 'tree' | 'grid'
    'aria-controls'?: string
    'aria-current'?: boolean | 'true' | 'false' | 'page' | 'step' | 'location' | 'date' | 'time'
    'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling'
    'aria-required'?: boolean | 'true' | 'false'
    'aria-readonly'?: boolean | 'true' | 'false'
    'aria-valuemin'?: number
    'aria-valuemax'?: number
    'aria-valuenow'?: number
    'aria-valuetext'?: string
    'aria-orientation'?: 'horizontal' | 'vertical'
    'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other'
    'aria-roledescription'?: string
    'aria-placeholder'?: string
    'aria-multiline'?: boolean | 'true' | 'false'
    'aria-multiselectable'?: boolean | 'true' | 'false'
    'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both'
    'aria-activedescendant'?: string
    'aria-colcount'?: number
    'aria-colindex'?: number
    'aria-colspan'?: number
    'aria-rowcount'?: number
    'aria-rowindex'?: number
    'aria-rowspan'?: number
    'aria-setsize'?: number
    'aria-posinset'?: number
    'aria-level'?: number

    // Data attributes
    [key: `data-${string}`]: string | number | boolean | undefined

    // Mouse
    onClick?: (event: ScriptMouseEvent) => void
    onDblClick?: (event: ScriptMouseEvent) => void
    onMouseDown?: (event: ScriptMouseEvent) => void
    onMouseUp?: (event: ScriptMouseEvent) => void
    onMouseMove?: (event: ScriptMouseEvent) => void
    onMouseEnter?: (event: ScriptMouseEvent) => void
    onMouseLeave?: (event: ScriptMouseEvent) => void
    onMouseOver?: (event: ScriptMouseEvent) => void
    onMouseOut?: (event: ScriptMouseEvent) => void
    onContextMenu?: (event: ScriptMouseEvent) => void

    // Keyboard
    onKeyDown?: (event: ScriptKeyboardEvent) => void
    onKeyUp?: (event: ScriptKeyboardEvent) => void
    onKeyPress?: (event: ScriptKeyboardEvent) => void

    // Focus
    onFocus?: (event: ScriptFocusEvent) => void
    onBlur?: (event: ScriptFocusEvent) => void
    onFocusIn?: (event: ScriptFocusEvent) => void
    onFocusOut?: (event: ScriptFocusEvent) => void

    // Form
    onInput?: (event: ScriptInputEvent) => void
    onChange?: (event: ScriptEvent) => void
    onSubmit?: (event: ScriptEvent) => void

    // Scroll
    onScroll?: (event: ScriptUIEvent) => void

    // Pointer
    onPointerDown?: (event: ScriptPointerEvent) => void
    onPointerUp?: (event: ScriptPointerEvent) => void
    onPointerMove?: (event: ScriptPointerEvent) => void
    onPointerOver?: (event: ScriptPointerEvent) => void
    onPointerOut?: (event: ScriptPointerEvent) => void
    onPointerEnter?: (event: ScriptPointerEvent) => void
    onPointerLeave?: (event: ScriptPointerEvent) => void

    // Touch
    onTouchStart?: (event: ScriptTouchEvent) => void
    onTouchEnd?: (event: ScriptTouchEvent) => void
    onTouchMove?: (event: ScriptTouchEvent) => void
    onTouchCancel?: (event: ScriptTouchEvent) => void
}

// Element-specific attributes

interface ScriptInputAttributes extends ScriptHTMLAttributes<HTMLInputElement> {
    type?: string
    value?: string | number
    checked?: boolean
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    name?: string
    min?: number | string
    max?: number | string
    step?: number | string
    pattern?: string
    required?: boolean
    multiple?: boolean
    autofocus?: boolean
    autocomplete?: string
    maxlength?: number
    minlength?: number
    size?: number
}

interface ScriptTextareaAttributes extends ScriptHTMLAttributes<HTMLTextAreaElement> {
    value?: string
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    name?: string
    rows?: number | string
    cols?: number | string
    wrap?: string
    required?: boolean
    maxlength?: number
    minlength?: number
}

interface ScriptSelectAttributes extends ScriptHTMLAttributes<HTMLSelectElement> {
    value?: string
    disabled?: boolean
    name?: string
    multiple?: boolean
    required?: boolean
    size?: number
}

interface ScriptOptionAttributes extends ScriptHTMLAttributes<HTMLOptionElement> {
    value?: string
    disabled?: boolean
    selected?: boolean
}

interface ScriptButtonAttributes extends ScriptHTMLAttributes<HTMLButtonElement> {
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    name?: string
    value?: string
}

interface ScriptImgAttributes extends ScriptHTMLAttributes<HTMLImageElement> {
    /** Only data: URIs are allowed */
    src?: string
    alt?: string
    width?: number | string
    height?: number | string
    loading?: 'lazy' | 'eager'
}

/**
 * The shape `ref.current` takes for a <canvas> element.
 */
interface ScriptCanvasElement {
    /** Width of the drawing surface in pixels. Assigning resizes the canvas. */
    width: number
    /** Height of the drawing surface in pixels. Assigning resizes the canvas. */
    height: number
    getContext(type: '2d'): Promise<ScriptCanvasRenderingContext2D | null>
    /**
     * Encode the canvas contents as a data URL.
     * @param type MIME type (e.g. `'image/png'`, `'image/webp'`, `'image/jpeg'`). Browser-dependent.
     * @param quality For lossy formats. A number between 0 and 1 indicating image quality.
     */
    toDataURL(type?: string, quality?: number): Promise<string>
}

/**
 * Decoded bitmap image, suitable as a source for `ctx.drawImage` and pattern creation.
 * Obtained via `createImageBitmap()`. Call `close()` when done to free resources.
 */
interface ScriptImageBitmap {
    readonly width: number
    readonly height: number
    /** Release the underlying image resources. The bitmap is unusable after this. */
    close(): void
}

interface ScriptCanvasAttributes extends ScriptHTMLAttributes<ScriptCanvasElement> {
    width?: number | string
    height?: number | string
}

// ============================================================================
// SVG attributes
// ============================================================================

/** Attributes shared by every SVG element. */
interface ScriptSVGCommonAttributes<T = unknown> extends ScriptHTMLAttributes<T> {
    transform?: string
    'transform-origin'?: string
    'xml:lang'?: string
    'xml:space'?: 'default' | 'preserve'
}

/** Presentation attributes shared by SVG elements that render graphics. */
interface ScriptSVGGraphicsAttributes<T = unknown> extends ScriptSVGCommonAttributes<T> {
    fill?: string
    'fill-opacity'?: number | string
    'fill-rule'?: 'nonzero' | 'evenodd' | 'inherit'
    stroke?: string
    'stroke-width'?: number | string
    'stroke-linecap'?: 'butt' | 'round' | 'square' | 'inherit'
    'stroke-linejoin'?: 'miter' | 'round' | 'bevel' | 'inherit'
    'stroke-dasharray'?: string | number
    'stroke-dashoffset'?: number | string
    'stroke-miterlimit'?: number | string
    'stroke-opacity'?: number | string
    opacity?: number | string
    color?: string
    'color-interpolation'?: string
    'color-interpolation-filters'?: string
    'color-rendering'?: string
    display?: string
    visibility?: string
    'shape-rendering'?: string
    'image-rendering'?: string
    'vector-effect'?: string
    'pointer-events'?: string
    cursor?: string
    mask?: string
    'clip-path'?: string
    'clip-rule'?: 'nonzero' | 'evenodd' | 'inherit'
    filter?: string
    'paint-order'?: string
    overflow?: string
}

/** Presentation attributes for text-content SVG elements. */
interface ScriptSVGTextContentAttributes<T = unknown> extends ScriptSVGGraphicsAttributes<T> {
    'text-anchor'?: 'start' | 'middle' | 'end' | 'inherit'
    'dominant-baseline'?: string
    'alignment-baseline'?: string
    'baseline-shift'?: string
    'font-family'?: string
    'font-size'?: number | string
    'font-size-adjust'?: number | string
    'font-style'?: string
    'font-weight'?: number | string
    'font-variant'?: string
    'font-stretch'?: string
    'letter-spacing'?: number | string
    'word-spacing'?: number | string
    kerning?: string
    'text-decoration'?: string
    'text-transform'?: string
    'text-rendering'?: string
    'writing-mode'?: string
    direction?: string
    'unicode-bidi'?: string
    textLength?: number | string
    lengthAdjust?: 'spacing' | 'spacingAndGlyphs'
}

/** Common base for filter primitives (everything `fe*` that produces output). */
interface ScriptSVGFilterPrimitiveAttributes<T = unknown> extends ScriptSVGCommonAttributes<T> {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    result?: string
    in?: string
}

// Containers & metadata

interface ScriptSVGSvgAttributes extends ScriptSVGGraphicsAttributes {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    viewBox?: string
    preserveAspectRatio?: string
}

interface ScriptSVGGAttributes extends ScriptSVGGraphicsAttributes {}
interface ScriptSVGDefsAttributes extends ScriptSVGCommonAttributes {}
interface ScriptSVGTitleOrDescAttributes extends ScriptSVGCommonAttributes {}

interface ScriptSVGSymbolAttributes extends ScriptSVGGraphicsAttributes {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    viewBox?: string
    preserveAspectRatio?: string
    refX?: number | string
    refY?: number | string
}

// Shapes

interface ScriptSVGPathAttributes extends ScriptSVGGraphicsAttributes {
    d?: string
    pathLength?: number | string
}

interface ScriptSVGRectAttributes extends ScriptSVGGraphicsAttributes {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    rx?: number | string
    ry?: number | string
}

interface ScriptSVGCircleAttributes extends ScriptSVGGraphicsAttributes {
    cx?: number | string
    cy?: number | string
    r?: number | string
}

interface ScriptSVGEllipseAttributes extends ScriptSVGGraphicsAttributes {
    cx?: number | string
    cy?: number | string
    rx?: number | string
    ry?: number | string
}

interface ScriptSVGLineAttributes extends ScriptSVGGraphicsAttributes {
    x1?: number | string
    y1?: number | string
    x2?: number | string
    y2?: number | string
}

interface ScriptSVGPolyAttributes extends ScriptSVGGraphicsAttributes {
    points?: string
}

// Text

interface ScriptSVGTextAttributes extends ScriptSVGTextContentAttributes {
    x?: number | string
    y?: number | string
    dx?: number | string
    dy?: number | string
    rotate?: number | string
}

interface ScriptSVGTSpanAttributes extends ScriptSVGTextContentAttributes {
    x?: number | string
    y?: number | string
    dx?: number | string
    dy?: number | string
    rotate?: number | string
}

interface ScriptSVGTextPathAttributes extends ScriptSVGTextContentAttributes {
    startOffset?: number | string
    method?: 'align' | 'stretch'
    spacing?: 'auto' | 'exact'
    side?: 'left' | 'right'
}

// Gradients & patterns

interface ScriptSVGGradientAttributesBase extends ScriptSVGCommonAttributes {
    gradientUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
    gradientTransform?: string
    spreadMethod?: 'pad' | 'reflect' | 'repeat'
}

interface ScriptSVGLinearGradientAttributes extends ScriptSVGGradientAttributesBase {
    x1?: number | string
    y1?: number | string
    x2?: number | string
    y2?: number | string
}

interface ScriptSVGRadialGradientAttributes extends ScriptSVGGradientAttributesBase {
    cx?: number | string
    cy?: number | string
    r?: number | string
    fx?: number | string
    fy?: number | string
    fr?: number | string
}

interface ScriptSVGStopAttributes extends ScriptSVGCommonAttributes {
    offset?: number | string
    'stop-color'?: string
    'stop-opacity'?: number | string
}

interface ScriptSVGPatternAttributes extends ScriptSVGCommonAttributes {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    patternUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
    patternContentUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
    patternTransform?: string
    viewBox?: string
    preserveAspectRatio?: string
}

// Clipping, masking, markers

interface ScriptSVGMaskAttributes extends ScriptSVGCommonAttributes {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    maskUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
    maskContentUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
}

interface ScriptSVGClipPathAttributes extends ScriptSVGCommonAttributes {
    clipPathUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
}

interface ScriptSVGMarkerAttributes extends ScriptSVGCommonAttributes {
    markerUnits?: 'strokeWidth' | 'userSpaceOnUse'
    markerWidth?: number | string
    markerHeight?: number | string
    orient?: string
    refX?: number | string
    refY?: number | string
    viewBox?: string
    preserveAspectRatio?: string
}

// Filter container & primitives

interface ScriptSVGFilterAttributes extends ScriptSVGCommonAttributes {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    filterUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
    primitiveUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
}

interface ScriptSVGFeBlendAttributes extends ScriptSVGFilterPrimitiveAttributes {
    in2?: string
    mode?:
        | 'normal'
        | 'multiply'
        | 'screen'
        | 'overlay'
        | 'darken'
        | 'lighten'
        | 'color-dodge'
        | 'color-burn'
        | 'hard-light'
        | 'soft-light'
        | 'difference'
        | 'exclusion'
        | 'hue'
        | 'saturation'
        | 'color'
        | 'luminosity'
}

interface ScriptSVGFeColorMatrixAttributes extends ScriptSVGFilterPrimitiveAttributes {
    type?: 'matrix' | 'saturate' | 'hueRotate' | 'luminanceToAlpha'
    values?: string
}

interface ScriptSVGFeComponentTransferAttributes extends ScriptSVGFilterPrimitiveAttributes {}

interface ScriptSVGFeCompositeAttributes extends ScriptSVGFilterPrimitiveAttributes {
    in2?: string
    operator?: 'over' | 'in' | 'out' | 'atop' | 'xor' | 'lighter' | 'arithmetic'
    k1?: number | string
    k2?: number | string
    k3?: number | string
    k4?: number | string
}

interface ScriptSVGFeConvolveMatrixAttributes extends ScriptSVGFilterPrimitiveAttributes {
    order?: number | string
    kernelMatrix?: string
    divisor?: number | string
    bias?: number | string
    targetX?: number | string
    targetY?: number | string
    edgeMode?: 'duplicate' | 'wrap' | 'none'
    kernelUnitLength?: string
    preserveAlpha?: boolean | 'true' | 'false'
}

interface ScriptSVGFeDiffuseLightingAttributes extends ScriptSVGFilterPrimitiveAttributes {
    surfaceScale?: number | string
    diffuseConstant?: number | string
    kernelUnitLength?: string
    'lighting-color'?: string
}

interface ScriptSVGFeDisplacementMapAttributes extends ScriptSVGFilterPrimitiveAttributes {
    in2?: string
    scale?: number | string
    xChannelSelector?: 'R' | 'G' | 'B' | 'A'
    yChannelSelector?: 'R' | 'G' | 'B' | 'A'
}

interface ScriptSVGFeDistantLightAttributes extends ScriptSVGCommonAttributes {
    azimuth?: number | string
    elevation?: number | string
}

interface ScriptSVGFeDropShadowAttributes extends ScriptSVGFilterPrimitiveAttributes {
    dx?: number | string
    dy?: number | string
    stdDeviation?: number | string
    'flood-color'?: string
    'flood-opacity'?: number | string
}

interface ScriptSVGFeFloodAttributes extends ScriptSVGFilterPrimitiveAttributes {
    'flood-color'?: string
    'flood-opacity'?: number | string
}

interface ScriptSVGFeFuncAttributes extends ScriptSVGCommonAttributes {
    type?: 'identity' | 'table' | 'discrete' | 'linear' | 'gamma'
    tableValues?: string
    slope?: number | string
    intercept?: number | string
    amplitude?: number | string
    exponent?: number | string
    offset?: number | string
}

interface ScriptSVGFeGaussianBlurAttributes extends ScriptSVGFilterPrimitiveAttributes {
    stdDeviation?: number | string
    edgeMode?: 'duplicate' | 'wrap' | 'none'
}

interface ScriptSVGFeMergeAttributes extends ScriptSVGFilterPrimitiveAttributes {}

interface ScriptSVGFeMergeNodeAttributes extends ScriptSVGCommonAttributes {
    in?: string
}

interface ScriptSVGFeMorphologyAttributes extends ScriptSVGFilterPrimitiveAttributes {
    operator?: 'erode' | 'dilate'
    radius?: number | string
}

interface ScriptSVGFeOffsetAttributes extends ScriptSVGFilterPrimitiveAttributes {
    dx?: number | string
    dy?: number | string
}

interface ScriptSVGFePointLightAttributes extends ScriptSVGCommonAttributes {
    x?: number | string
    y?: number | string
    z?: number | string
}

interface ScriptSVGFeSpecularLightingAttributes extends ScriptSVGFilterPrimitiveAttributes {
    surfaceScale?: number | string
    specularConstant?: number | string
    specularExponent?: number | string
    kernelUnitLength?: string
    'lighting-color'?: string
}

interface ScriptSVGFeSpotLightAttributes extends ScriptSVGCommonAttributes {
    x?: number | string
    y?: number | string
    z?: number | string
    pointsAtX?: number | string
    pointsAtY?: number | string
    pointsAtZ?: number | string
    specularExponent?: number | string
    limitingConeAngle?: number | string
}

interface ScriptSVGFeTileAttributes extends ScriptSVGFilterPrimitiveAttributes {}

interface ScriptSVGFeTurbulenceAttributes extends ScriptSVGFilterPrimitiveAttributes {
    baseFrequency?: number | string
    numOctaves?: number | string
    seed?: number | string
    stitchTiles?: 'stitch' | 'noStitch'
    type?: 'fractalNoise' | 'turbulence'
}

// ============================================================================
// Canvas 2D API (paired with <canvas>; ref.current.getContext('2d') is async)
// ============================================================================

/** Linear/radial/conic gradient. Pass as fillStyle/strokeStyle. */
interface ScriptCanvasGradient {
    addColorStop(offset: number, color: string): void
}

/** Image pattern. Pass as fillStyle/strokeStyle. */
interface ScriptCanvasPattern {
    setTransform(transform?: {
        a?: number
        b?: number
        c?: number
        d?: number
        e?: number
        f?: number
    }): void
}

/** Pixel data block. */
interface ScriptImageData {
    readonly width: number
    readonly height: number
    readonly data: Uint8ClampedArray
    readonly colorSpace?: 'srgb' | 'display-p3'
}

/** Geometric path. */
interface ScriptPath2D {
    addPath(path: ScriptPath2D): void
    closePath(): void
    moveTo(x: number, y: number): void
    lineTo(x: number, y: number): void
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
    ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void
    rect(x: number, y: number, w: number, h: number): void
    roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void
}

/** Measurement result from measureText(). */
interface ScriptTextMetrics {
    readonly width: number
    readonly actualBoundingBoxLeft: number
    readonly actualBoundingBoxRight: number
    readonly actualBoundingBoxAscent: number
    readonly actualBoundingBoxDescent: number
    readonly fontBoundingBoxAscent: number
    readonly fontBoundingBoxDescent: number
    readonly hangingBaseline: number
    readonly alphabeticBaseline: number
    readonly ideographicBaseline: number
}

/**
 * Script-side wrapper for CanvasRenderingContext2D.
 */
interface ScriptCanvasRenderingContext2D {
    readonly canvas: { width: number; height: number }

    // Drawing state
    fillStyle: string | ScriptCanvasGradient | ScriptCanvasPattern
    strokeStyle: string | ScriptCanvasGradient | ScriptCanvasPattern
    filter: string
    globalAlpha: number
    globalCompositeOperation: string
    imageSmoothingEnabled: boolean
    imageSmoothingQuality: 'low' | 'medium' | 'high'
    lineCap: 'butt' | 'round' | 'square'
    lineDashOffset: number
    lineJoin: 'round' | 'bevel' | 'miter'
    lineWidth: number
    miterLimit: number
    shadowBlur: number
    shadowColor: string
    shadowOffsetX: number
    shadowOffsetY: number

    // Text state
    direction: 'ltr' | 'rtl' | 'inherit'
    font: string
    fontKerning: 'auto' | 'normal' | 'none'
    fontStretch: string
    fontVariantCaps: string
    letterSpacing: string
    textAlign: 'start' | 'end' | 'left' | 'right' | 'center'
    textBaseline: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom'
    textRendering: 'auto' | 'optimizeSpeed' | 'optimizeLegibility' | 'geometricPrecision'
    wordSpacing: string

    // State stack
    save(): void
    restore(): void
    reset(): void

    // Transformations
    scale(x: number, y: number): void
    rotate(angle: number): void
    translate(x: number, y: number): void
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
    resetTransform(): void
    getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number }

    // Path building
    beginPath(): void
    closePath(): void
    moveTo(x: number, y: number): void
    lineTo(x: number, y: number): void
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
    ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void
    rect(x: number, y: number, w: number, h: number): void
    roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void

    // Drawing paths
    fill(fillRule?: 'nonzero' | 'evenodd'): void
    fill(path: ScriptPath2D, fillRule?: 'nonzero' | 'evenodd'): void
    stroke(): void
    stroke(path: ScriptPath2D): void
    clip(fillRule?: 'nonzero' | 'evenodd'): void
    clip(path: ScriptPath2D, fillRule?: 'nonzero' | 'evenodd'): void
    isPointInPath(x: number, y: number, fillRule?: 'nonzero' | 'evenodd'): boolean
    isPointInPath(path: ScriptPath2D, x: number, y: number, fillRule?: 'nonzero' | 'evenodd'): boolean
    isPointInStroke(x: number, y: number): boolean
    isPointInStroke(path: ScriptPath2D, x: number, y: number): boolean

    // Rectangles
    fillRect(x: number, y: number, w: number, h: number): void
    strokeRect(x: number, y: number, w: number, h: number): void
    clearRect(x: number, y: number, w: number, h: number): void

    // Text
    fillText(text: string, x: number, y: number, maxWidth?: number): void
    strokeText(text: string, x: number, y: number, maxWidth?: number): void
    measureText(text: string): ScriptTextMetrics

    // Line dashes
    setLineDash(segments: number[]): void
    getLineDash(): number[]

    // Images and pixel data
    drawImage(image: ScriptCanvasImageSource, dx: number, dy: number): void
    drawImage(image: ScriptCanvasImageSource, dx: number, dy: number, dWidth: number, dHeight: number): void
    drawImage(image: ScriptCanvasImageSource, sx: number, sy: number, sWidth: number, sHeight: number, dx: number, dy: number, dWidth: number, dHeight: number): void
    createImageData(width: number, height: number): ScriptImageData
    createImageData(data: ScriptImageData): ScriptImageData
    getImageData(sx: number, sy: number, sw: number, sh: number): ScriptImageData
    putImageData(imageData: ScriptImageData, dx: number, dy: number): void
    putImageData(imageData: ScriptImageData, dx: number, dy: number, dirtyX: number, dirtyY: number, dirtyWidth: number, dirtyHeight: number): void

    // Gradients & patterns
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): ScriptCanvasGradient
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): ScriptCanvasGradient
    createConicGradient(startAngle: number, x: number, y: number): ScriptCanvasGradient
    createPattern(image: ScriptCanvasImageSource, repetition: string | null): ScriptCanvasPattern | null
}

/** Values accepted as image sources by canvas drawing methods. */
type ScriptCanvasImageSource = ScriptImageBitmap | ScriptCanvasElement

interface ScriptTableCellAttributes extends ScriptHTMLAttributes<HTMLTableCellElement> {
    colspan?: number
    rowspan?: number
    scope?: string
    headers?: string
}

// ============================================================================
// Global declarations
// ============================================================================

// Preact core
function h(type: string | Function, props?: Record<string, any> | null, ...children: any[]): preact.VNode
function Fragment(props: { children?: preact.ComponentChildren }): preact.VNode
function render(vnode: preact.VNode | null, parent: Element): void

// Hooks
function useState<T>(initialValue: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void]
function useReducer<S, A>(reducer: (state: S, action: A) => S, initialState: S): [S, (action: A) => void]
function useMemo<T>(factory: () => T, deps: any[]): T
function useRef<T>(initialValue: T): { current: T }
function useEffect(effect: () => void | (() => void), deps?: any[]): void
function useLayoutEffect(effect: () => void | (() => void), deps?: any[]): void
function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T
function useContext<T>(context: preact.Context<T>): T
function useSyncExternalStore<T>(subscribe: (callback: () => void) => () => void, getSnapshot: () => T): T

// Context & portals
function createContext<T>(defaultValue: T): preact.Context<T>
function createPortal(vnode: preact.VNode, container: Element): preact.VNode

// Store (cross-tree state)
function createStore<T>(initialValue: T): ScriptStore<T>
function useStore<T>(store: ScriptStore<T>): [T, ScriptStore<T>['set']]
function useStoreValue<T>(store: ScriptStore<T>): T
function useSetStore<T>(store: ScriptStore<T>): ScriptStore<T>['set']

// Canvas — Path2D constructor available as a global.
declare const Path2D: {
    new (path?: ScriptPath2D | string): ScriptPath2D
}

/** Constructor reference for the bitmap returned by `createImageBitmap`. */
declare const ImageBitmap: {
    readonly prototype: ScriptImageBitmap
}

/**
 * Decode an image into a bitmap suitable for `ctx.drawImage`.
 *
 * Accepts:
 * - A `data:` URL string (network URLs are not permitted from scripts).
 * - An `ScriptImageData` obtained from `ctx.getImageData`.
 *
 * Returns a promise that resolves with the decoded bitmap. Call `close()` on
 * the result when finished to release resources.
 */
function createImageBitmap(source: string | ScriptImageData): Promise<ScriptImageBitmap>

// JSX namespace
namespace JSX {
    type Element = preact.VNode

    interface IntrinsicAttributes {
        key?: string | number | null
    }

    interface ElementChildrenAttribute {
        children: {}
    }

    interface IntrinsicElements {
        // Structural
        div: ScriptHTMLAttributes
        span: ScriptHTMLAttributes
        section: ScriptHTMLAttributes
        article: ScriptHTMLAttributes
        aside: ScriptHTMLAttributes
        header: ScriptHTMLAttributes
        footer: ScriptHTMLAttributes
        nav: ScriptHTMLAttributes
        main: ScriptHTMLAttributes

        // Text
        p: ScriptHTMLAttributes
        h1: ScriptHTMLAttributes
        h2: ScriptHTMLAttributes
        h3: ScriptHTMLAttributes
        h4: ScriptHTMLAttributes
        h5: ScriptHTMLAttributes
        h6: ScriptHTMLAttributes
        blockquote: ScriptHTMLAttributes
        pre: ScriptHTMLAttributes
        code: ScriptHTMLAttributes
        br: ScriptHTMLAttributes
        hr: ScriptHTMLAttributes
        small: ScriptHTMLAttributes
        strong: ScriptHTMLAttributes
        em: ScriptHTMLAttributes
        b: ScriptHTMLAttributes
        i: ScriptHTMLAttributes
        u: ScriptHTMLAttributes
        s: ScriptHTMLAttributes
        sub: ScriptHTMLAttributes
        sup: ScriptHTMLAttributes
        mark: ScriptHTMLAttributes
        abbr: ScriptHTMLAttributes
        cite: ScriptHTMLAttributes
        kbd: ScriptHTMLAttributes
        samp: ScriptHTMLAttributes
        var: ScriptHTMLAttributes
        wbr: ScriptHTMLAttributes

        // Ruby
        ruby: ScriptHTMLAttributes
        rt: ScriptHTMLAttributes
        rp: ScriptHTMLAttributes
        rb: ScriptHTMLAttributes
        rtc: ScriptHTMLAttributes

        // Lists
        ul: ScriptHTMLAttributes
        ol: ScriptHTMLAttributes & { start?: number; reversed?: boolean; type?: '1' | 'a' | 'A' | 'i' | 'I' }
        li: ScriptHTMLAttributes
        dl: ScriptHTMLAttributes
        dt: ScriptHTMLAttributes
        dd: ScriptHTMLAttributes

        // Tables
        table: ScriptHTMLAttributes
        thead: ScriptHTMLAttributes
        tbody: ScriptHTMLAttributes
        tfoot: ScriptHTMLAttributes
        tr: ScriptHTMLAttributes
        th: ScriptTableCellAttributes
        td: ScriptTableCellAttributes
        caption: ScriptHTMLAttributes
        colgroup: ScriptHTMLAttributes
        col: ScriptHTMLAttributes & { span?: number }

        // Interactive
        button: ScriptButtonAttributes
        details: ScriptHTMLAttributes & { open?: boolean }
        summary: ScriptHTMLAttributes
        dialog: ScriptHTMLAttributes & { open?: boolean }
        meter: ScriptHTMLAttributes & {
            value?: number | string
            min?: number | string
            max?: number | string
            low?: number | string
            high?: number | string
            optimum?: number | string
        }
        progress: ScriptHTMLAttributes & { value?: number | string; max?: number | string }

        // Form
        input: ScriptInputAttributes
        select: ScriptSelectAttributes
        option: ScriptOptionAttributes
        optgroup: ScriptHTMLAttributes & { label?: string; disabled?: boolean }
        textarea: ScriptTextareaAttributes
        label: ScriptHTMLAttributes & { for?: string }
        fieldset: ScriptHTMLAttributes & { disabled?: boolean }
        legend: ScriptHTMLAttributes
        output: ScriptHTMLAttributes
        datalist: ScriptHTMLAttributes

        // Image
        img: ScriptImgAttributes

        // Canvas
        canvas: ScriptCanvasAttributes

        // Figure
        figure: ScriptHTMLAttributes
        figcaption: ScriptHTMLAttributes

        // Other
        address: ScriptHTMLAttributes
        time: ScriptHTMLAttributes & { datetime?: string }
        data: ScriptHTMLAttributes & { value?: string }

        // SVG — root & containers
        svg: ScriptSVGSvgAttributes
        g: ScriptSVGGAttributes
        defs: ScriptSVGDefsAttributes
        symbol: ScriptSVGSymbolAttributes
        // SVG — accessibility metadata
        title: ScriptSVGTitleOrDescAttributes
        desc: ScriptSVGTitleOrDescAttributes
        // SVG — shapes
        path: ScriptSVGPathAttributes
        rect: ScriptSVGRectAttributes
        circle: ScriptSVGCircleAttributes
        ellipse: ScriptSVGEllipseAttributes
        line: ScriptSVGLineAttributes
        polyline: ScriptSVGPolyAttributes
        polygon: ScriptSVGPolyAttributes
        // SVG — text
        text: ScriptSVGTextAttributes
        tspan: ScriptSVGTSpanAttributes
        textPath: ScriptSVGTextPathAttributes
        // SVG — gradients & patterns
        linearGradient: ScriptSVGLinearGradientAttributes
        radialGradient: ScriptSVGRadialGradientAttributes
        stop: ScriptSVGStopAttributes
        pattern: ScriptSVGPatternAttributes
        // SVG — clipping, masking, markers
        mask: ScriptSVGMaskAttributes
        clipPath: ScriptSVGClipPathAttributes
        marker: ScriptSVGMarkerAttributes
        // SVG — filters
        filter: ScriptSVGFilterAttributes
        feBlend: ScriptSVGFeBlendAttributes
        feColorMatrix: ScriptSVGFeColorMatrixAttributes
        feComponentTransfer: ScriptSVGFeComponentTransferAttributes
        feComposite: ScriptSVGFeCompositeAttributes
        feConvolveMatrix: ScriptSVGFeConvolveMatrixAttributes
        feDiffuseLighting: ScriptSVGFeDiffuseLightingAttributes
        feDisplacementMap: ScriptSVGFeDisplacementMapAttributes
        feDistantLight: ScriptSVGFeDistantLightAttributes
        feDropShadow: ScriptSVGFeDropShadowAttributes
        feFlood: ScriptSVGFeFloodAttributes
        feFuncA: ScriptSVGFeFuncAttributes
        feFuncB: ScriptSVGFeFuncAttributes
        feFuncG: ScriptSVGFeFuncAttributes
        feFuncR: ScriptSVGFeFuncAttributes
        feGaussianBlur: ScriptSVGFeGaussianBlurAttributes
        feMerge: ScriptSVGFeMergeAttributes
        feMergeNode: ScriptSVGFeMergeNodeAttributes
        feMorphology: ScriptSVGFeMorphologyAttributes
        feOffset: ScriptSVGFeOffsetAttributes
        fePointLight: ScriptSVGFePointLightAttributes
        feSpecularLighting: ScriptSVGFeSpecularLightingAttributes
        feSpotLight: ScriptSVGFeSpotLightAttributes
        feTile: ScriptSVGFeTileAttributes
        feTurbulence: ScriptSVGFeTurbulenceAttributes
    }
}
