// NAI TYPE DOCUMENTATION OVERRIDE
namespace api.v1.script {
  function countUncachedInputTokens(
    messages: Message[],
    model: string,
  ): Promise<number>;
}

// NAI TYPE DOCUMENTATION OVERRIDE
//
// onHistoryNavigated's nodeId/previousNodeId are declared `string` upstream but
// arrive as `number` at runtime, matching document.history.currentNodeId().
// Measured — see the v15 design §12.1. Reported to NovelAI.
//
// OnHistoryNavigated is a type alias so it cannot be augmented, and declaration
// merging cannot change a member's type on the HookCallbacks interface. A merged
// namespace declaration adds a register OVERLOAD instead: the generic
// register<K extends keyof HookCallbacks> is tried first, fails to accept a
// number-typed callback, and resolution falls through to this one.
namespace api.v1.hooks {
  function register(
    hookName: "onHistoryNavigated",
    callback: (params: {
      nodeId: number;
      previousNodeId: number;
      direction: "forward" | "backward" | "both";
      distance: number;
      cause: "undo" | "redo" | "retry" | "jump";
    }) => void | Promise<void>,
  ): void;
}
