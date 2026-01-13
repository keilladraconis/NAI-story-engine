export type Subscription = () => void;

export class Subscribable<T = void> {
  private listeners: ((payload: T) => void)[] = [];

  public subscribe(listener: (payload: T) => void): Subscription {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public notify(payload: T): void {
    this.listeners.forEach((listener) => listener(payload));
  }

  public clearListeners(): void {
    this.listeners = [];
  }
}
