export class Debouncer {
  private debounceMap: Map<string, number> = new Map();

  public async debounceAction(
    key: string,
    action: () => Promise<void>,
    delay: number,
  ): Promise<void> {
    if (this.debounceMap.has(key)) {
      await api.v1.timers.clearTimeout(this.debounceMap.get(key)!);
    }
    const id = await api.v1.timers.setTimeout(async () => {
      await action();
      this.debounceMap.delete(key);
    }, delay);
    this.debounceMap.set(key, id);
  }

  public async cancel(key: string): Promise<void> {
    if (this.debounceMap.has(key)) {
      await api.v1.timers.clearTimeout(this.debounceMap.get(key)!);
      this.debounceMap.delete(key);
    }
  }

  public async cancelAll(): Promise<void> {
    for (const key of this.debounceMap.keys()) {
      await this.cancel(key);
    }
  }
}
